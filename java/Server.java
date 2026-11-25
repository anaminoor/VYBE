import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Executors;

/**
 * A small web server built only from the JDK (com.sun.net.httpserver).
 *   /api/...   -> calls the MusicEngine and answers with JSON
 *   anything else -> a file from the web folder (index.html, css, js, font)
 */
public class Server {

    /** An error with its own HTTP status code (404, 405). */
    static class ApiError extends RuntimeException {
        private static final long serialVersionUID = 1L;
        final int status;
        ApiError(int status, String message) {
            super(message);
            this.status = status;
        }
    }

    private final MusicEngine engine;
    private final DataStore store;
    private final Path webRoot;
    private final MediaFiles media;

    Server(MusicEngine engine, DataStore store, Path webRoot, MediaFiles media) {
        this.engine = engine;
        this.store = store;
        this.webRoot = webRoot.toAbsolutePath().normalize();
        this.media = media;
    }

    void start(int port) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("localhost", port), 0);
        server.createContext("/api/", this::handleApi);
        server.createContext("/media/", media::handle);
        // Several threads, so a song that is downloading never holds up the rest of the app.
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.createContext("/", this::handleStatic);
        server.start();
    }

    // ------------------------------------------------------------------ API

    private void handleApi(HttpExchange ex) throws IOException {
        int status = 200;
        String body;
        try {
            String route = ex.getRequestURI().getPath().substring("/api/".length());
            Map<String, String> params = params(ex.getRequestURI().getRawQuery());
            boolean post = "POST".equalsIgnoreCase(ex.getRequestMethod());
            synchronized (engine) {
                body = route(route, params, post);
            }
        } catch (IllegalArgumentException e) {
            status = 400;
            body = Json.error(e.getMessage());
        } catch (ApiError e) {
            status = e.status;
            body = Json.error(e.getMessage());
        } catch (RuntimeException e) {
            e.printStackTrace();
            status = 500;
            body = Json.error("Server error: " + e.getMessage());
        }
        send(ex, status, "application/json; charset=utf-8", body.getBytes(StandardCharsets.UTF_8));
    }

    private String route(String route, Map<String, String> p, boolean post) {
        // ---- reading (GET)
        switch (route) {
            case "playlists":
                return Json.playlists(engine);
            case "playlist": {
                int id = intParam(p, "id");
                return Json.playlist(engine.playlist(id), engine.songsOf(id, p.get("q")), engine);
            }
            case "recent":
                return Json.recent(engine.recentSongs(p.get("q")));
            case "player":
                return Json.player(engine, false);
            case "queue":
                return Json.queue(engine);
        }

        // ---- everything below changes data: POST only, and saved to disk afterwards
        if (!post) throw new ApiError(route.isEmpty() ? 404 : 405, "Use POST for /api/" + route);
        String result;
        switch (route) {
            // playlists
            case "playlist/create":
                result = Json.summary(engine.createPlaylist(p.get("name")), engine);
                break;
            case "playlist/rename":
                result = Json.summary(engine.renamePlaylist(intParam(p, "id"), p.get("name")), engine);
                break;
            case "playlist/delete":
                engine.deletePlaylist(intParam(p, "id"));
                result = Json.ok();
                break;
            case "playlist/add":
                engine.addSong(intParam(p, "id"), intParam(p, "songId"));
                result = Json.summary(engine.playlist(intParam(p, "id")), engine);
                break;
            case "playlist/remove":
                engine.removeSong(intParam(p, "id"), intParam(p, "songId"));
                result = Json.summary(engine.playlist(intParam(p, "id")), engine);
                break;
            case "playlist/shuffle":
                engine.shuffle(intParam(p, "id"));
                result = Json.ok();
                break;
            case "playlist/sort":
                engine.sort(intParam(p, "id"), p.get("field"), p.getOrDefault("order", "asc"));
                result = Json.ok();
                break;

            // player
            case "player/play":
                engine.play(intParam(p, "playlistId"), intParam(p, "songId"));
                result = Json.player(engine, false);
                break;
            case "player/next": {
                boolean ended = engine.next("true".equals(p.get("auto")));
                result = Json.player(engine, ended);
                break;
            }
            case "player/previous":
                engine.previous();
                result = Json.player(engine, false);
                break;
            case "player/repeat":
                engine.setRepeat(p.get("mode"));
                result = Json.player(engine, false);
                break;

            // "play next" queue
            case "queue/add":
                engine.queueAdd(intParam(p, "songId"));
                result = Json.player(engine, false);
                break;
            case "queue/remove":
                engine.queueRemove(intParam(p, "index"));
                result = Json.player(engine, false);
                break;
            case "queue/clear":
                engine.queueClear();
                result = Json.player(engine, false);
                break;

            // songs
            case "like":
                result = Json.song(engine.toggleLike(intParam(p, "songId")));
                break;
            case "song/duration":
                result = Json.song(engine.setDuration(intParam(p, "id"), intParam(p, "seconds")));
                break;

            default:
                throw new ApiError(404, "Unknown API route: /api/" + route);
        }
        save();
        return result;
    }

    private void save() {
        try {
            store.save(engine);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not save data", e);
        }
    }

    private static int intParam(Map<String, String> p, String name) {
        try {
            return Integer.parseInt(p.get(name).trim());
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("Missing or invalid parameter: " + name);
        }
    }

    private static Map<String, String> params(String rawQuery) {
        Map<String, String> map = new HashMap<>();
        if (rawQuery == null || rawQuery.isEmpty()) return map;
        for (String pair : rawQuery.split("&")) {
            int eq = pair.indexOf('=');
            String key = eq < 0 ? pair : pair.substring(0, eq);
            String value = eq < 0 ? "" : pair.substring(eq + 1);
            map.put(URLDecoder.decode(key, StandardCharsets.UTF_8), URLDecoder.decode(value, StandardCharsets.UTF_8));
        }
        return map;
    }

    // ------------------------------------------------------------------ static files

    private void handleStatic(HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getPath();
        if (path.equals("/")) path = "/index.html";
        Path file = webRoot.resolve(path.substring(1)).normalize();

        if (!file.startsWith(webRoot) || !Files.isRegularFile(file)) {
            send(ex, 404, "text/plain; charset=utf-8", "Not found".getBytes(StandardCharsets.UTF_8));
            return;
        }
        send(ex, 200, contentType(file), Files.readAllBytes(file));
    }

    private static String contentType(Path file) {
        String name = file.getFileName().toString().toLowerCase();
        if (name.endsWith(".html")) return "text/html; charset=utf-8";
        if (name.endsWith(".css")) return "text/css; charset=utf-8";
        if (name.endsWith(".js")) return "text/javascript; charset=utf-8";
        if (name.endsWith(".woff2")) return "font/woff2";
        if (name.endsWith(".txt")) return "text/plain; charset=utf-8";
        if (name.endsWith(".svg")) return "image/svg+xml";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".ico")) return "image/x-icon";
        return "application/octet-stream";
    }

    private static void send(HttpExchange ex, int status, String type, byte[] bytes) throws IOException {
        ex.getResponseHeaders().set("Content-Type", type);
        ex.getResponseHeaders().set("Cache-Control", "no-cache");
        ex.sendResponseHeaders(status, bytes.length == 0 ? -1 : bytes.length);
        try (OutputStream out = ex.getResponseBody()) {
            out.write(bytes);
        }
    }
}
