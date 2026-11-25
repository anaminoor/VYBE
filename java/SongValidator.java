import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Checks the "Add song" / "Edit song" form.
 *
 * Every problem is collected in a LinkedHashMap (field name -> message, in form order),
 * so the page can show all the errors at once instead of one at a time.
 */
final class SongValidator {
    private SongValidator() {}

    /**
     * Returns a new Song built from clean values, or throws ValidationException listing every problem.
     * @param id       the id the song will have (so editing a song doesn't clash with itself)
     * @param existing songs already in the library, used to refuse duplicates
     */
    static Song validate(int id, String title, String artist, String album, String genre,
                         String yearText, String durationText, Collection<Song> existing) {
        Map<String, String> errors = new LinkedHashMap<>();
        String t = text("title", "Title", title, 60, errors);
        String a = text("artist", "Artist", artist, 60, errors);
        String al = text("album", "Album", album, 40, errors);
        String g = text("genre", "Genre", genre, 40, errors);

        int year = 0;
        int maxYear = java.time.Year.now().getValue() + 1;
        try {
            year = Integer.parseInt(yearText == null ? "" : yearText.trim());
            if (year < 1900 || year > maxYear) errors.put("year", "Year must be between 1900 and " + maxYear);
        } catch (NumberFormatException e) {
            errors.put("year", "Enter a year, for example 2024");
        }

        int duration = parseDuration(durationText);
        if (duration < 0) errors.put("duration", "Use minutes:seconds, for example 3:45");
        else if (duration < 10 || duration > 3600) errors.put("duration", "Length must be between 0:10 and 60:00");

        if (!errors.containsKey("title") && !errors.containsKey("artist")) {
            for (Song other : existing) {
                if (other.id != id && other.title.equalsIgnoreCase(t) && other.artist.equalsIgnoreCase(a)) {
                    errors.put("title", "\"" + other.title + "\" by " + other.artist + " is already in the library");
                }
            }
        }
        if (!errors.isEmpty()) throw new ValidationException(errors);
        return new Song(id, t, a, al, g, year, duration, 0, false);
    }

    /** Trims, squeezes spaces, removes characters the data files use as separators, checks the length. */
    private static String text(String field, String label, String value, int max, Map<String, String> errors) {
        String clean = value == null ? "" : value.replaceAll("[|\\r\\n\\t]", " ").replaceAll(" +", " ").trim();
        if (clean.isEmpty()) errors.put(field, label + " is required");
        else if (clean.length() > max) errors.put(field, label + " must be " + max + " characters or fewer");
        return clean;
    }

    /** "3:45" -> 225. A plain number is taken as seconds. Returns -1 if it can't be read. */
    static int parseDuration(String text) {
        String s = text == null ? "" : text.trim();
        if (s.matches("\\d{1,2}:[0-5]\\d")) {
            String[] parts = s.split(":");
            return Integer.parseInt(parts[0]) * 60 + Integer.parseInt(parts[1]);
        }
        if (s.matches("\\d{1,4}")) return Integer.parseInt(s);
        return -1;
    }
}
