// app.js - the whole web page.
//
// The page holds no playlist logic. Every action calls the Java server (/api/...),
// and the page redraws itself from the JSON that Java sends back.
//
// Sections:
//   1. Talking to Java       api()
//   2. Small helpers         $, esc, formatTime, toast
//   3. Sidebar               the list of playlists
//   4. Main area             songs of a playlist, recently played, queue
//   5. Player                the <audio> element, play / next / previous / repeat
//   6. Buttons and events    what happens when you click things

// ==================================================================== 1. Talking to Java

/** Calls /api/<route>. Changes use POST; reading uses GET. Throws an Error with Java's message if it fails. */
async function api(route, params = {}, post = false) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, value);
  }
  const url = '/api/' + route + (query.toString() ? '?' + query : '');

  let response;
  try {
    response = await fetch(url, { method: post ? 'POST' : 'GET' });
  } catch (e) {
    throw new Error('Cannot reach the Java server. Is it running?');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed (' + response.status + ')');
  return data;
}

// ==================================================================== 2. Small helpers

const $ = (id) => document.getElementById(id);

/** Makes text safe to put inside HTML. */
function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 225 -> "3:45" */
function formatTime(seconds) {
  seconds = Math.max(0, Math.floor(seconds || 0));
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

/** A colour (hue 0-360) picked from a number, so each playlist always gets the same colour. */
function hueFor(n) {
  return (Math.abs(n) * 67 + 260) % 360;
}

/** A small square picture: the song's cover image, or a coloured tile with its first letter. */
function coverHtml(song, className) {
  if (song && song.cover) return `<img class="${className}" src="${esc(song.cover)}" alt="" loading="lazy">`;
  const letter = song ? song.title.charAt(0) : '♪';
  return `<span class="${className} tile" style="--hue:${hueFor(song ? song.id : 0)}">${esc(letter)}</span>`;
}

let toastTimer = 0;
function toast(message) {
  const box = $('toast');
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 2800);
}

/** Runs an action and shows any error from Java as a message instead of failing silently. */
async function run(action) {
  try {
    await action();
  } catch (e) {
    toast(e.message);
  }
}

// ==================================================================== 3. Sidebar

const state = {
  view: { type: 'playlist', id: -1 },   // what the main area shows: playlist | recent | queue
  playlists: [],                        // every playlist (summary only)
  current: null,                        // the playlist shown right now (with its songs)
  player: null,                         // what Java says is playing
};

async function loadSidebar() {
  const data = await api('playlists');
  state.playlists = data.playlists;

  const mine = state.playlists.filter((p) => !p.builtIn);
  $('playlist-list').innerHTML = mine.length
    ? mine.map((p) => `<li><button data-view="playlist" data-id="${p.id}">
          <span class="dot" style="--hue:${hueFor(p.id)}">${esc(p.name.charAt(0))}</span>
          <span>${esc(p.name)}</span> <span class="count">${p.count}</span></button></li>`).join('')
    : '<li class="muted empty">No playlists yet</li>';

  markActiveInSidebar();
}

function markActiveInSidebar() {
  document.querySelectorAll('.sidebar button[data-view]').forEach((b) => {
    const v = state.view;
    const same = b.dataset.view === v.type && (v.type !== 'playlist' || Number(b.dataset.id) === v.id);
    b.classList.toggle('active', same);
  });
}

// ==================================================================== 4. Main area

/** Opens a list in the main area: { type: 'playlist', id } or { type: 'recent' } or { type: 'queue' }. */
async function openView(view) {
  state.view = view;
  $('search').value = '';
  markActiveInSidebar();
  await loadView();
}

/** Asks Java for the open list again and redraws it. */
async function loadView() {
  const v = state.view;
  const q = $('search').value;
  $('search').hidden = v.type === 'queue';
  $('list-actions').hidden = v.type !== 'playlist';

  if (v.type === 'playlist') {
    const p = await api('playlist', { id: v.id, q });
    state.current = p;
    setBanner(p.builtIn ? 'Collection' : 'Playlist', p.name,
      p.count + ' songs · ' + formatTime(p.duration), hueFor(p.id), p.songs.find((s) => s.cover));
    $('rename-btn').hidden = p.builtIn;
    $('delete-btn').hidden = p.builtIn;
    $('content').innerHTML = songTable(p.songs, !p.builtIn);
  } else if (v.type === 'recent') {
    const data = await api('recent', { q });
    setBanner('History', 'Recently Played', 'Newest first, up to 20 songs', 200, data.songs[0]);
    $('content').innerHTML = songTable(data.songs, false);
  } else {
    const data = await api('queue');
    setBanner('Up next', 'Queue', 'Songs you add with "Queue" play first, then the playlist carries on',
      150, data.current);
    $('content').innerHTML = queueHtml(data);
  }
  highlightPlaying();
}

/** The coloured banner at the top: a big cover, the kind of list, its name and a line of info. */
function setBanner(kind, title, info, hue, coverSong) {
  $('list-kind').textContent = kind;
  $('list-title').textContent = title;
  $('list-info').textContent = info;
  document.querySelector('.banner').style.setProperty('--hue', hue);
  $('list-cover').innerHTML = coverSong && coverSong.cover
    ? `<img src="${esc(coverSong.cover)}" alt="">`
    : `<span>${esc(title.charAt(0))}</span>`;
}

/** A table of songs. canRemove adds a "Remove" button (only in your own playlists). */
function songTable(songs, canRemove) {
  if (!songs.length) {
    return `<p class="muted empty">${$('search').value ? 'No songs match your search.' : 'No songs here yet.'}</p>`;
  }
  const rows = songs.map((s, i) => `
    <tr data-song-id="${s.id}" title="Click to play">
      <td class="num"><span class="n">${i + 1}</span><span class="eq"><i></i><i></i><i></i></span></td>
      <td>
        <div class="song">
          ${coverHtml(s, 'thumb')}
          <div>
            <div class="song-title">${esc(s.title)}</div>
            <div class="muted">${esc(s.artist)}</div>
          </div>
        </div>
      </td>
      <td class="hide-small">${esc(s.album)}</td>
      <td class="hide-small">${s.plays}</td>
      <td>${formatTime(s.duration)}</td>
      <td class="row-actions">
        <button data-action="like" class="${s.liked ? 'liked' : ''}" title="${s.liked ? 'Unlike' : 'Like'}">${s.liked ? '♥' : '♡'}</button>
        <button data-action="add" title="Add to a playlist">+ Playlist</button>
        <button data-action="queue" title="Play next">Queue</button>
        ${canRemove ? '<button data-action="remove" class="danger" title="Remove from this playlist">Remove</button>' : ''}
      </td>
    </tr>`).join('');
  return `<table class="songs">
      <thead><tr><th>#</th><th>Title</th><th class="hide-small">Album</th><th class="hide-small">Plays</th><th>Length</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function queueHtml(data) {
  const now = data.current
    ? `<p><strong>${esc(data.current.title)}</strong> · <span class="muted">${esc(data.current.artist)}</span></p>`
    : '<p class="muted">Nothing is playing.</p>';

  const queued = data.queued.length
    ? '<ol class="simple">' + data.queued.map((s, i) => `
        <li>${esc(s.title)} <span class="muted">· ${esc(s.artist)}</span>
          <button data-action="unqueue" data-index="${i}" class="small danger">Remove</button></li>`).join('') + '</ol>'
      + '<button data-action="clear-queue" class="small">Clear queue</button>'
    : '<p class="muted">Empty. Use the "Queue" button on any song.</p>';

  const next = data.next.length
    ? '<ol class="simple">' + data.next.map((s) => `<li>${esc(s.title)} <span class="muted">· ${esc(s.artist)}</span></li>`).join('') + '</ol>'
    : '<p class="muted">End of the playlist.</p>';

  return `<section class="box"><h3>Now playing</h3>${now}</section>
          <section class="box"><h3>Play next (${data.queued.length})</h3>${queued}</section>
          <section class="box"><h3>Then from ${esc(data.playlistName)}</h3>${next}</section>`;
}

/** Marks the row of the song that is playing. */
function highlightPlaying() {
  const id = state.player && state.player.song ? state.player.song.id : -1;
  document.querySelectorAll('tr[data-song-id]').forEach((row) => {
    row.classList.toggle('playing', Number(row.dataset.songId) === id);
  });
}

// ==================================================================== 5. Player

const audio = $('audio');

/**
 * Java answered a play / next / previous request: show the song and play its audio file.
 * autoplay = false only when the page first opens (browsers don't allow sound before a click).
 */
function applyPlayer(player, autoplay) {
  state.player = player;
  const song = player.song;

  if (player.ended) {
    audio.pause();
    toast('End of the playlist');
  } else if (song && song.audio) {
    if (audio.getAttribute('src') !== song.audio) audio.src = song.audio;
    audio.currentTime = 0;
    if (autoplay) audio.play().catch(() => {});
  } else {
    audio.pause();
    audio.removeAttribute('src');
    if (song && autoplay) toast('No audio file for "' + song.title + '"');
  }

  $('now-title').textContent = song ? song.title : 'Nothing playing';
  $('now-artist').textContent = song ? song.artist + ' · from ' + player.playlistName : '';
  $('now-cover').hidden = !(song && song.cover);
  if (song && song.cover) $('now-cover').src = song.cover;
  $('repeat-btn').textContent = 'Repeat: ' + player.repeat;
  $('time-total').textContent = formatTime(song ? song.duration : 0);
  updatePlayButton();
  highlightPlaying();
}

function updatePlayButton() {
  $('play-btn').innerHTML = audio.paused ? '&#9654;' : '&#10074;&#10074;';
  document.body.classList.toggle('is-playing', !audio.paused);   // makes the little bars move
}

/** Ask Java to do something with the player, then play what it says. Lists are redrawn so play counts update. */
async function playerAction(route, params = {}) {
  const player = await api(route, params, true);
  applyPlayer(player, true);
  await loadView();
}

// The song finished by itself: ask Java for the next one (auto = true so "repeat one" replays it).
audio.addEventListener('ended', () => run(() => playerAction('player/next', { auto: true })));
audio.addEventListener('play', updatePlayButton);
audio.addEventListener('pause', updatePlayButton);

audio.addEventListener('timeupdate', () => {
  $('time-now').textContent = formatTime(audio.currentTime);
  if (isFinite(audio.duration)) $('seek').value = (audio.currentTime / audio.duration) * 100;
});

// The real file's length can differ from what Java had saved: tell Java the real one.
audio.addEventListener('loadedmetadata', () => {
  const song = state.player && state.player.song;
  if (!song || !isFinite(audio.duration)) return;
  const seconds = Math.round(audio.duration);
  $('time-total').textContent = formatTime(seconds);
  if (Math.abs(seconds - song.duration) >= 1) {
    song.duration = seconds;
    api('song/duration', { id: song.id, seconds }, true).catch(() => {});
  }
});

audio.addEventListener('error', () => {
  if (audio.getAttribute('src')) toast('This audio file could not be played');
});

// ==================================================================== 6. Buttons and events

// Sidebar: open a list.
document.querySelector('.sidebar').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (!b) return;
  run(() => openView({ type: b.dataset.view, id: Number(b.dataset.id) }));
});

// Songs: the buttons on a row, or click the row itself to play the song.
$('content').addEventListener('click', (e) => {
  const button = e.target.closest('button[data-action]');
  const row = e.target.closest('tr[data-song-id]');
  const songId = row ? Number(row.dataset.songId) : null;

  run(async () => {
    if (!button) {
      if (songId === null) return;
      // In "Recently played" there is no playlist to move through, so play from All Songs.
      const playlistId = state.view.type === 'playlist' ? state.view.id : -1;
      await playerAction('player/play', { playlistId, songId });
      return;
    }

    switch (button.dataset.action) {
      case 'like':
        await api('like', { songId }, true);
        break;
      case 'add':
        await addToPlaylist(songId);
        break;
      case 'queue': {
        const p = await api('queue/add', { songId }, true);
        toast('Added to the queue (' + p.queueCount + ' waiting)');
        break;
      }
      case 'remove':
        await api('playlist/remove', { id: state.view.id, songId }, true);
        break;
      case 'unqueue':
        await api('queue/remove', { index: button.dataset.index }, true);
        break;
      case 'clear-queue':
        await api('queue/clear', {}, true);
        break;
    }
    await Promise.all([loadView(), loadSidebar()]);
  });
});

/** Shows the "Add to playlist" pop-up with one button per playlist. */
function addToPlaylist(songId) {
  const mine = state.playlists.filter((p) => !p.builtIn);
  if (!mine.length) {
    toast('Make a playlist first with "+ New"');
    return;
  }
  $('add-choices').innerHTML = mine.map((p) =>
    `<button value="${p.id}" class="choice">${esc(p.name)}</button>`).join('');

  const dialog = $('add-dialog');
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      const id = Number(dialog.returnValue);
      if (!dialog.returnValue || isNaN(id)) return resolve();
      run(async () => {
        await api('playlist/add', { id, songId }, true);
        toast('Added to ' + mine.find((p) => p.id === id).name);
      }).then(resolve);
    }, { once: true });
  });
}

/** Shows the name pop-up. Resolves with the typed name, or null if cancelled. */
function askName(title, value) {
  $('name-dialog-title').textContent = title;
  $('name-input').value = value;
  const dialog = $('name-dialog');
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue === 'ok' ? $('name-input').value : null);
    }, { once: true });
  });
}

$('new-playlist').addEventListener('click', () => run(async () => {
  const name = await askName('New playlist', '');
  if (name === null) return;
  const p = await api('playlist/create', { name }, true);
  await loadSidebar();
  await openView({ type: 'playlist', id: p.id });
}));

$('rename-btn').addEventListener('click', () => run(async () => {
  const name = await askName('Rename playlist', state.current.name);
  if (name === null) return;
  await api('playlist/rename', { id: state.view.id, name }, true);
  await Promise.all([loadView(), loadSidebar()]);
}));

$('delete-btn').addEventListener('click', () => run(async () => {
  if (!confirm('Delete the playlist "' + state.current.name + '"? The songs stay in your library.')) return;
  await api('playlist/delete', { id: state.view.id }, true);
  await loadSidebar();
  await openView({ type: 'playlist', id: -1 });
}));

$('shuffle-btn').addEventListener('click', () => run(async () => {
  await api('playlist/shuffle', { id: state.view.id }, true);
  await loadView();
}));

$('sort-btn').addEventListener('click', () => run(async () => {
  await api('playlist/sort', { id: state.view.id, field: $('sort-field').value, order: $('sort-order').value }, true);
  await loadView();
}));

// Search: ask Java again a moment after you stop typing.
let searchTimer = 0;
$('search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => run(loadView), 200);
});

// Player buttons.
$('play-btn').addEventListener('click', () => {
  const song = state.player && state.player.song;
  if (!song) return toast('Click a song to play it');
  if (!audio.getAttribute('src')) return toast('No audio file for "' + song.title + '"');
  if (audio.paused) audio.play().catch(() => {});
  else audio.pause();
});
$('next-btn').addEventListener('click', () => run(() => playerAction('player/next')));
$('prev-btn').addEventListener('click', () => run(() => playerAction('player/previous')));
$('repeat-btn').addEventListener('click', () => run(async () => {
  const order = ['off', 'all', 'one'];
  const mode = order[(order.indexOf(state.player.repeat) + 1) % order.length];
  state.player = await api('player/repeat', { mode }, true);
  $('repeat-btn').textContent = 'Repeat: ' + mode;
}));

$('seek').addEventListener('input', () => {
  if (isFinite(audio.duration)) audio.currentTime = ($('seek').value / 100) * audio.duration;
});
$('volume').addEventListener('input', () => { audio.volume = Number($('volume').value); });
audio.volume = 0.8;

// Start: load the sidebar, the All Songs list and whatever was playing last time.
run(async () => {
  await loadSidebar();
  applyPlayer(await api('player'), false);
  await openView({ type: 'playlist', id: -1 });
});
