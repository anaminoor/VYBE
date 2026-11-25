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
`songs/HOW-TO-ADD-FILES.txt`. Refresh the page and the song plays for real: real seeking, speed,
volume, and a visualiser that follows the actual sound. Its real length is saved automatically.
A song without a file still works: it gets generated artwork and plays silently on a timer.

The audio and cover files are not included in the project; use files you are allowed to use.
Lyrics are not shown (they are not part of the project).

## The six required features

| Required feature | Where in Java | How |
|---|---|---|
| Add and remove songs from playlists | `MusicEngine.addSong / removeSong / moveSong` | `ArrayList` of song ids per playlist |
| Next and previous songs | `PlaybackState.next / previous / play` | position of the current song in the active playlist |
| Shuffle playlist order | `MusicEngine.shuffle` | `Collections.shuffle` reorders the playlist |
| Recently played songs | `PlaybackState.recordPlay / recentSongs` | `ArrayDeque`, newest first, no duplicates, last 20 |
| Search by title or artist | `MusicEngine.songsOf(id, query)`, `Json.searchAll` | case-insensitive match on title or artist |
| Sort by different criteria | `MusicEngine.sort` | a `Comparator` per field: title, artist, album, genre, year, duration, date added, most played; ascending or descending |

## Extra features

| Feature | Where in Java | Data structure / idea |
|---|---|---|
| "Play next" queue | `PlaybackState.queueAdd / queueRemove / queuePlay / queueClear / upNext` | `ArrayDeque` used as a FIFO queue; queued songs play first, then the playlist carries on from where it was |
| Repeat off / all / one, auto-next | `PlaybackState.next(auto)`, `setRepeat` | wraps round the list |
| Liked songs | `toggleLike`, `setLiked` | a built-in playlist |
| Drag to reorder | `moveSong` | remove and insert in the `ArrayList` |
| Multi-select actions | `addSongs`, `removeSongs`, `setLiked` | loops over the single-song methods |
| Artist and album pages | `Library.artists / albums / songsByArtist / songsByAlbum`, `MusicEngine.playContext` | grouping with a `LinkedHashMap`; a temporary playlist is made so next / previous stay inside the artist or album |
| Add and edit songs | `Library.create / update`, `SongValidator`, `ValidationException` | every field is checked in Java; one error message per field |
| Playlist covers | `setCover` | a preset colour number and an emoji |
| Stats | `StatsReport` | `HashMap` to count plays per genre, `Comparator` to rank |
| Real audio and covers | `MediaFiles` | finds each song's files in `songs/` by name; streams them in pieces (HTTP Range) so the browser can seek |
| Saving (SQL database) | `DataStore` | SQLite database `data/music.db` through JDBC: tables `songs`, `playlists`, `playlist_songs`, `recent`, `queue_items`, `state`; each save is one transaction |

The screen uses a dark streaming-app layout: a library sidebar, a colour header that changes per page,
a docked "Up next" panel and a player bar along the bottom (with a light theme too).
On the screen: home page with quick-access tiles, back / forward buttons, stats page with charts, full-screen player,
"Up next" panel, visualiser, volume, playback speed, sleep timer, quick search (Ctrl+K),
right-click menu, light / dark theme, accent colours, and animations throughout
(they switch off automatically if the system asks for reduced motion).

Songs without a cover image get generated artwork (`web/js/art.js`): a pattern picked from
the song's id, so each song always looks the same. Playlists show a 2 x 2 mosaic of their songs.

## How the parts fit together

```
 Browser (web/)                         Java (java/)
 +------------------+   HTTP + JSON    +-----------+     +----------------------------------+
 | views / ui / app |  <-- api.js -->  |  Server   | --> | MusicEngine  (playlists, search, |
 | (draws, no logic)|                  |  Json     |     |   sort, shuffle)                 |
 +------------------+                  +-----------+     |    +-- Library      (songs)      |
                                             |           |    +-- PlaybackState (player)    |
                                             v           +----------------------------------+
                                        MediaFiles                      |
                                     (songs/ audio+covers)              v
                                                                  DataStore -> data/music.db (SQLite)
```

**One request, step by step: pressing Next**

1. `app.js` calls `Api.next()` (`api.js`), which sends `POST /api/next`.
2. `Server` finds the route and calls `engine.next(false)`, which calls `PlaybackState.next`.
3. `PlaybackState` takes the first song from the queue, or moves one place along the playlist,
   and records the play in the recently played list.
4. `DataStore.save` writes the new state to `data/`.
5. `Json.player` turns the result into JSON; `app.js` stores it and `UI.renderPlayer` redraws the player bar.

## The database

`data/music.db` is a SQLite file created on first run with the sample songs and playlists. `DataStore` talks to it
through JDBC (`java.sql`).

| Table | Columns | Holds |
|---|---|---|
| `songs` | id, title, artist, album, genre, year, duration, play_count, liked | every song |
| `playlists` | id, name, gradient, emoji | playlists (negative ids are All Songs / Liked Songs) |
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
search, every sort field, validation, `parseDuration` and a save / load round trip.

## Files

```
java/   Main.java             starts everything
        MusicEngine.java      playlists, search, sort, shuffle + the one class the server talks to
        Library.java          all songs, artists and albums, add / edit
        SongValidator.java    checks the song form
        PlaybackState.java    current song, next / previous, repeat, queue, recently played
        Tests.java            18 tests (see Tests above)
        Song.java, Playlist.java   the data classes
        StatsReport.java      listening statistics
        MediaFiles.java       real audio and covers from the songs folder
        ValidationException.java   errors from the song form
        DataStore.java        saves / loads the SQLite database (JDBC), sample songs
        Server.java           small web server (JDK built-in) + the /api routes
        Json.java             turns data into JSON for the page
web/    index.html            page layout
        css/style.css         design, dark and light themes, animations
        js/api.js             calls the Java API
        js/app.js             routing, wiring, keyboard shortcuts, drag to reorder
        js/ui.js              icons, song rows, sidebar, player bar, menus, dialogs
        js/views.js           the pages: lists, home, artist, album, stats
        js/player.js          playback: real audio files, or a clock when there is none
        js/art.js             generated cover artwork and playlist mosaics
        js/visualiser.js      the dancing bars
        js/nowplaying.js      full-screen player, lyrics, up next
        js/forms.js           song form, cover picker, accent picker
        js/selection.js       multi-select and the right-click menu
        js/palette.js         quick search and the shortcuts list
        js/motion.js          shared animation helpers
        fonts/                Inter font and its licence
songs/  Songs.txt (the list), HOW-TO-ADD-FILES.txt, and your audio / cover files
data/   music.db is created on first run; delete it to reset to the sample data
lib/    SQLite JDBC driver (sqlite-jdbc) and its logging jars
```

The JavaScript holds no playlist logic. Every action calls Java and redraws from the reply.
Only the theme, accent colour, volume and speed are kept in the browser.

## Keyboard

| Key | Action |
|---|---|
| Space | Play / pause |
| N / P | Next / previous song |
| ← / → | Seek 5 seconds |
| ↑ / ↓ | Volume |
| M | Mute |
| L | Like the playing song |
| F | Full-screen player |
| Q | Up next |
| Ctrl + K | Quick search |
| / | Search the current list |
| Ctrl + A | Select all songs |
| Ctrl / Shift + click | Select more songs |
| Delete | Remove the selected songs from your playlist |
| Alt + ↑ / ↓ | Move the focused song in your playlist |
| Esc | Close / cancel |
| ? | Show this list in the app |
