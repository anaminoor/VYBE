import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * VYBE in the terminal: the same MusicEngine and database as the website, with typed commands instead of pages.
 * There is no sound here; "play", "next" and "prev" move through the playlist and count plays just like the website.
 *
 * Start it with:   java -cp "lib/*" java/Main.java cli
 *
 * Before each command the data is loaded fresh from data/music.db and saved again afterwards,
 * so changes made here show up on the website after a restart of the server (and the other way round).
 */
public class Cli {
    private final DataStore store;
    private MusicEngine engine;

    Cli(Path base) {
        this.store = new DataStore(base.resolve("data"));
    }

    void run() throws IOException {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        System.out.println("VYBE (terminal). Type 'help' for commands, 'quit' to leave.");
        while (true) {
            System.out.print("\nvybe> ");
            System.out.flush();
            String line = in.readLine();
            if (line == null) break;
            line = line.trim();
            if (line.isEmpty()) continue;
            if (line.equalsIgnoreCase("quit") || line.equalsIgnoreCase("exit") || line.equalsIgnoreCase("q")) break;

            engine = new MusicEngine();
            store.load(engine);
            try {
                if (handle(line)) store.save(engine);
            } catch (IllegalArgumentException | IndexOutOfBoundsException e) {
                System.out.println("! " + e.getMessage());
            }
        }
        System.out.println("Bye.");
    }

    /** Runs one command. Returns true if something changed and must be saved. */
    private boolean handle(String line) {
        String[] parts = line.split("\\s+", 2);
        String cmd = parts[0].toLowerCase();
        String rest = parts.length > 1 ? parts[1].trim() : "";
        String[] a = rest.isEmpty() ? new String[0] : rest.split("\\s+");

        switch (cmd) {
            case "help", "?" -> help();
            case "songs" -> printSongs("All Songs", engine.songsOf(MusicEngine.LIBRARY_ID, rest));
            case "search" -> {
                need(a, 1, "search <text>");
                printSongs("Search: " + rest, engine.songsOf(MusicEngine.LIBRARY_ID, rest));
            }
            case "playlists", "lists" -> printPlaylists();
            case "show" -> {
                need(a, 1, "show <playlist>");
                Playlist p = engine.playlist(playlistId(a[0]));
                String query = rest.contains(" ") ? rest.substring(rest.indexOf(' ') + 1) : "";
                printSongs(p.name, engine.songsOf(p.id, query));
            }
            case "liked" -> printSongs("Liked Songs", engine.songsOf(MusicEngine.LIKED_ID, ""));
            case "new", "create" -> {
                need(a, 1, "new <name>");
                Playlist p = engine.createPlaylist(rest);
                System.out.println("Created playlist " + p.id + ": " + p.name);
                return true;
            }
            case "rename" -> {
                need(a, 2, "rename <playlist> <new name>");
                Playlist p = engine.renamePlaylist(playlistId(a[0]), rest.substring(rest.indexOf(' ') + 1));
                System.out.println("Renamed to " + p.name);
                return true;
            }
            case "delete" -> {
                need(a, 1, "delete <playlist>");
                Playlist p = engine.playlist(playlistId(a[0]));
                engine.deletePlaylist(p.id);
                System.out.println("Deleted " + p.name);
                return true;
            }
            case "add" -> {
                need(a, 2, "add <playlist> <song> [more songs...]");
                int pl = playlistId(a[0]);
                for (int id : songIds(a, 1)) {
                    engine.addSong(pl, id);
                    System.out.println("Added " + engine.song(id).title + " to " + engine.playlist(pl).name);
                }
                return true;
            }
            case "remove", "rm" -> {
                need(a, 2, "remove <playlist> <song> [more songs...]");
                int pl = playlistId(a[0]);
                for (int id : songIds(a, 1)) {
                    engine.removeSong(pl, id);
                    System.out.println("Removed " + engine.song(id).title + " from " + engine.playlist(pl).name);
                }
                return true;
            }
            case "shuffle" -> {
                need(a, 1, "shuffle <playlist>");
                int pl = playlistId(a[0]);
                engine.shuffle(pl);
                printSongs(engine.playlist(pl).name + " (shuffled)", engine.songsOf(pl, ""));
                return true;
            }
            case "sort" -> {
                need(a, 2, "sort <playlist> <title|artist|album|genre|year|duration|plays|added> [asc|desc]");
                int pl = playlistId(a[0]);
                engine.sort(pl, a[1].toLowerCase(), a.length > 2 ? a[2].toLowerCase() : "asc");
                printSongs(engine.playlist(pl).name, engine.songsOf(pl, ""));
                return true;
            }
            case "play" -> {
                need(a, 1, "play <song>   or   play <playlist> <song>");
                if (a.length == 1) engine.play(MusicEngine.LIBRARY_ID, number(a[0]));
                else engine.play(playlistId(a[0]), number(a[1]));
                nowPlaying();
                return true;
            }
            case "next", "n" -> {
                if (engine.next(false)) System.out.println("End of the playlist.");
                nowPlaying();
                return true;
            }
            case "prev", "previous", "p" -> {
                engine.previous();
                nowPlaying();
                return true;
            }
            case "now" -> nowPlaying();
            case "repeat" -> {
                need(a, 1, "repeat <off|all|one>");
                engine.setRepeat(a[0].toLowerCase());
                System.out.println("Repeat: " + a[0].toLowerCase());
                return true;
            }
            case "like" -> {
                need(a, 1, "like <song>");
                Song s = engine.toggleLike(number(a[0]));
                System.out.println((s.liked ? "Liked " : "Unliked ") + s.title);
                return true;
            }
            case "recent" -> printSongs("Recently played", engine.recentSongs(rest));
            case "queue" -> {
                if (a.length == 0) {
                    printSongs("Play next", engine.queuedSongs());
                    return false;
                }
                switch (a[0].toLowerCase()) {
                    case "add" -> {
                        need(a, 2, "queue add <song>");
                        for (int id : songIds(a, 1)) engine.queueAdd(id);
                        printSongs("Play next", engine.queuedSongs());
                    }
                    case "remove", "rm" -> {
                        need(a, 2, "queue remove <position>");
                        engine.queueRemove(number(a[1]) - 1);
                        printSongs("Play next", engine.queuedSongs());
                    }
                    case "clear" -> {
                        engine.queueClear();
                        System.out.println("Queue cleared.");
                    }
                    default -> throw new IllegalArgumentException("Use: queue, queue add <song>, queue remove <position>, queue clear");
                }
                return true;
            }
            default -> System.out.println("Unknown command '" + cmd + "'. Type 'help'.");
        }
        return false;
    }

    // ------------------------------------------------------------------ printing

    private void help() {
        System.out.println("""
            Songs and playlists are referred to by their number (#). For playlists you can also use 'all' or 'liked'.

              songs [text]                 list all songs (optionally filtered)
              search <text>                search by title or artist
              playlists                    list playlists
              show <playlist> [text]       songs in a playlist
              liked                        liked songs
              new <name>                   create a playlist
              rename <playlist> <name>     rename a playlist
              delete <playlist>            delete a playlist
              add <playlist> <song>...     add one or more songs
              remove <playlist> <song>...  remove one or more songs
              shuffle <playlist>           shuffle the order
              sort <playlist> <field> [asc|desc]
                                           field: title artist album genre year duration plays added
              play <song>                  play from All Songs
              play <playlist> <song>       play from a playlist
              next / prev / now            move through the playlist (no sound)
              repeat <off|all|one>
              like <song>                  like / unlike
              queue                        show the play-next queue
              queue add <song>... / queue remove <pos> / queue clear
              recent [text]                recently played
              quit""");
    }

    private void printSongs(String heading, List<Song> list) {
        System.out.println(heading + " (" + list.size() + ")");
        if (list.isEmpty()) {
            System.out.println("  (empty)");
            return;
        }
        Song current = engine.currentSong();
        int pos = 1;
        for (Song s : list) {
            String mark = current != null && current.id == s.id ? ">" : " ";
            System.out.printf("%s %2d. #%-3d %-28s %-22s %5s %s%n", mark, pos++, s.id,
                    cut(s.title, 28), cut(s.artist, 22), time(s.duration), s.liked ? "<3" : "");
        }
    }

    private void printPlaylists() {
        System.out.printf("  %-6s %-30s %s%n", "#", "Name", "Songs");
        System.out.printf("  %-6s %-30s %d%n", "all", "All Songs", engine.playlist(MusicEngine.LIBRARY_ID).songIds.size());
        System.out.printf("  %-6s %-30s %d%n", "liked", "Liked Songs", engine.playlist(MusicEngine.LIKED_ID).songIds.size());
        for (Playlist p : engine.userPlaylists()) {
            System.out.printf("  %-6d %-30s %d%n", p.id, cut(p.name, 30), p.songIds.size());
        }
    }

    private void nowPlaying() {
        Song s = engine.currentSong();
        if (s == null) {
            System.out.println("Nothing is playing.");
            return;
        }
        System.out.println("Now playing: " + s.title + " - " + s.artist + "  (" + time(s.duration) + ", no sound)");
        System.out.println("From: " + engine.activePlaylist().name + "   Repeat: " + engine.playback.repeat);
        List<Song> up = engine.upNext(3);
        if (!up.isEmpty()) {
            List<String> names = new ArrayList<>();
            for (Song u : up) names.add(u.title);
            System.out.println("Up next: " + String.join(", ", names));
        }
    }

    // ------------------------------------------------------------------ parsing helpers

    private static void need(String[] a, int n, String usage) {
        if (a.length < n) throw new IllegalArgumentException("Use: " + usage);
    }

    private static int number(String text) {
        try {
            return Integer.parseInt(text.replace("#", ""));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("'" + text + "' is not a number");
        }
    }

    private static int playlistId(String text) {
        return switch (text.toLowerCase()) {
            case "all", "library" -> MusicEngine.LIBRARY_ID;
            case "liked" -> MusicEngine.LIKED_ID;
            default -> number(text);
        };
    }

    private static List<Integer> songIds(String[] a, int from) {
        List<Integer> ids = new ArrayList<>();
        for (String s : Arrays.copyOfRange(a, from, a.length)) ids.add(number(s));
        return ids;
    }

    private static String time(int seconds) {
        return seconds / 60 + ":" + String.format("%02d", seconds % 60);
    }

    private static String cut(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }
}
