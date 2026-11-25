import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Saves and loads everything in a SQLite database (data/music.db) through JDBC.
 *
 * Tables:
 *   songs           id, title, artist, album, genre, year, duration, play_count, liked
 *   playlists       id, name
 *   playlist_songs  playlist_id, position, song_id, added_at      (position = play order)
 *   recent          position, song_id                             (position 0 = newest)
 *   queue_items     position, song_id                             (position 0 = plays next)
 *   state           key, value                                    (repeat, current song, ...)
 *
 * The engine keeps its lists in memory while running; load() reads the tables once at start-up and
 * save() rewrites them inside one transaction (all or nothing) after every change.
 * The first time the app runs the database is empty, so sample songs and playlists are created.
 */
public class DataStore {
    private final Path dir;

    DataStore(Path dir) {
        this.dir = dir;
    }

    /** Opens the database file (creating it and its tables on first use). */
    private Connection open() throws SQLException, IOException {
        Files.createDirectories(dir);
        Connection c = DriverManager.getConnection("jdbc:sqlite:" + dir.resolve("music.db"));
        try (Statement st = c.createStatement()) {
            st.executeUpdate("CREATE TABLE IF NOT EXISTS songs (id INTEGER PRIMARY KEY, title TEXT NOT NULL, artist TEXT NOT NULL,"
                    + " album TEXT NOT NULL, genre TEXT NOT NULL, year INTEGER NOT NULL, duration INTEGER NOT NULL,"
                    + " play_count INTEGER NOT NULL DEFAULT 0, liked INTEGER NOT NULL DEFAULT 0)");
            st.executeUpdate("CREATE TABLE IF NOT EXISTS playlists (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
            st.executeUpdate("CREATE TABLE IF NOT EXISTS playlist_songs (playlist_id INTEGER NOT NULL, position INTEGER NOT NULL,"
                    + " song_id INTEGER NOT NULL, added_at INTEGER NOT NULL, PRIMARY KEY (playlist_id, position))");
            st.executeUpdate("CREATE TABLE IF NOT EXISTS recent (position INTEGER PRIMARY KEY, song_id INTEGER NOT NULL)");
            st.executeUpdate("CREATE TABLE IF NOT EXISTS queue_items (position INTEGER PRIMARY KEY, song_id INTEGER NOT NULL)");
            st.executeUpdate("CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
        }
        return c;
    }

    void load(MusicEngine e) throws IOException {
        try (Connection c = open()) {
            boolean empty;
            try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM songs")) {
                empty = rs.getInt(1) == 0;
            }
            if (empty) {
                seed(e);
                save(e);
                System.out.println("First run: created sample songs in " + dir.resolve("music.db"));
                return;
            }

            try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery("SELECT * FROM songs ORDER BY id")) {
                while (rs.next()) {
                    Song s = new Song(rs.getInt("id"), rs.getString("title"), rs.getString("artist"), rs.getString("album"),
                            rs.getString("genre"), rs.getInt("year"), rs.getInt("duration"),
                            rs.getInt("play_count"), rs.getInt("liked") != 0);
                    e.songs.put(s.id, s);
                }
            }

            // Built-in lists have negative ids, so ordering by id descending keeps the user's playlists first
            // and then Liked Songs and All Songs, matching the order they were created in.
            try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery("SELECT * FROM playlists ORDER BY rowid")) {
                while (rs.next()) {
                    Playlist p = new Playlist(rs.getInt("id"), rs.getString("name"));
                    e.playlists.put(p.id, p);
                }
            }
            try (Statement st = c.createStatement();
                 ResultSet rs = st.executeQuery("SELECT * FROM playlist_songs ORDER BY playlist_id, position")) {
                while (rs.next()) {
                    Playlist p = e.playlists.get(rs.getInt("playlist_id"));
                    if (p == null) continue;
                    long time = rs.getLong("added_at");
                    p.add(rs.getInt("song_id"), time);
                    e.lastStamp = Math.max(e.lastStamp, time);
                }
            }
            try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery("SELECT song_id FROM recent ORDER BY position")) {
                while (rs.next()) e.playback.recent.addLast(rs.getInt(1));
            }
            try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery("SELECT song_id FROM queue_items ORDER BY position")) {
                while (rs.next()) e.playback.queue.addLast(rs.getInt(1));
            }

            Map<String, String> state = new HashMap<>();
            try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery("SELECT key, value FROM state")) {
                while (rs.next()) state.put(rs.getString(1), rs.getString(2));
            }
            try {
                e.playback.repeat = state.getOrDefault("repeat", "off");
                if (!List.of("off", "all", "one").contains(e.playback.repeat)) e.playback.repeat = "off";
                e.playback.activePlaylistId = Integer.parseInt(state.getOrDefault("activePlaylist", "-1"));
                e.playback.currentSongId = Integer.parseInt(state.getOrDefault("currentSong", "-1"));
                e.playback.playlistPosSongId = Integer.parseInt(state.getOrDefault("playlistPos", "" + e.playback.currentSongId));
                e.nextPlaylistId = Integer.parseInt(state.getOrDefault("nextPlaylistId", "1"));
            } catch (RuntimeException ex) {
                System.out.println("Could not read the saved player state fully, using defaults where needed");
            }
            e.ensureBuiltIns();
        } catch (SQLException ex) {
            throw new IOException("Database error: " + ex.getMessage(), ex);
        }
    }

    /** Rewrites every table inside one transaction: either everything is saved or nothing changes. */
    void save(MusicEngine e) throws IOException {
        try (Connection c = open()) {
            c.setAutoCommit(false);
            try {
                try (Statement st = c.createStatement()) {
                    for (String table : List.of("songs", "playlists", "playlist_songs", "recent", "queue_items", "state")) {
                        st.executeUpdate("DELETE FROM " + table);
                    }
                }
                try (PreparedStatement ps = c.prepareStatement("INSERT INTO songs VALUES (?,?,?,?,?,?,?,?,?)")) {
                    for (Song s : e.songs.values()) {
                        ps.setInt(1, s.id);
                        ps.setString(2, s.title);
                        ps.setString(3, s.artist);
                        ps.setString(4, s.album);
                        ps.setString(5, s.genre);
                        ps.setInt(6, s.year);
                        ps.setInt(7, s.duration);
                        ps.setInt(8, s.playCount);
                        ps.setInt(9, s.liked ? 1 : 0);
                        ps.addBatch();
                    }
                    ps.executeBatch();
                }
                try (PreparedStatement pl = c.prepareStatement("INSERT INTO playlists (id, name) VALUES (?,?)");
                     PreparedStatement ps = c.prepareStatement("INSERT INTO playlist_songs VALUES (?,?,?,?)")) {
                    for (Playlist p : e.playlists.values()) {
                        pl.setInt(1, p.id);
                        pl.setString(2, p.name);
                        pl.addBatch();
                        int position = 0;
                        for (int songId : p.songIds) {
                            ps.setInt(1, p.id);
                            ps.setInt(2, position++);
                            ps.setInt(3, songId);
                            ps.setLong(4, p.addedAt.get(songId));
                            ps.addBatch();
                        }
                    }
                    pl.executeBatch();
                    ps.executeBatch();
                }
                saveIds(c, "recent", e.playback.recent);
                saveIds(c, "queue_items", e.playback.queue);
                try (PreparedStatement ps = c.prepareStatement("INSERT INTO state VALUES (?,?)")) {
                    Map<String, String> state = Map.of(
                            "repeat", e.playback.repeat,
                            "activePlaylist", "" + e.playback.activePlaylistId,
                            "currentSong", "" + e.playback.currentSongId,
                            "playlistPos", "" + e.playback.playlistPosSongId,
                            "nextPlaylistId", "" + e.nextPlaylistId);
                    for (Map.Entry<String, String> entry : state.entrySet()) {
                        ps.setString(1, entry.getKey());
                        ps.setString(2, entry.getValue());
                        ps.addBatch();
                    }
                    ps.executeBatch();
                }
                c.commit();
            } catch (SQLException ex) {
                c.rollback();
                throw ex;
            }
        } catch (SQLException ex) {
            throw new IOException("Database error: " + ex.getMessage(), ex);
        }
    }

    private static void saveIds(Connection c, String table, Iterable<Integer> ids) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO " + table + " VALUES (?,?)")) {
            int position = 0;
            for (int id : ids) {
                ps.setInt(1, position++);
                ps.setInt(2, id);
                ps.addBatch();
            }
            ps.executeBatch();
        }
    }

    // ------------------------------------------------------------------ sample data (first run only)

    /**
     * The library on first run: the songs listed in songs/Songs.txt.
     * Lengths are the album versions; when you add a song's audio file, its real length replaces this.
     * Year 0 means not known. (Bure Din's album and year could not be confirmed; Bure Din and
     * Tu Aake Dekhle get their real length from the audio file.)
     */
    private static final String[] SAMPLE_SONGS = {
        // title | artist | album | genre | year | seconds
        "What Do You Mean?|Justin Bieber|Purpose|Pop|2015|205",
        "Die For You|The Weeknd|Starboy|R&B|2016|260",
        "Blinding Lights|The Weeknd|After Hours|Synth-pop|2020|200",
        "Bure Din|Seedhe Maut|Unknown album|Hip-hop|0|180",
        "Tu Aake Dekhle|King|The Carnival|Hip-hop|2020|180",
        "Call Out My Name|The Weeknd|My Dear Melancholy,|R&B|2018|228",
        "Ivy|Frank Ocean|Blonde|R&B|2016|249",
        "Attention|Charlie Puth|Voicenotes|Pop|2018|211",
        "Treat You Better|Shawn Mendes|Illuminate|Pop|2016|187",
    };

    private void seed(MusicEngine e) {
        int id = 1;
        for (String row : SAMPLE_SONGS) {
            String[] f = row.split("\\|");
            Song s = new Song(id, f[0], f[1], f[2], f[3], Integer.parseInt(f[4]), Integer.parseInt(f[5]), 0, false);
            e.songs.put(s.id, s);
            id++;
        }
        e.ensureBuiltIns();

        Playlist weeknd = e.createPlaylist("The Weeknd Mix");
        for (int songId : new int[] {3, 2, 6}) e.addSong(weeknd.id, songId);

        Playlist desi = e.createPlaylist("Desi Hip-Hop");
        for (int songId : new int[] {4, 5}) e.addSong(desi.id, songId);

        Playlist rnb = e.createPlaylist("Late Night R&B");
        for (int songId : new int[] {7, 2, 6}) e.addSong(rnb.id, songId);

        Playlist pop = e.createPlaylist("Pop Hits");
        for (int songId : new int[] {1, 8, 9, 3}) e.addSong(pop.id, songId);
    }
}
