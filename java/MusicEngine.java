import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.function.ToIntFunction;

/**
 * VYBE: the one class the web server talks to.
 *
 * It owns the playlists and hands the other jobs to three helpers:
 *   Library        - every song, add / edit, artists and albums   (uses SongValidator for the forms)
 *   PlaybackState  - current song, next / previous, repeat, "play next" queue, recently played
 *   Playlist       - one ordered list of song ids (an ArrayList)
 *
 * Required features:
 *   1. Add and remove songs from playlists      -> addSong, removeSong, moveSong (+ create/rename/delete playlists)
 *   2. Navigate to next and previous songs      -> play, next, previous           (PlaybackState)
 *   3. Shuffle playlist order                   -> shuffle
 *   4. Maintain recently played songs           -> recordPlay, recentSongs        (PlaybackState)
 *   5. Search songs by title or artist          -> songsOf(playlistId, query)
 *   6. Sort songs using different criteria      -> sort
 *
 * Methods throw IllegalArgumentException with a readable message when the input is wrong;
 * the server turns that into an error the web page can show.
 */
public class MusicEngine {
    public static final int LIBRARY_ID = -1;   // "All Songs"
    public static final int LIKED_ID = -2;     // "Liked Songs"
    public static final int CONTEXT_ID = -3;   // temporary list when playing an artist or an album
    public static final int RECENT_LIMIT = PlaybackState.RECENT_LIMIT;
    public static final int QUEUE_LIMIT = PlaybackState.QUEUE_LIMIT;
    public static final int GRADIENTS = 10;    // number of preset playlist cover colours

    /** Totals for one artist. */
    record ArtistInfo(String name, int songs, int plays, int duration) {}

    /** Totals for one album. */
    record AlbumInfo(String name, String artist, int year, int songs, int duration, int firstSongId) {}

    final Library library = new Library();
    final Map<Integer, Song> songs = library.songs;                       // same map, shorter name
    final Map<Integer, Playlist> playlists = new LinkedHashMap<>();
    final PlaybackState playback = new PlaybackState(songs, playlists);

    int nextPlaylistId = 1;
    long lastStamp = 0;

    /** A time stamp that always increases, so "date added" order is never ambiguous. */
    long stamp() {
        lastStamp = Math.max(System.currentTimeMillis(), lastStamp + 1);
        return lastStamp;
    }

    /** Makes sure All Songs holds every song and Liked Songs holds every liked song. */
    void ensureBuiltIns() {
        Playlist all = playlists.get(LIBRARY_ID);
        if (all == null) {
            all = new Playlist(LIBRARY_ID, "All Songs");
            playlists.put(LIBRARY_ID, all);
        }
        Playlist liked = playlists.get(LIKED_ID);
        if (liked == null) {
            liked = new Playlist(LIKED_ID, "Liked Songs");
            playlists.put(LIKED_ID, liked);
        }
        for (Song s : songs.values()) {
            all.add(s.id, stamp());
            if (s.liked) liked.add(s.id, stamp());
            else liked.remove(s.id);
            library.nextSongId = Math.max(library.nextSongId, s.id + 1);
        }
        // Drop ids of songs that no longer exist.
        for (Playlist p : playlists.values()) {
            for (Integer id : new ArrayList<>(p.songIds)) {
                if (!songs.containsKey(id)) p.remove(id);
            }
        }
        playback.cleanUp();
        for (int id : playlists.keySet()) nextPlaylistId = Math.max(nextPlaylistId, id + 1);
    }

    // ------------------------------------------------------------------ lookups

    Song song(int id) {
        return library.song(id);
    }

    Playlist playlist(int id) {
        Playlist p = playlists.get(id);
        if (p == null) throw new IllegalArgumentException("Playlist not found: " + id);
        return p;
    }

    /** A playlist the user made (not All Songs / Liked Songs). */
    private Playlist userPlaylist(int id) {
        Playlist p = playlist(id);
        if (p.isBuiltIn()) {
            throw new IllegalArgumentException("\"" + p.name + "\" is a built-in list and can't be edited this way");
        }
        return p;
    }

    Playlist activePlaylist() {
        return playback.activePlaylist();
    }

    Song currentSong() {
        return playback.currentSong();
    }

    List<Playlist> userPlaylists() {
        List<Playlist> out = new ArrayList<>();
        for (Playlist p : playlists.values()) {
            if (!p.isBuiltIn()) out.add(p);
        }
        return out;
    }

    // ------------------------------------------------------------------ 1. playlists, add / remove / move

    public Playlist createPlaylist(String name) {
        String clean = cleanName(name);
        checkNameFree(clean, 0);
        Playlist p = new Playlist(nextPlaylistId++, clean);
        playlists.put(p.id, p);
        return p;
    }

    public Playlist renamePlaylist(int id, String name) {
        Playlist p = userPlaylist(id);
        String clean = cleanName(name);
        checkNameFree(clean, id);
        p.name = clean;
        return p;
    }

    public void deletePlaylist(int id) {
        userPlaylist(id);
        playlists.remove(id);
        playback.playlistDeleted(id);
    }

    /** Choose the cover of a playlist: a preset colour and an optional emoji. */
    public Playlist setCover(int id, int gradient, String emoji) {
        Playlist p = userPlaylist(id);
        if (gradient < 0 || gradient >= GRADIENTS) throw new IllegalArgumentException("Unknown cover colour");
        String clean = emoji == null ? "" : emoji.replaceAll("[|\\r\\n\\t ]", "");
        if (clean.length() > 16) throw new IllegalArgumentException("Pick a single emoji");
        p.gradient = gradient;
        p.emoji = clean;
        return p;
    }

    public void addSong(int playlistId, int songId) {
        Song s = song(songId);
        Playlist p = userPlaylist(playlistId);
        if (p.contains(songId)) {
            throw new IllegalArgumentException("\"" + s.title + "\" is already in " + p.name);
        }
        p.add(songId, stamp());
    }

    public void removeSong(int playlistId, int songId) {
        Song s = song(songId);
        Playlist p = userPlaylist(playlistId);
        if (!p.contains(songId)) {
            throw new IllegalArgumentException("\"" + s.title + "\" is not in " + p.name);
        }
        p.remove(songId);
    }

    /** Multi-select: add several songs. Songs already in the playlist are skipped. Returns how many were added. */
    public int addSongs(int playlistId, List<Integer> songIds) {
        Playlist p = userPlaylist(playlistId);
        int added = 0;
        for (int songId : songIds) {
            song(songId);
            if (!p.contains(songId)) {
                p.add(songId, stamp());
                added++;
            }
        }
        return added;
    }

    /** Multi-select: remove several songs. Returns how many were removed. */
    public int removeSongs(int playlistId, List<Integer> songIds) {
        Playlist p = userPlaylist(playlistId);
        int removed = 0;
        for (int songId : songIds) {
            if (p.contains(songId)) {
                p.remove(songId);
                removed++;
            }
        }
        return removed;
    }

    /** Drag to reorder: take the song out of the list and put it back at the new position. */
    public void moveSong(int playlistId, int songId, int toIndex) {
        Song s = song(songId);
        Playlist p = userPlaylist(playlistId);
        if (!p.contains(songId)) {
            throw new IllegalArgumentException("\"" + s.title + "\" is not in " + p.name);
        }
        if (toIndex < 0 || toIndex >= p.songIds.size()) {
            throw new IllegalArgumentException("Position is out of range");
        }
        p.songIds.remove(Integer.valueOf(songId));
        p.songIds.add(toIndex, songId);
    }

    private String cleanName(String name) {
        String clean = name == null ? "" : name.replaceAll("[|\\r\\n\\t]", " ").replaceAll(" +", " ").trim();
        if (clean.isEmpty()) throw new IllegalArgumentException("Playlist name can't be empty");
        if (clean.length() > 40) throw new IllegalArgumentException("Playlist name must be 40 characters or fewer");
        return clean;
    }

    private void checkNameFree(String name, int exceptId) {
        for (Playlist p : playlists.values()) {
            if (p.id != exceptId && p.id != CONTEXT_ID && p.name.equalsIgnoreCase(name)) {
                throw new IllegalArgumentException("A playlist called \"" + name + "\" already exists");
            }
        }
    }

    // ------------------------------------------------------------------ 2. next / previous, queue (PlaybackState)

    public void play(int playlistId, int songId) { playback.play(playlistId, songId); }
    public boolean next(boolean auto) { return playback.next(auto); }
    public void previous() { playback.previous(); }
    public void setRepeat(String mode) { playback.setRepeat(mode); }

    public void queueAdd(int songId) { playback.queueAdd(songId); }
    public void queueRemove(int index) { playback.queueRemove(index); }
    public void queuePlay(int index) { playback.queuePlay(index); }
    public void queueClear() { playback.queueClear(); }
    public List<Song> queuedSongs() { return playback.queuedSongs(); }
    public List<Song> upNext(int limit) { return playback.upNext(limit); }

    // ------------------------------------------------------------------ 3. shuffle

    /** Really reorders the playlist. The song that is playing keeps playing. */
    public void shuffle(int playlistId) {
        Collections.shuffle(playlist(playlistId).songIds);
    }

    // ------------------------------------------------------------------ 4. recently played (PlaybackState)

    void recordPlay(int songId) { playback.recordPlay(songId); }
    public List<Song> recentSongs(String query) { return playback.recentSongs(query); }

    // ------------------------------------------------------------------ 5. search

    /** Songs of a playlist in play order, filtered by title or artist when a query is given. */
    public List<Song> songsOf(int playlistId, String query) {
        Playlist p = playlist(playlistId);
        String q = normalise(query);
        List<Song> out = new ArrayList<>();
        for (int id : p.songIds) {
            Song s = songs.get(id);
            if (s != null && (q.isEmpty() || s.matches(q))) out.add(s);
        }
        return out;
    }

    static String normalise(String query) {
        return query == null ? "" : query.trim().toLowerCase();
    }

    // ------------------------------------------------------------------ 6. sort

    /** Reorders the playlist so next / previous follow the sorted order. */
    public void sort(int playlistId, String field, String order) {
        Playlist p = playlist(playlistId);
        Comparator<Integer> cmp = comparator(p, field);
        if ("desc".equals(order)) cmp = cmp.reversed();
        else if (!"asc".equals(order)) throw new IllegalArgumentException("Order must be asc or desc");
        cmp = cmp.thenComparing(byText(s -> s.title));   // ties: alphabetical by title
        p.songIds.sort(cmp);
    }

    private Comparator<Integer> comparator(Playlist p, String field) {
        if (field == null) field = "";
        switch (field) {
            case "title":    return byText(s -> s.title);
            case "artist":   return byText(s -> s.artist);
            case "album":    return byText(s -> s.album);
            case "genre":    return byText(s -> s.genre);
            case "year":     return byNumber(s -> s.year);
            case "duration": return byNumber(s -> s.duration);
            case "plays":    return byNumber(s -> s.playCount);
            case "added":    return Comparator.comparingLong(id -> p.addedAt.getOrDefault(id, 0L));
            default: throw new IllegalArgumentException("Unknown sort field: " + field);
        }
    }

    private Comparator<Integer> byText(Function<Song, String> key) {
        return Comparator.comparing(id -> key.apply(song(id)).toLowerCase());
    }

    private Comparator<Integer> byNumber(ToIntFunction<Song> key) {
        return Comparator.comparingInt(id -> key.applyAsInt(song(id)));
    }

    // ------------------------------------------------------------------ extra: favourites

    public Song toggleLike(int songId) {
        Song s = song(songId);
        setLike(s, !s.liked);
        return s;
    }

    /** Multi-select: like or unlike several songs at once. */
    public void setLiked(List<Integer> songIds, boolean liked) {
        for (int songId : songIds) setLike(song(songId), liked);
    }

    private void setLike(Song s, boolean liked) {
        s.liked = liked;
        Playlist list = playlist(LIKED_ID);
        if (liked) list.add(s.id, stamp());
        else list.remove(s.id);
    }

    // ------------------------------------------------------------------ extra: artists, albums, songs (Library)

    public List<ArtistInfo> artists() { return library.artists(); }
    public List<AlbumInfo> albums(String artistFilter) { return library.albums(artistFilter); }
    public List<Song> songsByArtist(String name) { return library.songsByArtist(name); }
    public List<Song> songsByAlbum(String album, String artist) { return library.songsByAlbum(album, artist); }

    public Song createSong(String title, String artist, String album, String genre, String year, String duration) {
        Song s = library.create(title, artist, album, genre, year, duration);
        playlist(LIBRARY_ID).add(s.id, stamp());
        return s;
    }

    public Song updateSong(int id, String title, String artist, String album, String genre, String year, String duration) {
        return library.update(id, title, artist, album, genre, year, duration);
    }

    public Song setDuration(int id, int seconds) { return library.setDuration(id, seconds); }

    /** "3:45" -> 225. Kept here so callers don't need to know about SongValidator. */
    static int parseDuration(String text) { return SongValidator.parseDuration(text); }

    /**
     * Play an artist or an album. Their songs are copied into a temporary playlist
     * so that next / previous move through just those songs.
     * @param songId the song to start with, or -1 for the first one
     */
    public void playContext(String type, String key, String artist, int songId, boolean shuffle) {
        List<Song> list;
        String label;
        if ("artist".equals(type)) {
            list = songsByArtist(key);
            label = "Artist · " + list.get(0).artist;
        } else if ("album".equals(type)) {
            list = songsByAlbum(key, artist);
            label = "Album · " + list.get(0).album;
        } else {
            throw new IllegalArgumentException("Unknown type: " + type);
        }
        if (shuffle) Collections.shuffle(list);

        Playlist context = new Playlist(CONTEXT_ID, label);
        for (Song s : list) context.add(s.id, stamp());
        playlists.put(CONTEXT_ID, context);
        play(CONTEXT_ID, songId < 0 ? list.get(0).id : songId);
    }
}
