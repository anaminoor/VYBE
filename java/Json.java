import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * Turns engine objects into JSON text for the web page.
 * Only output is needed: the page sends its input as URL parameters.
 */
public class Json {

    /** Text that is already JSON, so it must not be put in quotes again. */
    record Raw(String json) {}

    // ------------------------------------------------------------------ building blocks

    static String str(String s) {
        if (s == null) return "null";
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"':  b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                default:
                    if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
                    else b.append(c);
            }
        }
        return b.append('"').toString();
    }

    /** obj("id", 3, "name", "Chill") -> {"id":3,"name":"Chill"} */
    static String obj(Object... keysAndValues) {
        StringBuilder b = new StringBuilder("{");
        for (int i = 0; i < keysAndValues.length; i += 2) {
            if (i > 0) b.append(',');
            b.append(str((String) keysAndValues[i])).append(':').append(value(keysAndValues[i + 1]));
        }
        return b.append('}').toString();
    }

    private static String value(Object v) {
        if (v == null) return "null";
        if (v instanceof Raw r) return r.json();
        if (v instanceof Song s) return song(s);
        if (v instanceof Number || v instanceof Boolean) return v.toString();
        return str(v.toString());
    }

    /** A JSON array, using the given function to write each item. */
    static <T> Raw list(Collection<T> items, Function<T, String> writer) {
        StringBuilder b = new StringBuilder("[");
        boolean first = true;
        for (T item : items) {
            if (!first) b.append(',');
            b.append(writer.apply(item));
            first = false;
        }
        return new Raw(b.append(']').toString());
    }

    static Raw songs(Collection<Song> list) {
        return list(list, Json::song);
    }

    // ------------------------------------------------------------------ songs and playlists

    /** Where the real audio and cover files are (set by Main); null means none. */
    static MediaFiles media;

    static String song(Song s) {
        return obj("id", s.id, "title", s.title, "artist", s.artist, "album", s.album, "genre", s.genre,
                "year", s.year, "duration", s.duration, "plays", s.playCount, "liked", s.liked,
                "audio", media == null ? null : media.audioUrl(s),
                "cover", media == null ? null : media.coverUrl(s));
    }

    /** Name, cover, size and total length of a playlist (no songs). */
    static String summary(Playlist p, MusicEngine e) {
        int total = 0;
        for (int id : p.songIds) {
            Song s = e.songs.get(id);
            if (s != null) total += s.duration;
        }
        // The first four songs, so the page can draw a 2x2 mosaic cover from their artwork.
        List<Integer> art = p.songIds.subList(0, Math.min(4, p.songIds.size()));
        return obj("id", p.id, "name", p.name, "builtIn", p.isBuiltIn(), "gradient", p.gradient,
                "emoji", p.emoji, "count", p.songIds.size(), "duration", total,
                "art", list(art, String::valueOf));
    }

    /** Every playlist for the sidebar (the temporary artist/album list is left out). */
    static String playlists(MusicEngine e) {
        List<Playlist> shown = e.playlists.values().stream()
                .filter(p -> p.id != MusicEngine.CONTEXT_ID).toList();
        return obj("playlists", list(shown, p -> summary(p, e)));
    }

    /** A playlist with its (possibly filtered) songs. */
    static String playlist(Playlist p, List<Song> songs, MusicEngine e) {
        String summary = summary(p, e);
        return summary.substring(0, summary.length() - 1) + ",\"songs\":" + songs(songs).json() + "}";
    }

    static String recent(List<Song> songs, int total) {
        return obj("total", total, "songs", songs(songs));
    }

    // ------------------------------------------------------------------ player and queue

    static String player(MusicEngine e, boolean ended) {
        Playlist p = e.activePlaylist();
        return obj("playlistId", p.id, "playlistName", p.name, "repeat", e.playback.repeat, "ended", ended,
                "fromQueue", e.playback.currentSongId != e.playback.playlistPosSongId,
                "queueCount", e.playback.queue.size(),
                "song", e.currentSong());
    }

    static String queue(MusicEngine e) {
        return obj("current", e.currentSong(),
                "playlistId", e.activePlaylist().id,
                "playlistName", e.activePlaylist().name,
                "queued", songs(e.queuedSongs()),
                "next", songs(e.upNext(30)));
    }

    /** These are real songs, and their lyrics are not part of this project, so none are sent. */
    static String lyrics(Song s) {
        return obj("songId", s.id, "lines", new Raw("[]"));
    }

    // ------------------------------------------------------------------ artists, albums, home, stats

    static String artistInfo(MusicEngine.ArtistInfo a) {
        return obj("name", a.name(), "songs", a.songs(), "plays", a.plays(), "duration", a.duration());
    }

    static String albumInfo(MusicEngine.AlbumInfo a) {
        return obj("name", a.name(), "artist", a.artist(), "year", a.year(), "songs", a.songs(),
                "duration", a.duration(), "firstSongId", a.firstSongId());
    }

    static String artist(MusicEngine e, String name) {
        List<Song> songs = e.songsByArtist(name);
        int plays = 0;
        int seconds = 0;
        for (Song s : songs) {
            plays += s.playCount;
            seconds += s.duration;
        }
        String realName = songs.get(0).artist;
        return obj("name", realName, "count", songs.size(), "plays", plays, "duration", seconds,
                "songs", songs(songs),
                "albums", list(e.albums(realName), Json::albumInfo));
    }

    static String album(MusicEngine e, String name, String artist) {
        List<Song> songs = e.songsByAlbum(name, artist);
        int seconds = 0;
        for (Song s : songs) seconds += s.duration;
        Song first = songs.get(0);
        return obj("name", first.album, "artist", first.artist, "year", first.year, "genre", first.genre,
                "firstSongId", first.id, "count", songs.size(), "duration", seconds, "songs", songs(songs));
    }

    static String home(MusicEngine e) {
        StatsReport report = new StatsReport(e);
        return obj("recent", songs(StatsReport.first(e.recentSongs(""), 10)),
                "playlists", list(e.userPlaylists(), p -> summary(p, e)),
                "topSongs", songs(StatsReport.first(report.topSongs, 5)),
                "topArtists", list(StatsReport.first(report.topArtists, 6), Json::artistInfo),
                "totalPlays", report.totalPlays,
                "songCount", report.songCount);
    }

    static String stats(MusicEngine e) {
        StatsReport r = new StatsReport(e);
        return obj("totalPlays", r.totalPlays, "secondsListened", r.secondsListened,
                "songs", r.songCount, "artists", r.artistCount, "albums", r.albumCount,
                "playlists", r.playlistCount, "liked", r.likedCount,
                "topSongs", songs(StatsReport.first(r.topSongs, 8)),
                "topArtists", list(StatsReport.first(r.topArtists, 8), Json::artistInfo),
                "genres", list(r.genres, g -> obj("name", g.name(), "songs", g.songs(), "plays", g.plays())));
    }

    /** Results for the command palette: songs, artists, albums and playlists that match. */
    static String searchAll(MusicEngine e, String query) {
        String q = MusicEngine.normalise(query);
        if (q.isEmpty()) {
            return "{\"songs\":[],\"artists\":[],\"albums\":[],\"playlists\":[]}";
        }
        return obj("songs", songs(StatsReport.first(e.songsOf(MusicEngine.LIBRARY_ID, q), 6)),
                "artists", list(StatsReport.first(
                        e.artists().stream().filter(a -> a.name().toLowerCase().contains(q)).toList(), 4), Json::artistInfo),
                "albums", list(StatsReport.first(
                        e.albums(null).stream().filter(a -> a.name().toLowerCase().contains(q)).toList(), 4), Json::albumInfo),
                "playlists", list(StatsReport.first(
                        e.userPlaylists().stream().filter(p -> p.name.toLowerCase().contains(q)).toList(), 4),
                        p -> summary(p, e)));
    }

    // ------------------------------------------------------------------ results

    static String ok() {
        return "{\"ok\":true}";
    }

    static String error(String message) {
        return obj("error", message);
    }

    static String error(String message, Map<String, String> fields) {
        return obj("error", message, "fields",
                new Raw("{" + String.join(",", fields.entrySet().stream()
                        .map(f -> str(f.getKey()) + ":" + str(f.getValue())).toList()) + "}"));
    }
}
