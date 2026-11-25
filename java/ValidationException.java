import java.util.Map;

/**
 * Thrown when the add / edit song form has wrong input.
 * It carries one message per field, so the web page can show each error under its own box.
 */
public class ValidationException extends IllegalArgumentException {
    private static final long serialVersionUID = 1L;

    final transient Map<String, String> fields;

    ValidationException(Map<String, String> fields) {
        super("Please fix the highlighted fields");
        this.fields = fields;
    }
}
