# VYBE

Team: Manan Wadhwa, Prabhashish Singh, Noor Anami

A music playlist app with a **Java** backend (all the logic and data) and an
**HTML / CSS / JavaScript** frontend (the screen). No frameworks. Data is stored in a **SQL database (SQLite)**.
Two things are not our own code: the SQLite JDBC driver in `lib/` (Java needs a driver to talk to any SQL database)
and the Inter font in `web/fonts/` (free, SIL Open Font License).

## How to run

Needs Java 22 or newer (tested on Java 26).

```
cd C:\fornoor
java --enable-native-access=ALL-UNNAMED -cp "lib/*" java/Main.java
```

Then open <http://localhost:8080>. Or just double-click `run.bat`.
The `-cp "lib/*"` part is needed so Java can find the SQLite driver; `--enable-native-access` only hides a harmless warning.

Older Java (17 to 21): compile first, then run:

```
javac -cp "lib/*" -d out java/*.java
java --enable-native-access=ALL-UNNAMED -cp "out;lib/*" Main
```

Use a current Edge, Chrome or Firefox.

## Terminal version (no sound)

The same app also runs as text commands in the terminal. It uses the same Java logic and the same
database, so playlists you make there show up on the website and the other way round.

```
java --enable-native-access=ALL-UNNAMED -cp "lib/*" java/Main.java cli
```

Or double-click `run-cli.bat`. Type `help` to see the commands, for example:

```
vybe> playlists
vybe> new Road Trip
vybe> add 5 1 2 3          (add songs #1, #2, #3 to playlist 5)
vybe> sort 5 title desc
vybe> play 5 2
vybe> next
```

`play`, `next` and `prev` move through the playlist and count plays, but nothing is heard.
Run only one version at a time: the website keeps its data in memory, so if both are open, the website
would overwrite changes made in the terminal. If that happens, restart the website to pick up the terminal's changes.

## The songs

The library is the 9 songs listed in `songs/Songs.txt`:

| Song | Artist | Album |
|---|---|---|
| What Do You Mean? | Justin Bieber | Purpose (2015) |
| Die For You | The Weeknd | Starboy (2016) |
| Blinding Lights | The Weeknd | After Hours (2020) |
| Bure Din | Seedhe Maut | not confirmed |
| Tu Aake Dekhle | King | The Carnival (2020) |
| Call Out My Name | The Weeknd | My Dear Melancholy, (2018) |
| Ivy | Frank Ocean | Blonde (2016) |
| Attention | Charlie Puth | Voicenotes (2018) |
| Treat You Better | Shawn Mendes | Illuminate (2016) |

**Adding the real audio and covers:** put the files in the `songs` folder, named after the song
(for example `blinding-lights.mp3` and `blinding-lights.jpg`). The full list of names is in
`songs/HOW-TO-ADD-FILES.txt`. Refresh the page and the song plays for real, with seeking
and volume. Its real length is saved automatically.
A song without an audio file can still be added to playlists; the page says it has no audio when you play it.

The audio and cover files are not included in the project; use files you are allowed to use.
Lyrics are not shown (they are not part of the project).

## The six required features

| Required feature | Where in Java | How |
|---|---|---|
| Add and remove songs from playlists | `MusicEngine.addSong / removeSong` (+ create / rename / delete playlists) | `ArrayList` of song ids per playlist |
| Next and previous songs | `PlaybackState.next / previous / play` | position of the current song in the active playlist |
| Shuffle playlist order | `MusicEngine.shuffle` | `Collections.shuffle` reorders the playlist |
| Recently played songs | `PlaybackState.recordPlay / recentSongs` | `ArrayDeque`, newest first, no duplicates, last 20 |
| Search by title or artist | `MusicEngine.songsOf(id, query)` | case-insensitive match on title or artist |
| Sort by different criteria | `MusicEngine.sort` | a `Comparator` per field: title, artist, album, genre, year, length, most played, date added; ascending or descending |

## Extra features

| Feature | Where in Java | Data structure / idea |
|---|---|---|
| "Play next" queue | `PlaybackState.queueAdd / queueRemove / queueClear / upNext` | `ArrayDeque` used as a FIFO queue; queued songs play first, then the playlist carries on from where it was |
| Repeat off / all / one | `PlaybackState.next(auto)`, `setRepeat` | wraps round the list |
| Liked songs | `MusicEngine.toggleLike` | a built-in playlist |
| Real audio and covers | `MediaFiles` | finds each song's files in `songs/` by name; streams them in pieces (HTTP Range) so the browser can seek |
| Saving (SQL database) | `DataStore` | SQLite database `data/music.db` through JDBC; each save is one transaction |

The page has three parts: a sidebar (All Songs, Liked Songs, Recently Played, Queue and your playlists),
the song list in the middle (with Shuffle, Sort, Rename, Delete and a search box), and a player bar along the bottom.
Click a song to play it. Each song row has buttons to like it, add it to a playlist, queue it, or remove it from the playlist.

## How the parts fit together

```
 Browser (web/)                      Java (java/)
 +-----------------+  HTTP + JSON   +-----------+     +----------------------------------+
 | index.html      |  <---------->  |  Server   | --> | MusicEngine  (playlists, search, |
 | app.js          |                |  Json     |     |   sort, shuffle, likes)          |
 | (draws, no      |                +-----------+     |    +-- Library      (songs)      |
 |  playlist logic)|                      |           |    +-- PlaybackState (player)    |
 +-----------------+                      v           +----------------------------------+
                                     MediaFiles                      |
                                  (songs/ audio+covers)              v
                                                               DataStore -> data/music.db (SQLite)
```

**One request, step by step: pressing Next**

1. `app.js` calls `api('player/next', {}, true)`, which sends `POST /api/player/next`.
2. `Server` finds the route and calls `engine.next(false)`, which calls `PlaybackState.next`.
3. `PlaybackState` takes the first song from the queue, or moves one place along the playlist,
   and records the play in the recently played list.
4. `DataStore.save` writes the new state to `data/music.db`.
5. `Json.player` turns the result into JSON; `app.js` (`applyPlayer`) loads the song's audio file and updates the player bar.

## The database

`data/music.db` is a SQLite file created on first run with the sample songs and playlists. `DataStore` talks to it
through JDBC (`java.sql`).

| Table | Columns | Holds |
|---|---|---|
| `songs` | id, title, artist, album, genre, year, duration, play_count, liked | every song |
| `playlists` | id, name | playlists (negative ids are All Songs / Liked Songs) |
| `playlist_songs` | playlist_id, position, song_id, added_at | the songs of each playlist; `position` is the play order |
| `recent` | position, song_id | recently played, position 0 = newest |
| `queue_items` | position, song_id | the "play next" queue, position 0 = plays next |
| `state` | key, value | repeat mode, current song, active playlist |

While the app runs, the lists live in memory (fast next / previous, sort, shuffle). `load` reads the tables once at start-up,
and `save` rewrites them in one transaction after every change, so a crash never leaves half-saved data.
Queries use `PreparedStatement` with `?` placeholders. To reset everything, stop the app and delete `data/music.db`.

## Tests

```
java --enable-native-access=ALL-UNNAMED -cp "lib/*" java/Tests.java
```

Plain Java (no test library; the SQLite driver is used for the save / load test). Each test starts from a fresh engine with the 9 sample songs and prints PASS or FAIL.
They cover add / remove, next / previous with every repeat mode, the FIFO queue, shuffle, recently played,
search, every sort field, liked songs and a save / load round trip.

## Files

```
java/   Main.java             starts the website, or the terminal version with "cli"
        MusicEngine.java      playlists, search, sort, shuffle, likes: the one class the server talks to
        Library.java          all songs
        PlaybackState.java    current song, next / previous, repeat, queue, recently played
        Song.java, Playlist.java   the data classes
        DataStore.java        saves / loads the SQLite database (JDBC), sample songs
        Server.java           small web server (JDK built-in) + the /api routes
        Json.java             turns data into JSON for the page
        MediaFiles.java       real audio and covers from the songs folder
        Cli.java              the terminal version (typed commands, no sound)
        Tests.java            15 tests (see Tests above)
web/    index.html            page layout
        css/style.css         the design (one dark theme)
        js/app.js             the whole page: calls Java, draws the lists, plays the audio
        fonts/                Inter font and its licence
songs/  Songs.txt (the list), HOW-TO-ADD-FILES.txt, and your audio / cover files
data/   music.db is created on first run; delete it to reset to the sample data
lib/    SQLite JDBC driver (sqlite-jdbc) and its logging jars
```

The JavaScript holds no playlist logic. Every action calls Java and redraws from the reply.
