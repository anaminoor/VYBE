import com.sun.net.httpserver.HttpExchange;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

/**
 * Real audio and cover images for songs, from the "songs" folder.
 *
 * A song's files are found by name: the title in lower case with spaces as dashes.
 *   Blinding Lights  ->  songs/blinding-lights.mp3   and   songs/blinding-lights.jpg
 * Audio: .mp3 .m4a .aac .ogg .opus .wav .flac .webm      Covers: .jpg .jpeg .png .webp
 * A song with no files still works: the page shows generated artwork and simulates playback.
 *
 * The folder is listed again at most every 2 seconds, so files you add show up without a restart.
 * Files are streamed in pieces (HTTP "Range" requests), which is what lets the browser seek in a song.
 */
public class MediaFiles {
    static final List<String> AUDIO = List.of(".mp3", ".m4a", ".aac", ".ogg", ".opus", ".wav", ".flac", ".webm");
    static final List<String> COVERS = List.of(".jpg", ".jpeg", ".png", ".webp");

    private final Path dir;
    private Map<String, String> files = new HashMap<>();   // lower-case file name -> real file name
    private long listedAt = 0;

    MediaFiles(Path dir) {
        this.dir = dir.toAbsolutePath().normalize();
    }

    /** "What Do You Mean?" -> "what-do-you-mean" */
    static String slug(String title) {
        return title.toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
    }

    /** Web address of the song's audio, or null when there is no file for it. */
    String audioUrl(Song s) {
        return find(s, AUDIO);
    }

    String coverUrl(Song s) {
        return find(s, COVERS);
    }

    /**
     * Finds a file for the song. Downloaded files keep their own names, so besides the exact name
     * ("blinding-lights.mp3") any file whose name contains the title as whole words also counts,
     * e.g. "The Weeknd - Blinding Lights (Official Audio).mp3".
     * When several files fit, an exact name wins, then one that also names the artist.
     */
    private synchronized String find(Song s, List<String> extensions) {
        refresh();
        String title = slug(s.title);
        String artist = slug(s.artist);
        if (title.isEmpty()) return null;
        String best = null;
        int bestScore = 0;
        for (Map.Entry<String, String> file : files.entrySet()) {
            String lower = file.getKey();
            int dot = lower.lastIndexOf('.');
            if (dot < 0 || !extensions.contains(lower.substring(dot))) continue;
            String base = slug(lower.substring(0, dot));
            int score;
            if (base.equals(title)) score = 3;                                        // exact name
            else if (("-" + base + "-").contains("-" + title + "-")) {
                score = ("-" + base + "-").contains("-" + artist + "-") ? 2 : 1;      // title, and maybe artist
            } else continue;
            if (score > bestScore || (score == bestScore && best != null && file.getValue().compareTo(best) < 0)) {
                best = file.getValue();
                bestScore = score;
            }
        }
        return best == null ? null : "/media/" + URLEncoder.encode(best, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private void refresh() {
        long now = System.currentTimeMillis();
        if (now - listedAt < 2000) return;
        listedAt = now;
        Map<String, String> found = new HashMap<>();
        if (Files.isDirectory(dir)) {
            try (Stream<Path> list = Files.list(dir)) {
                list.filter(Files::isRegularFile).forEach((p) -> {
                    String name = p.getFileName().toString();
                    found.put(name.toLowerCase(), name);
                });
            } catch (IOException e) {
                System.out.println("Could not read the songs folder: " + e.getMessage());
            }
        }
        files = found;
    }

    // ------------------------------------------------------------------ serving the files

    /** GET /media/<file name>: sends the whole file, or the requested piece of it. */
    void handle(HttpExchange ex) throws IOException {
        String name = ex.getRequestURI().getPath().substring("/media/".length());
        Path file = dir.resolve(name).normalize();
        String lower = name.toLowerCase();
        boolean allowed = AUDIO.stream().anyMatch(lower::endsWith) || COVERS.stream().anyMatch(lower::endsWith);
        if (!allowed || !file.startsWith(dir) || !Files.isRegularFile(file)) {
            byte[] msg = "Not found".getBytes(StandardCharsets.UTF_8);
            ex.sendResponseHeaders(404, msg.length);
            try (OutputStream out = ex.getResponseBody()) { out.write(msg); }
            return;
        }

        long size = Files.size(file);
        long start = 0;
        long end = size - 1;
        int status = 200;
        String range = ex.getRequestHeaders().getFirst("Range");
        if (range != null && range.startsWith("bytes=")) {
            try {
                String[] parts = range.substring(6).split(",")[0].split("-", 2);
                if (parts[0].isEmpty()) {                      // "bytes=-500": the last 500 bytes
                    start = Math.max(0, size - Long.parseLong(parts[1]));
                } else {
                    start = Long.parseLong(parts[0]);
                    if (parts.length > 1 && !parts[1].isEmpty()) end = Math.min(end, Long.parseLong(parts[1]));
                }
                status = 206;
            } catch (NumberFormatException e) {
                start = 0;
                end = size - 1;
            }
            if (start >= size || start > end) {
                ex.getResponseHeaders().set("Content-Range", "bytes */" + size);
                ex.sendResponseHeaders(416, -1);
                ex.close();
                return;
            }
        }

        long length = end - start + 1;
        ex.getResponseHeaders().set("Content-Type", contentType(lower));
        ex.getResponseHeaders().set("Accept-Ranges", "bytes");
        ex.getResponseHeaders().set("Cache-Control", "max-age=3600");
        if (status == 206) ex.getResponseHeaders().set("Content-Range", "bytes " + start + "-" + end + "/" + size);
        ex.sendResponseHeaders(status, length);
        try (InputStream in = Files.newInputStream(file); OutputStream out = ex.getResponseBody()) {
            in.skipNBytes(start);
            byte[] buffer = new byte[64 * 1024];
            long left = length;
            while (left > 0) {
                int n = in.read(buffer, 0, (int) Math.min(buffer.length, left));
                if (n < 0) break;
                out.write(buffer, 0, n);
                left -= n;
            }
        } catch (IOException e) {
            // The browser stopped reading (for example you skipped to another song). Nothing to do.
        }
    }

    private static String contentType(String lower) {
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".m4a")) return "audio/mp4";
        if (lower.endsWith(".aac")) return "audio/aac";
        if (lower.endsWith(".ogg") || lower.endsWith(".opus")) return "audio/ogg";
        if (lower.endsWith(".wav")) return "audio/wav";
        if (lower.endsWith(".flac")) return "audio/flac";
        if (lower.endsWith(".webm")) return "audio/webm";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".webp")) return "image/webp";
        return "image/jpeg";
    }
}
