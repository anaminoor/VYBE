import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The collection of every song.
 *
 * Data structure: a LinkedHashMap from song id to Song.
 *   - lookup by id is O(1), which every other part of the engine needs;
 *   - it remembers insertion order, so "All Songs" lists songs in the order they were added.
 * Playlists only store song ids, so a change to a song here shows up everywhere.
 */
class Library {
    final Map<Integer, Song> songs = new LinkedHashMap<>();

    Song song(int id) {
        Song s = songs.get(id);
        if (s == null) throw new IllegalArgumentException("Song not found: " + id);
        return s;
    }

    /** The browser measured the real length of a song's audio file: keep it. */
    Song setDuration(int id, int seconds) {
        Song s = song(id);
        if (seconds < 1 || seconds > 6 * 3600) throw new IllegalArgumentException("Length out of range");
        s.duration = seconds;
        return s;
    }
}
