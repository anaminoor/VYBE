import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Tests for the engine. No test library needed: run from the project folder with
 *
 *     java java/Tests.java
 *
 * Every test starts from a fresh engine holding the 9 sample songs (loaded from an empty temp folder).
 */
public class Tests {
    static int passed = 0;
    static int failed = 0;

    interface Body { void run() throws Exception; }

    static void test(String name, Body body) {
        try {
            body.run();
            passed++;
            System.out.println("PASS  " + name);
        } catch (Throwable t) {
            failed++;
            System.out.println("FAIL  " + name + "  ->  " + t);
        }
    }

    static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    static void equal(Object expected, Object actual, String what) {
        if (!expected.equals(actual)) throw new AssertionError(what + ": expected " + expected + " but got " + actual);
    }

    /** Runs the code and checks that it throws IllegalArgumentException (the engine's "bad input" error). */
    static void rejects(Body body, String what) {
        try {
            body.run();
        } catch (IllegalArgumentException e) {
            return;
        } catch (Exception e) {
            throw new AssertionError(what + ": wrong kind of error " + e);
        }
        throw new AssertionError(what + ": should have been rejected");
    }

    static MusicEngine fresh() throws Exception {
        Path dir = Files.createTempDirectory("playlist-test");
        MusicEngine e = new MusicEngine();
        new DataStore(dir).load(e);
        return e;
    }

    static List<Integer> ids(List<Song> songs) {
        List<Integer> out = new ArrayList<>();
        for (Song s : songs) out.add(s.id);
        return out;
    }

    public static void main(String[] args) {
        // ---- 1. add and remove
        test("sample data loads 9 songs", () -> equal(9, fresh().songs.size(), "song count"));

        test("add and remove a song in a playlist", () -> {
            MusicEngine e = fresh();
            int p = e.createPlaylist("Test").id;
            e.addSong(p, 1);
            e.addSong(p, 2);
            equal(List.of(1, 2), e.playlist(p).songIds, "after add");
            e.removeSong(p, 1);
            equal(List.of(2), e.playlist(p).songIds, "after remove");
        });

        test("duplicate add and removing a missing song are rejected", () -> {
            MusicEngine e = fresh();
            int p = e.createPlaylist("Test").id;
            e.addSong(p, 1);
            rejects(() -> e.addSong(p, 1), "duplicate add");
            rejects(() -> e.removeSong(p, 2), "remove missing");
        });

        test("built-in lists can't be edited, duplicate playlist names refused", () -> {
            MusicEngine e = fresh();
            rejects(() -> e.addSong(MusicEngine.LIBRARY_ID, 1), "edit All Songs");
            e.createPlaylist("Gym");
            rejects(() -> e.createPlaylist("gym"), "same name, other case");
            rejects(() -> e.createPlaylist("   "), "empty name");
        });

        // ---- 2. next / previous
        test("next and previous walk through the playlist", () -> {
            MusicEngine e = fresh();
            e.play(MusicEngine.LIBRARY_ID, 1);
            e.next(false);
            equal(2, e.playback.currentSongId, "after next");
            e.previous();
            equal(1, e.playback.currentSongId, "after previous");
        });

        test("repeat off stops at the end, repeat all wraps", () -> {
            MusicEngine e = fresh();
            e.play(MusicEngine.LIBRARY_ID, 9);
            check(e.next(true), "off: should report the end");
            equal(9, e.playback.currentSongId, "off: stays on last song");
            e.setRepeat("all");
            check(!e.next(true), "all: should not end");
            equal(1, e.playback.currentSongId, "all: wraps to first");
            e.previous();
            equal(9, e.playback.currentSongId, "all: previous wraps to last");
        });

        test("repeat one replays the same song when it ends by itself", () -> {
            MusicEngine e = fresh();
            e.setRepeat("one");
            e.play(MusicEngine.LIBRARY_ID, 3);
            e.next(true);
            equal(3, e.playback.currentSongId, "auto next");
            e.next(false);
            equal(4, e.playback.currentSongId, "pressing next still moves on");
            rejects(() -> e.setRepeat("sometimes"), "bad repeat mode");
        });

        test("queue is first-in first-out and the playlist resumes after it", () -> {
            MusicEngine e = fresh();
            e.play(MusicEngine.LIBRARY_ID, 1);
            e.queueAdd(7);
            e.queueAdd(5);
            e.next(false);
            equal(7, e.playback.currentSongId, "first queued");
            e.next(false);
            equal(5, e.playback.currentSongId, "second queued");
            e.next(false);
            equal(2, e.playback.currentSongId, "playlist resumes after song 1");
        });

        // ---- 3. shuffle
        test("shuffle keeps exactly the same songs", () -> {
            MusicEngine e = fresh();
            List<Integer> before = new ArrayList<>(e.playlist(MusicEngine.LIBRARY_ID).songIds);
            e.shuffle(MusicEngine.LIBRARY_ID);
            List<Integer> after = e.playlist(MusicEngine.LIBRARY_ID).songIds;
            equal(before.size(), after.size(), "size");
            equal(new HashSet<>(before), new HashSet<>(after), "same songs");
        });

        // ---- 4. recently played
        test("recently played: newest first, no duplicates, max 20", () -> {
            MusicEngine e = fresh();
            for (int i = 0; i < 30; i++) e.recordPlay(1 + i % 9);
            check(e.playback.recent.size() <= 20, "limit");
            equal(new HashSet<>(e.playback.recent).size(), e.playback.recent.size(), "no duplicates");
            e.recordPlay(4);
            equal(4, e.recentSongs("").get(0).id, "newest first");
        });

        // ---- 5. search
        test("search finds by title or artist, ignoring case", () -> {
            MusicEngine e = fresh();
            List<Integer> byArtist = ids(e.songsOf(MusicEngine.LIBRARY_ID, "WEEKND"));
            equal(3, byArtist.size(), "The Weeknd songs");
            List<Integer> byTitle = ids(e.songsOf(MusicEngine.LIBRARY_ID, "blinding"));
            equal(List.of(3), byTitle, "title search");
            equal(0, e.songsOf(MusicEngine.LIBRARY_ID, "zzzz").size(), "no match");
            equal(9, e.songsOf(MusicEngine.LIBRARY_ID, "").size(), "empty query = everything");
        });

        // ---- 6. sort
        test("every sort field works, ascending and descending", () -> {
            MusicEngine e = fresh();
            for (String field : List.of("title", "artist", "album", "genre", "year", "duration", "plays", "added")) {
                e.sort(MusicEngine.LIBRARY_ID, field, "asc");
                List<Integer> asc = new ArrayList<>(e.playlist(MusicEngine.LIBRARY_ID).songIds);
                e.sort(MusicEngine.LIBRARY_ID, field, "desc");
                equal(9, e.playlist(MusicEngine.LIBRARY_ID).songIds.size(), field + " keeps all songs");
                check(!asc.isEmpty(), field);
            }
            e.sort(MusicEngine.LIBRARY_ID, "title", "asc");
            List<Song> sorted = e.songsOf(MusicEngine.LIBRARY_ID, "");
            for (int i = 1; i < sorted.size(); i++) {
                check(sorted.get(i - 1).title.compareToIgnoreCase(sorted.get(i).title) <= 0, "title order");
            }
            e.sort(MusicEngine.LIBRARY_ID, "duration", "desc");
            sorted = e.songsOf(MusicEngine.LIBRARY_ID, "");
            for (int i = 1; i < sorted.size(); i++) {
                check(sorted.get(i - 1).duration >= sorted.get(i).duration, "duration desc");
            }
            rejects(() -> e.sort(MusicEngine.LIBRARY_ID, "colour", "asc"), "unknown field");
            rejects(() -> e.sort(MusicEngine.LIBRARY_ID, "title", "sideways"), "bad order");
        });

        // ---- extras
        test("queue: remove one song and clear", () -> {
            MusicEngine e = fresh();
            e.queueAdd(4);
            e.queueAdd(6);
            e.queueAdd(8);
            e.queueRemove(1);
            equal(List.of(4, 8), ids(e.queuedSongs()), "after removing the middle one");
            rejects(() -> e.queueRemove(5), "position out of range");
            e.queueClear();
            equal(0, e.queuedSongs().size(), "after clear");
        });

        test("liking a song puts it in Liked Songs", () -> {
            MusicEngine e = fresh();
            e.toggleLike(2);
            check(e.playlist(MusicEngine.LIKED_ID).contains(2), "liked");
            e.toggleLike(2);
            check(!e.playlist(MusicEngine.LIKED_ID).contains(2), "unliked");
        });

        test("save then load gives back the same data", () -> {
            Path dir = Files.createTempDirectory("playlist-roundtrip");
            MusicEngine a = new MusicEngine();
            DataStore store = new DataStore(dir);
            store.load(a);
            int p = a.createPlaylist("Round trip").id;
            a.addSong(p, 3);
            a.addSong(p, 1);
            a.toggleLike(5);
            a.play(p, 3);
            a.queueAdd(8);
            store.save(a);

            MusicEngine b = new MusicEngine();
            new DataStore(dir).load(b);
            equal(List.of(3, 1), b.playlist(p).songIds, "playlist order");
            check(b.song(5).liked, "like kept");
            equal(3, b.playback.currentSongId, "current song");
            equal(List.of(8), new ArrayList<>(b.playback.queue), "queue");
            Set<Integer> recent = new HashSet<>(b.playback.recent);
            check(recent.contains(3), "recently played kept");
        });

        System.out.println();
        System.out.println(passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
