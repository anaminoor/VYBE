import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The collection of every song, plus artist and album grouping.
 *
 * Data structure: a LinkedHashMap from song id to Song.
 *   - lookup by id is O(1), which every other part of the engine needs;
 *   - it remembers insertion order, so "All Songs" lists songs in the order they were added.
 * Playlists only store song ids, so editing a song here changes it everywhere.
 */
class Library {
    final Map<Integer, Song> songs = new LinkedHashMap<>();
    int nextSongId = 1;

    Song song(int id) {
        Song s = songs.get(id);
        if (s == null) throw new IllegalArgumentException("Song not found: " + id);
        return s;
    }

    /** Adds a new song after checking the form values. */
    Song create(String title, String artist, String album, String genre, String year, String duration) {
        Song s = SongValidator.validate(nextSongId, title, artist, album, genre, year, duration, songs.values());
        nextSongId++;
        songs.put(s.id, s);
        return s;
    }

    Song update(int id, String title, String artist, String album, String genre, String year, String duration) {
        Song s = song(id);
        Song v = SongValidator.validate(id, title, artist, album, genre, year, duration, songs.values());
        s.title = v.title;
        s.artist = v.artist;
        s.album = v.album;
        s.genre = v.genre;
        s.year = v.year;
        s.duration = v.duration;
        return s;
    }

    /** The browser measured the real length of a song's audio file: keep it. */
    Song setDuration(int id, int seconds) {
        Song s = song(id);
        if (seconds < 1 || seconds > 6 * 3600) throw new IllegalArgumentException("Length out of range");
        s.duration = seconds;
        return s;
    }

    // ------------------------------------------------------------------ artists and albums

    List<MusicEngine.ArtistInfo> artists() {
        Map<String, int[]> totals = new LinkedHashMap<>();     // songs, plays, seconds
        Map<String, String> names = new LinkedHashMap<>();
        for (Song s : songs.values()) {
            String key = s.artist.toLowerCase();
            int[] t = totals.computeIfAbsent(key, k -> new int[3]);
            t[0]++;
            t[1] += s.playCount;
            t[2] += s.duration;
            names.putIfAbsent(key, s.artist);
        }
        List<MusicEngine.ArtistInfo> out = new ArrayList<>();
        for (String key : totals.keySet()) {
            int[] t = totals.get(key);
            out.add(new MusicEngine.ArtistInfo(names.get(key), t[0], t[1], t[2]));
        }
        return out;
    }

    /** All albums, or only one artist's albums when a name is given. */
    List<MusicEngine.AlbumInfo> albums(String artistFilter) {
        Map<String, List<Song>> groups = new LinkedHashMap<>();
        for (Song s : songs.values()) {
            if (artistFilter != null && !s.artist.equalsIgnoreCase(artistFilter)) continue;
            String key = s.album.toLowerCase() + "|" + s.artist.toLowerCase();
            groups.computeIfAbsent(key, k -> new ArrayList<>()).add(s);
        }
        List<MusicEngine.AlbumInfo> out = new ArrayList<>();
        for (List<Song> group : groups.values()) {
            Song first = group.get(0);
            int seconds = 0;
            for (Song s : group) seconds += s.duration;
            out.add(new MusicEngine.AlbumInfo(first.album, first.artist, first.year, group.size(), seconds, first.id));
        }
        return out;
    }

    List<Song> songsByArtist(String name) {
        List<Song> out = new ArrayList<>();
        for (Song s : songs.values()) {
            if (s.artist.equalsIgnoreCase(name == null ? "" : name.trim())) out.add(s);
        }
        if (out.isEmpty()) throw new IllegalArgumentException("Artist not found: " + name);
        out.sort(Comparator.comparingInt((Song s) -> s.year)
                .thenComparing(s -> s.album.toLowerCase())
                .thenComparingInt(s -> s.id));
        return out;
    }

    List<Song> songsByAlbum(String album, String artist) {
        List<Song> out = new ArrayList<>();
        for (Song s : songs.values()) {
            if (s.album.equalsIgnoreCase(album == null ? "" : album.trim())
                    && s.artist.equalsIgnoreCase(artist == null ? "" : artist.trim())) out.add(s);
        }
        if (out.isEmpty()) throw new IllegalArgumentException("Album not found: " + album);
        return out;
    }
}
