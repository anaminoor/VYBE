import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Listening statistics, worked out from the play counts.
 * Counting uses a HashMap (genre -> totals); rankings are sorted with a Comparator.
 */
public class StatsReport {

    /** Totals for one genre. */
    record GenreInfo(String name, int songs, int plays) {}

    final int totalPlays;
    final int secondsListened;       // plays x song length, added up
    final int songCount;
    final int artistCount;
    final int albumCount;
    final int playlistCount;
    final int likedCount;
    final List<Song> topSongs = new ArrayList<>();
    final List<MusicEngine.ArtistInfo> topArtists;
    final List<GenreInfo> genres = new ArrayList<>();

    StatsReport(MusicEngine e) {
        int plays = 0;
        int seconds = 0;
        int liked = 0;
        Map<String, int[]> perGenre = new HashMap<>();       // genre -> { songs, plays }

        for (Song s : e.songs.values()) {
            plays += s.playCount;
            seconds += s.playCount * s.duration;
            if (s.liked) liked++;
            int[] totals = perGenre.computeIfAbsent(s.genre, k -> new int[2]);
            totals[0]++;
            totals[1] += s.playCount;
            if (s.playCount > 0) topSongs.add(s);
        }
        totalPlays = plays;
        secondsListened = seconds;
        likedCount = liked;
        songCount = e.songs.size();
        albumCount = e.albums(null).size();
        playlistCount = e.userPlaylists().size();

        // Most played songs first; ties in alphabetical order.
        topSongs.sort(Comparator.comparingInt((Song s) -> s.playCount).reversed()
                .thenComparing(s -> s.title.toLowerCase()));

        topArtists = e.artists();
        artistCount = topArtists.size();
        topArtists.sort(Comparator.comparingInt(MusicEngine.ArtistInfo::plays).reversed()
                .thenComparing(Comparator.comparingInt(MusicEngine.ArtistInfo::songs).reversed())
                .thenComparing(a -> a.name().toLowerCase()));

        for (Map.Entry<String, int[]> entry : perGenre.entrySet()) {
            genres.add(new GenreInfo(entry.getKey(), entry.getValue()[0], entry.getValue()[1]));
        }
        genres.sort(Comparator.comparingInt(GenreInfo::plays).reversed()
                .thenComparing(Comparator.comparingInt(GenreInfo::songs).reversed())
                .thenComparing(g -> g.name().toLowerCase()));
    }

    static <T> List<T> first(List<T> list, int n) {
        return list.subList(0, Math.min(n, list.size()));
    }
}
