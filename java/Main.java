import java.net.BindException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * VYBE - start here.
 *
 * Run from the project folder:   java java/Main.java
 * Then open:                      http://localhost:8080
 * Another port:                   java java/Main.java 9090
 * Terminal version (no sound):    java java/Main.java cli
 */
public class Main {
    public static void main(String[] args) throws Exception {
        Path base = findProjectFolder();

        // "cli" starts the terminal version instead of the website (no sound, same data).
        if (args.length > 0 && args[0].equalsIgnoreCase("cli")) {
            new Cli(base).run();
            return;
        }

        int port = args.length > 0 ? Integer.parseInt(args[0]) : 8080;

        MusicEngine engine = new MusicEngine();
        DataStore store = new DataStore(base.resolve("data"));
        store.load(engine);

        // Real audio and covers you add to the "songs" folder (see songs/HOW-TO-ADD-FILES.txt).
        java.nio.file.Files.createDirectories(base.resolve("songs"));
        MediaFiles media = new MediaFiles(base.resolve("songs"));
        Json.media = media;

        try {
            new Server(engine, store, base.resolve("web"), media).start(port);
        } catch (BindException e) {
            System.out.println("Port " + port + " is already in use. Close the other program or run: java java/Main.java 9090");
            return;
        }

        System.out.println("VYBE is running.");
        System.out.println("Open http://localhost:" + port + " in your browser. Press Ctrl+C to stop.");
    }

    /** Works whether you start it from the project folder or from inside the java folder. */
    private static Path findProjectFolder() {
        Path here = Path.of("").toAbsolutePath();
        if (Files.isDirectory(here.resolve("web"))) return here;
        if (here.getParent() != null && Files.isDirectory(here.getParent().resolve("web"))) return here.getParent();
        throw new IllegalStateException("Can't find the web folder. Run this from the project folder: java java/Main.java");
    }
}
