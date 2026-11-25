/**
 * One song in the library.
 * The id never changes. The details can be edited from the "Edit song" form.
 * Play count and the "liked" flag change while the app is used.
 */
public class Song {
    final int id;
    String title;
    String artist;
    String album;
    String genre;
    int year;
    int duration;      // length in seconds
    int playCount;
    boolean liked;

    Song(int id, String title, String artist, String album, String genre,
         int year, int duration, int playCount, boolean liked) {
        this.id = id;
        this.title = title;
        this.artist = artist;
        this.album = album;
        this.genre = genre;
        this.year = year;
        this.duration = duration;
        this.playCount = playCount;
        this.liked = liked;
    }

    /** Search helper: true if the (already lower-case) query appears in the title or the artist. */
    boolean matches(String lowerQuery) {
        return title.toLowerCase().contains(lowerQuery)
            || artist.toLowerCase().contains(lowerQuery);
    }
}
