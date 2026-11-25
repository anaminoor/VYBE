import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * What the player is doing: the current song, next / previous, repeat,
 * the "play next" queue and the recently played list.
 *
 * Data structures:
 *   - queue  : ArrayDeque used as a FIFO queue (addLast to join, pollFirst to leave),
 *              so songs play in the order they were queued.
 *   - recent : ArrayDeque, newest first (addFirst); the oldest falls off the back at 20 songs.
 *   - the playlist itself is an ArrayList of ids owned by Playlist; we only remember our place in it.
 */
class PlaybackState {
    static final int RECENT_LIMIT = 20;
    static final int QUEUE_LIMIT = 50;

    private final Map<Integer, Song> songs;
    private final Map<Integer, Playlist> playlists;

    final ArrayDeque<Integer> recent = new ArrayDeque<>();   // newest first
    final ArrayDeque<Integer> queue = new ArrayDeque<>();    // "play next": first in, first out
    String repeat = "off";                                   // off | all | one
    int activePlaylistId = MusicEngine.LIBRARY_ID;           // the playlist the player is moving through
    int currentSongId = -1;                                  // the song that is playing (-1 = nothing yet)
    int playlistPosSongId = -1;                              // our place in the playlist; differs from
                                                             // currentSongId while a queued song plays

    PlaybackState(Map<Integer, Song> songs, Map<Integer, Playlist> playlists) {
        this.songs = songs;
        this.playlists = playlists;
    }

    private Song song(int id) {
        Song s = songs.get(id);
        if (s == null) throw new IllegalArgumentException("Song not found: " + id);
        return s;
    }

    private Playlist playlist(int id) {
        Playlist p = playlists.get(id);
        if (p == null) throw new IllegalArgumentException("Playlist not found: " + id);
        return p;
    }

    Playlist activePlaylist() {
        Playlist p = playlists.get(activePlaylistId);
        if (p == null) {
            activePlaylistId = MusicEngine.LIBRARY_ID;
            p = playlists.get(MusicEngine.LIBRARY_ID);
        }
        return p;
    }

    Song currentSong() {
        return songs.get(currentSongId);
    }

    /** Forget ids of songs / playlists that no longer exist (used after loading and after deleting). */
    void cleanUp() {
        recent.removeIf(id -> !songs.containsKey(id));
        queue.removeIf(id -> !songs.containsKey(id));
        if (!playlists.containsKey(activePlaylistId)) activePlaylistId = MusicEngine.LIBRARY_ID;
        if (!songs.containsKey(currentSongId)) currentSongId = -1;
        if (!songs.containsKey(playlistPosSongId)) playlistPosSongId = currentSongId;
    }

    /** A playlist was deleted: keep the current song and play on from All Songs. */
    void playlistDeleted(int id) {
        if (activePlaylistId == id) {
            activePlaylistId = MusicEngine.LIBRARY_ID;
            playlistPosSongId = currentSongId;
        }
    }

    // ------------------------------------------------------------------ next / previous

    /** Start playing a song inside a playlist; the player then moves through that playlist. */
    void play(int playlistId, int songId) {
        Playlist p = playlist(playlistId);
        Song s = song(songId);
        if (!p.contains(songId)) {
            throw new IllegalArgumentException("\"" + s.title + "\" is not in " + p.name);
        }
        activePlaylistId = playlistId;
        currentSongId = songId;
        playlistPosSongId = songId;
        recordPlay(songId);
    }

    /**
     * Move to the next song. Songs waiting in the "play next" queue go first;
     * after them the playlist carries on from where it was.
     * @param auto true when the song finished by itself (then "repeat one" replays it)
     * @return true if the end of the playlist was reached and nothing new started
     */
    boolean next(boolean auto) {
        if (auto && repeat.equals("one") && currentSong() != null) {
            recordPlay(currentSongId);
            return false;
        }
        if (!queue.isEmpty()) {
            currentSongId = queue.pollFirst();          // FIFO: take from the front
            recordPlay(currentSongId);
            return false;
        }

        Playlist p = activePlaylist();
        if (p.songIds.isEmpty()) return true;

        int index = p.songIds.indexOf(playlistPosSongId);   // -1 if the song was removed: start from the top
        int nextIndex = index + 1;
        if (nextIndex >= p.songIds.size()) {
            if (repeat.equals("off")) return true;      // stop at the end
            nextIndex = 0;                              // repeat: wrap round to the first song
        }
        currentSongId = p.songIds.get(nextIndex);
        playlistPosSongId = currentSongId;
        recordPlay(currentSongId);
        return false;
    }

    void previous() {
        Playlist p = activePlaylist();
        if (p.songIds.isEmpty()) return;

        // After a queued song, "previous" goes back to our place in the playlist.
        if (currentSongId != playlistPosSongId && p.contains(playlistPosSongId)) {
            currentSongId = playlistPosSongId;
            recordPlay(currentSongId);
            return;
        }

        int index = p.songIds.indexOf(playlistPosSongId);
        int prevIndex;
        if (index < 0) prevIndex = 0;
        else if (index == 0) prevIndex = repeat.equals("off") ? 0 : p.songIds.size() - 1;
        else prevIndex = index - 1;

        currentSongId = p.songIds.get(prevIndex);
        playlistPosSongId = currentSongId;
        recordPlay(currentSongId);
    }

    void setRepeat(String mode) {
        if (!List.of("off", "all", "one").contains(mode)) {
            throw new IllegalArgumentException("Repeat must be off, all or one");
        }
        repeat = mode;
    }

    // ------------------------------------------------------------------ "play next" queue (FIFO)

    void queueAdd(int songId) {
        song(songId);
        if (queue.size() >= QUEUE_LIMIT) throw new IllegalArgumentException("The queue is full (" + QUEUE_LIMIT + " songs)");
        queue.addLast(songId);                          // join at the back
    }

    void queueRemove(int index) {
        List<Integer> list = new ArrayList<>(queue);
        if (index < 0 || index >= list.size()) throw new IllegalArgumentException("That song is no longer in the queue");
        list.remove(index);
        queue.clear();
        queue.addAll(list);
    }

    /** Jump straight to a song that is waiting in the queue. */
    void queuePlay(int index) {
        List<Integer> list = new ArrayList<>(queue);
        if (index < 0 || index >= list.size()) throw new IllegalArgumentException("That song is no longer in the queue");
        currentSongId = list.remove(index);
        queue.clear();
        queue.addAll(list);
        recordPlay(currentSongId);
    }

    void queueClear() {
        queue.clear();
    }

    List<Song> queuedSongs() {
        List<Song> out = new ArrayList<>();
        for (int id : queue) out.add(song(id));
        return out;
    }

    /** The songs that will play from the playlist once the queue is empty. */
    List<Song> upNext(int limit) {
        List<Song> out = new ArrayList<>();
        Playlist p = activePlaylist();
        int n = p.songIds.size();
        if (n == 0) return out;

        int index = p.songIds.indexOf(playlistPosSongId);
        int steps = index < 0 ? n : n - 1;              // never list the current song itself
        for (int k = 1; k <= steps && out.size() < limit; k++) {
            int i = index + k;
            if (i >= n) {
                if (repeat.equals("off")) break;        // no repeat: the list ends here
                i = i % n;                              // repeat: carry on from the top
            }
            out.add(song(p.songIds.get(i)));
        }
        return out;
    }

    // ------------------------------------------------------------------ recently played

    void recordPlay(int songId) {
        recent.remove(songId);              // no duplicates: move it to the front instead
        recent.addFirst(songId);
        while (recent.size() > RECENT_LIMIT) recent.removeLast();
        song(songId).playCount++;
    }

    List<Song> recentSongs(String query) {
        String q = MusicEngine.normalise(query);
        List<Song> out = new ArrayList<>();
        for (int id : recent) {
            Song s = songs.get(id);
            if (s != null && (q.isEmpty() || s.matches(q))) out.add(s);
        }
        return out;
    }
}
