import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * A playlist is an ordered list of song ids.
 * The order of songIds IS the play order, so shuffle and sort simply reorder this list.
 * addedAt remembers when each song was added (used by the "date added" sort).
 *
 * Ids below zero are built-in lists: -1 = All Songs, -2 = Liked Songs.
 */
public class Playlist {
    final int id;
    String name;
    final List<Integer> songIds = new ArrayList<>();
    final Map<Integer, Long> addedAt = new HashMap<>();

    Playlist(int id, String name) {
        this.id = id;
        this.name = name;
    }

    boolean isBuiltIn() {
        return id < 0;
    }

    boolean contains(int songId) {
        return addedAt.containsKey(songId);
    }

    void add(int songId, long time) {
        if (contains(songId)) return;
        songIds.add(songId);
        addedAt.put(songId, time);
    }

    void remove(int songId) {
        songIds.remove(Integer.valueOf(songId));   // remove the value, not the index
        addedAt.remove(songId);
    }
}
