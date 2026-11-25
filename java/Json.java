import java.util.Collection;
import java.util.List;
import java.util.function.Function;

/**
 * Turns engine objects into JSON text for the web page.
 * Only output is needed: the page sends its input as URL parameters.
 */
public class Json {

    /** Text that is already JSON, so it must not be put in quotes again. */
    record Raw(String json) {}

    // ------------------------------------------------------------------ building blocks

    static String str(String s) {
        if (s == null) return "null";
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"':  b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                default:
                    if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
                    else b.append(c);
            }
        }
        return b.append('"').toString();
    }

    /** obj("id", 3, "name", "Chill") -> {"id":3,"name":"Chill"} */
    static String obj(Object... keysAndValues) {
        StringBuilder b = new StringBuilder("{");
        for (int i = 0; i < keysAndValues.length; i += 2) {
            if (i > 0) b.append(',');
            b.append(str((String) keysAndValues[i])).append(':').append(value(keysAndValues[i + 1]));
        }
        return b.append('}').toString();
    }

    private static String value(Object v) {
        if (v == null) return "null";
        if (v instanceof Raw r) return r.json();
        if (v instanceof Song s) return song(s);
        if (v instanceof Number || v instanceof Boolean) return v.toString();
        return str(v.toString());
    }

    /** A JSON array, using the given function to write each item. */
    static <T> Raw list(Collection<T> items, Function<T, String> writer) {
        StringBuilder b = new StringBuilder("[");
        boolean first = true;
        for (T item : items) {
            if (!first) b.append(',');
            b.append(writer.apply(item));
            first = false;
        }
        return new Raw(b.append(']').toString());
    }

    static Raw songs(Collection<Song> list) {
        return list(list, Json::song);
    }

    // ------------------------------------------------------------------ songs and playlists

    /** Where the real audio and cover files are (set by Main); null means none. */
    static MediaFiles media;

    static String song(Song s) {
        return obj("id", s.id, "title", s.title, "artist", s.artist, "album", s.album, "genre", s.genre,
                "year", s.year, "duration", s.duration, "plays", s.playCount, "liked", s.liked,
                "audio", media == null ? null : media.audioUrl(s),
                "cover", media == null ? null : media.coverUrl(s));
    }

    /** Name, size and total length of a playlist (no songs). */
    static String summary(Playlist p, MusicEngine e) {
        int total = 0;
        for (int id : p.songIds) {
            Song s = e.songs.get(id);
            if (s != null) total += s.duration;
        }
        return obj("id", p.id, "name", p.name, "builtIn", p.isBuiltIn(),
                "count", p.songIds.size(), "duration", total);
    }

    /** Every playlist, for the sidebar. */
    static String playlists(MusicEngine e) {
        List<Playlist> all = List.copyOf(e.playlists.values());
        return obj("playlists", list(all, p -> summary(p, e)));
    }

    /** A playlist with its (possibly filtered) songs. */
    static String playlist(Playlist p, List<Song> songs, MusicEngine e) {
        String summary = summary(p, e);
        return summary.substring(0, summary.length() - 1) + ",\"songs\":" + songs(songs).json() + "}";
    }

    static String recent(List<Song> songs) {
        return obj("songs", songs(songs));
    }

    // ------------------------------------------------------------------ player and queue

    static String player(MusicEngine e, boolean ended) {
        Playlist p = e.activePlaylist();
        return obj("playlistId", p.id, "playlistName", p.name, "repeat", e.playback.repeat, "ended", ended,
                "queueCount", e.playback.queue.size(),
                "song", e.currentSong());
    }

    static String queue(MusicEngine e) {
        return obj("current", e.currentSong(),
                "playlistName", e.activePlaylist().name,
                "queued", songs(e.queuedSongs()),
                "next", songs(e.upNext(10)));
    }

    // ------------------------------------------------------------------ results

    static String ok() {
        return "{\"ok\":true}";
    }

    static String error(String message) {
        return obj("error", message);
    }
}
