// app.js - starts the page and connects everything to the Java API.
// Pattern for every action: call Java -> get the new data -> redraw.
// No playlist logic lives here; Java is the single source of truth.

const state = {
  route: { type: 'home' },   // which page is open (from the address bar, e.g. #/playlist/3)
  query: '',                 // search text
  playlists: [],             // summaries for the sidebar
  list: null,                // the song list on screen (null on Home and Stats)
  player: null,              // player state from Java (current song, playlist, repeat, queue size)
  sortField: '',
  sortOrder: 'asc',
};

let pendingQuery = '';       // search text to apply after moving to All Songs
let pendingFlash = null;     // id of a song row to scroll to and flash
let viewSeq = 0;             // guards against an older page load finishing last
const phoneLayout = window.matchMedia('(max-width: 760px)');

// ------------------------------------------------------------------ routing

/** "#/playlist/3" -> { type: 'playlist', id: 3 } */
function parseRoute() {
  let parts;
  try {
    parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  } catch (e) {
    return { type: 'home' };
  }
  switch (parts[0]) {
    case 'library': return { type: 'library', id: -1 };
    case 'liked':   return { type: 'liked', id: -2 };
    case 'recent':  return { type: 'recent' };
    case 'stats':   return { type: 'stats' };
    case 'playlist': return Number.isInteger(Number(parts[1])) ? { type: 'playlist', id: Number(parts[1]) } : { type: 'home' };
    case 'artist':  return parts[1] ? { type: 'artist', name: parts[1] } : { type: 'home' };
    case 'album':   return parts[2] ? { type: 'album', artist: parts[1], name: parts[2] } : { type: 'home' };
    default:        return { type: 'home' };
  }
}

function isPlaylistRoute() {
  return ['library', 'liked', 'playlist'].includes(state.route.type);
}

function isUserPlaylist() {
  return !!state.list && state.list.kind === 'playlist' && !state.list.builtIn;
}

let historyIndex = 0;        // which history entry we are on, to tell Back from forward
let morphSource = null;      // the cover you clicked, which flies into the next page's header

/** Called when the address changes (sidebar click, Back button, link). */
async function navigate(event, first = false) {
  const idx = history.state && typeof history.state.idx === 'number' ? history.state.idx : null;
  let dir = 'forward';
  if (idx === null) {
    historyIndex += 1;                                   // a new page: number it
    history.replaceState({ idx: historyIndex }, '');
  } else {
    dir = idx < historyIndex ? 'back' : 'forward';
    historyIndex = idx;
  }
  document.documentElement.dataset.dir = dir;
  const morph = !first && dir === 'forward' && morphSource && morphSource.isConnected ? morphSource : null;
  morphSource = null;

  state.route = parseRoute();
  state.query = pendingQuery;
  pendingQuery = '';
  state.sortField = '';
  $('#search').value = state.query;
  Selection.ids.clear();
  UI.closeMenu();
  NowPlaying.closeFull();
  await showView({ transition: !first, animate: true, morph });
}

// ------------------------------------------------------------------ loading and drawing a page

async function loadPlaylists() {
  state.playlists = (await Api.playlists()).playlists;
}

/** Asks Java for the data of the current page. */
async function loadData(route) {
  switch (route.type) {
    case 'home':   return { page: 'home', data: await Api.home() };
    case 'stats':  return { page: 'stats', data: await Api.stats() };
    case 'recent': {
      const d = await Api.recent(state.query);
      return { list: { kind: 'recent', id: 'recent', name: 'Recently Played', builtIn: true, songs: d.songs, total: d.total, count: d.total } };
    }
    case 'artist': return { list: { kind: 'artist', ...(await Api.artist(route.name)) } };
    case 'album':  return { list: { kind: 'album', ...(await Api.album(route.name, route.artist)) } };
    default:       return { list: { kind: 'playlist', ...(await Api.playlist(route.id, state.query)) } };
  }
}

/**
 * Load and draw the current page.
 * options: transition (cross-fade from the old page), animate (rows rise in), flip (rows glide to new places)
 */
async function showView(options = {}) {
  const my = ++viewSeq;
  const route = state.route;
  const view = $('#view');

  // Only show the loading placeholder if Java takes a moment.
  let skeleton = 0;
  if (options.transition) skeleton = setTimeout(() => { view.innerHTML = UI.skeleton(); }, 140);

  let result;
  try {
    result = await loadData(route);
  } catch (e) {
    clearTimeout(skeleton);
    if (my !== viewSeq) return;
    if (route.type === 'home') return showOffline(e);
    UI.toast(e.message, 'error');
    location.hash = '#/home';                 // e.g. the playlist was deleted
    return;
  }
  clearTimeout(skeleton);
  if (my !== viewSeq) return;                 // you already moved to another page

  const render = () => {
    state.list = result.list || null;
    if (result.page === 'home') view.innerHTML = Views.home(result.data, options.animate);
    else if (result.page === 'stats') view.innerHTML = Views.stats(result.data, options.animate);
    else view.innerHTML = Views.list(state, options.animate);

    UI.renderSidebar(state.playlists, route);
    setPageHue(pageHue(route, result));
    if (options.transition) {
      $('#main').scrollTop = 0;
      onScroll();
    }
    afterRender(result, options);
  };

  if (options.transition) Motion.viewTransition(render, options.morph);
  else if (options.flip) await Motion.flip(() => $$('#song-list .song-row'), render);
  else render();
}

/** The colour of the header at the top of each page. */
function pageHue(route, result) {
  const list = result.list;
  switch (route.type) {
    case 'playlist': return (COVER_GRADIENTS[list.gradient] || COVER_GRADIENTS[0])[0];
    case 'library':  return 258;
    case 'liked':    return 252;
    case 'recent':   return 198;
    case 'artist':   return UI.hash(list.name);
    case 'album':    return UI.hue(list.firstSongId);
    case 'stats':    return 165;
    default:         return Player.song ? UI.hue(Player.song.id) : 230;
  }
}

let pageHueNow = null;
function setPageHue(hue) {
  // Go the short way round the colour wheel so the fade between pages looks natural.
  if (pageHueNow === null) pageHueNow = hue;
  else pageHueNow += ((hue - pageHueNow) % 360 + 540) % 360 - 180;
  $('#main').style.setProperty('--page-h', pageHueNow);
}

function afterRender(result, options) {
  const view = $('#view');
  const title = state.list ? state.list.name : result.page === 'stats' ? 'Stats' : 'Home';
  $('#compact-title').textContent = title;
  $('#compact-play').hidden = !state.list || !state.list.songs.length;
  document.title = title + ' · VYBE';

  view.querySelectorAll('[data-count]').forEach((el) => {
    const value = Number(el.dataset.count);
    if (options.animate) Motion.countUp(el, value);
    else el.textContent = value;
  });

  UI.markPlaying();
  Selection.render();
  watchStickyHeader();
  onScroll();
  view.querySelectorAll('.h-wrap').forEach((wrap) => HScroll.attach(wrap));
  if (options.animate) Motion.enter(view);
  // Long lists finish drawing a moment later; a new song is at the end, so flash it after that.
  UI.renderMoreRows(flashPendingSong);
}

/** Scroll to a song that was just added and make its row light up. */
function flashPendingSong() {
  if (pendingFlash === null) return;
  const row = document.querySelector(`#song-list .song-row[data-id="${pendingFlash}"]`);
  pendingFlash = null;
  if (!row) return;
  row.classList.add('flash');
  const main = $('#main');
  const target = main.scrollTop + row.getBoundingClientRect().top - main.getBoundingClientRect().top - main.clientHeight / 2;
  SmoothScroll.to(main, target);
}

function showOffline(error, quiet) {
  $('#view').innerHTML = `<div class="songs" style="margin-top:24px">${UI.empty('alert', 'Not connected',
    'Start the Java server with:  java java/Main.java  and then refresh this page.')}</div>`;
  if (!quiet) UI.toast(error.message, 'error');
}

/** Reload the sidebar and the current page, keeping the scroll position. */
async function refresh(options = {}) {
  await loadPlaylists();
  await showView(options);
}

/** Run an action; show its error as a message instead of failing silently. */
async function attempt(action) {
  try {
    await action();
  } catch (e) {
    UI.toast(e.message, 'error');
  }
}

// ------------------------------------------------------------------ playlists

/** songs (optional): songs to put into the new playlist straight away. */
async function createPlaylist(songs) {
  const name = await UI.dialog({ title: 'New playlist', message: 'Give your playlist a name.', value: '', confirm: 'Create' });
  if (!name) return;
  await attempt(async () => {
    const playlist = await Api.createPlaylist(name);
    if (songs && songs.length) {
      await Api.batchAdd(playlist.id, songs.map((s) => s.id));
      UI.toast('Created “' + playlist.name + '” with ' + UI.plural(songs.length, 'song'));
      Selection.clear();
      await refresh();
    } else {
      UI.toast('Created “' + playlist.name + '”');
      await loadPlaylists();
      location.hash = '#/playlist/' + playlist.id;
    }
  });
}

async function renamePlaylist() {
  const name = await UI.dialog({ title: 'Rename playlist', value: state.list.name, confirm: 'Save' });
  if (!name || name === state.list.name) return;
  await attempt(async () => {
    await Api.renamePlaylist(state.list.id, name);
    UI.toast('Renamed to “' + name + '”');
    await refresh();
    setPlayerInfo(await Api.player());
  });
}

async function deletePlaylist() {
  const ok = await UI.dialog({
    title: 'Delete “' + state.list.name + '”?',
    message: 'The playlist is removed. The songs stay in All Songs.',
    confirm: 'Delete', danger: true,
  });
  if (!ok) return;
  await attempt(async () => {
    await Api.deletePlaylist(state.list.id);
    UI.toast('Playlist deleted');
    setPlayerInfo(await Api.player());       // the player may have switched to All Songs
    await loadPlaylists();
    location.hash = '#/library';
  });
}

async function addSongsTo(playlist, songs) {
  await attempt(async () => {
    const target = '#nav-playlists [data-key="playlist' + playlist.id + '"] .nav-icon';
    const coverOf = (s) => document.querySelector('#song-list .song-row[data-id="' + s.id + '"] .art') ||
      (Player.song && Player.song.id === s.id ? $('#np-art') : null);
    const flights = songs.slice(0, 3).map(coverOf);
    if (songs.length === 1) {
      await Api.addSong(playlist.id, songs[0].id);
      UI.toast('Added “' + songs[0].title + '” to ' + playlist.name, 'success', songs[0].id);
    } else {
      const result = await Api.batchAdd(playlist.id, songs.map((s) => s.id));
      const skipped = songs.length - result.changed;
      UI.toast('Added ' + UI.plural(result.changed, 'song') + ' to ' + playlist.name +
        (skipped ? ' (' + skipped + ' already there)' : ''), result.changed ? 'success' : 'info');
    }
    flights.forEach((from, i) => setTimeout(() => Motion.flyTo(from, target), i * 90));
    Selection.clear();
    await refresh();
    NowPlaying.refresh();
  });
}

/** Remove songs from the playlist on screen; their rows close up first. */
async function removeSongs(ids) {
  if (!isUserPlaylist() || !ids.length) return;
  await attempt(async () => {
    const list = state.list;
    if (ids.length === 1) await Api.removeSong(list.id, ids[0]);
    else await Api.batchRemove(list.id, ids);
    await Promise.all(ids.map((id) => Motion.collapse(document.querySelector(`#song-list .song-row[data-id="${id}"]`))));
    UI.toast(ids.length === 1 ? 'Removed from ' + list.name : 'Removed ' + ids.length + ' songs from ' + list.name);
    Selection.clear();
    await refresh();
    NowPlaying.refresh();
  });
}

// ------------------------------------------------------------------ likes

async function toggleLike(songId, button) {
  await attempt(async () => {
    const song = await Api.like(songId);
    if (song.liked && button) Motion.burst(button);
    if (Player.song && Player.song.id === song.id) {
      Player.song.liked = song.liked;
      UI.renderPlayer(state.player);
      if (song.liked && !button) Motion.burst(document.querySelector(NowPlaying.fsOpen ? '#fs [data-like]' : '.player [data-like]'));
    }
    UI.toast(song.liked ? 'Added to Liked Songs' : 'Removed from Liked Songs', 'success', song.id);
    await refresh();
  });
}

async function likeSongs(ids, liked) {
  await attempt(async () => {
    await Api.batchLike(ids, liked);
    if (Player.song && ids.includes(Player.song.id)) {
      Player.song.liked = liked;
      UI.renderPlayer(state.player);
    }
    UI.toast((liked ? 'Liked ' : 'Unliked ') + UI.plural(ids.length, 'song'));
    Selection.clear();
    await refresh();
  });
}

// ------------------------------------------------------------------ shuffle, sort, reorder

async function shuffleList() {
  await attempt(async () => {
    await Api.shuffle(state.list.id);
    state.sortField = '';
    UI.toast('Shuffled ' + state.list.name);
    await showView({ flip: true });
    NowPlaying.refresh();
  });
}

async function sortList() {
  if (!state.sortField) return;
  await attempt(async () => {
    await Api.sort(state.list.id, state.sortField, state.sortOrder);
    await showView({ flip: true });
    NowPlaying.refresh();
  });
}

function openSortMenu(button) {
  UI.openMenu(button, 'Sort by', SORT_FIELDS.map(([field, label]) => ({
    label,
    icon: 'sort',
    checked: state.sortField === field,
    onClick: () => { state.sortField = field; sortList(); },
  })));
}

/** Move a song to a new position in your playlist (drag, or Alt + arrow keys). */
async function moveSong(songId, toIndex, refocus) {
  await attempt(async () => {
    await Api.move(state.list.id, songId, toIndex);
    state.sortField = '';
    await showView({ flip: true });
    NowPlaying.refresh();
    if (refocus) {
      const row = document.querySelector(`#song-list .song-row[data-id="${songId}"]`);
      if (row) row.focus({ preventScroll: true });
    }
  });
}

/** Drag a row by its grip. The other rows slide apart to show where it will land. */
function startDrag(e, row) {
  if (!isUserPlaylist() || state.query) return;
  e.preventDefault();
  const main = $('#main');
  const rows = [...$('#song-list').children];
  const from = rows.indexOf(row);
  const height = row.offsetHeight;
  const startY = e.clientY;
  const startScroll = main.scrollTop;
  const grip = e.target.closest('.grip');
  let pointerY = e.clientY;
  let to = from;
  let scrolling = 0;

  $('#songs').classList.add('reordering');
  row.classList.add('dragging');
  grip.setPointerCapture(e.pointerId);

  const update = () => {
    let dy = pointerY - startY + main.scrollTop - startScroll;
    dy = Math.max(-from * height, Math.min((rows.length - 1 - from) * height, dy));
    row.style.transform = `translateY(${dy}px) scale(1.015)`;
    to = from + Math.round(dy / height);
    rows.forEach((r, i) => {
      if (r === row) return;
      let shift = 0;
      if (from < to && i > from && i <= to) shift = -height;
      if (from > to && i >= to && i < from) shift = height;
      r.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  };

  // Scroll the page when the pointer is near the top or bottom edge.
  const autoScroll = () => {
    const box = main.getBoundingClientRect();
    if (pointerY < box.top + 70) main.scrollTop -= 9;
    else if (pointerY > box.bottom - 70) main.scrollTop += 9;
    update();
    scrolling = requestAnimationFrame(autoScroll);
  };
  scrolling = requestAnimationFrame(autoScroll);

  const move = (ev) => { pointerY = ev.clientY; };
  const end = async () => {
    cancelAnimationFrame(scrolling);
    grip.removeEventListener('pointermove', move);
    grip.removeEventListener('pointerup', end);
    grip.removeEventListener('pointercancel', end);
    if (to !== from) {
      await moveSong(Number(row.dataset.id), to);     // redraws, gliding rows from where they are now
    } else {
      rows.forEach((r) => { r.style.transform = ''; });
      row.classList.remove('dragging');
      $('#songs').classList.remove('reordering');
    }
  };
  grip.addEventListener('pointermove', move);
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
}

// ------------------------------------------------------------------ player

/** A new song: load it into the simulated player. */
function setPlayer(playerState, autoplay) {
  state.player = playerState;
  Player.load(playerState.song, autoplay);
  UI.renderPlayer(state.player);
  NowPlaying.onSongChange();
}

/** Same song, but something about the player changed (repeat, queue, playlist name). */
function setPlayerInfo(playerState) {
  state.player = playerState;
  if (Player.song && playerState.song && Player.song.id === playerState.song.id) Player.song = playerState.song;
  UI.renderPlayer(state.player);
  NowPlaying.refresh();
}

/** Calls a player route on Java, then plays whatever song Java says is current. */
async function playerAction(call, auto = false, dir = 1) {
  await attempt(async () => {
    const result = await call();
    UI.swapDir = dir;
    if (result.ended) {
      setPlayerInfo(result);
      UI.toast(auto ? 'Reached the end of ' + result.playlistName
                    : 'That was the last song. Turn on repeat to loop the playlist.', 'info');
      return;
    }
    setPlayer(result, true);
    await refresh();           // play counts and Recently Played have changed
  });
}

/** Play a song from the page on screen. Clicking the playing song pauses or resumes it. */
function playSong(songId, restart) {
  if (!restart && Player.song && Player.song.id === songId) return Player.toggle();
  const r = state.route;
  if (r.type === 'artist') return playerAction(() => Api.playContext('artist', state.list.name, '', songId));
  if (r.type === 'album') return playerAction(() => Api.playContext('album', state.list.name, state.list.artist, songId));
  // Songs in Recently Played are played from All Songs.
  return playerAction(() => Api.play(isPlaylistRoute() ? state.list.id : -1, songId));
}

function playFromLibrary(songId) {
  if (Player.song && Player.song.id === songId) return Player.toggle();
  return playerAction(() => Api.play(-1, songId));
}

/** Play a list from its first song without opening it (Home tiles). */
async function playList(id) {
  await attempt(async () => {
    const list = await Api.playlist(id);
    if (!list.songs.length) return UI.toast(list.name + ' is empty', 'info');
    await playerAction(() => Api.play(id, list.songs[0].id));
  });
}

function playAll() {
  if (state.list && state.list.songs.length) playSong(state.list.songs[0].id, true);
}

function playOrPause() {
  if (Player.song) return Player.toggle();
  if (state.list && state.list.songs.length) return playAll();
  playerAction(() => Api.next(false));       // nothing chosen yet: start All Songs
}

function previous() {
  // Like most players: after 3 seconds, "previous" restarts the song first.
  if (Player.song && Player.elapsed > 3) return Player.restart();
  playerAction(() => Api.previous(), false, -1);
}

async function cycleRepeat() {
  const order = { off: 'all', all: 'one', one: 'off' };
  const mode = order[state.player ? state.player.repeat : 'off'];
  await attempt(async () => {
    setPlayerInfo(await Api.repeat(mode));
    UI.toast({ off: 'Repeat off', all: 'Repeating the playlist', one: 'Repeating this song' }[mode], 'info');
  });
}

/** "Play next": the songs join the queue in Java and play before the playlist carries on. */
async function queueSongs(ids) {
  await attempt(async () => {
    setPlayerInfo(await Api.queueAdd(ids));
    UI.toast(ids.length === 1 ? 'Playing next' : UI.plural(ids.length, 'song') + ' added to the queue', 'success', ids[0]);
  });
}

function openSpeedMenu(button) {
  UI.openMenu(button, 'Playback speed', [0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => ({
    label: speed === 1 ? 'Normal (1×)' : speed + '×',
    icon: 'timer',
    checked: Player.speed === speed,
    onClick: () => Player.setSpeed(speed),
  })));
}

function openSleepMenu(button) {
  const sleep = Player.sleep;
  const option = (label, mode, minutes) => ({
    label, icon: 'timer',
    checked: false,
    onClick: () => {
      Player.setSleep(mode, minutes);
      UI.toast(mode === 'off' ? 'Sleep timer off' : mode === 'end' ? 'Playback stops after this song' : 'Playback stops in ' + minutes + ' minutes', 'info');
    },
  });
  const items = [5, 15, 30, 60].map((m) => option(m + ' minutes', 'time', m));
  items.push(option('End of this song', 'end'));
  if (sleep.mode !== 'off') {
    items.push({ sep: true });
    items.push({ ...option('Turn off timer', 'off'), danger: true });
  }
  UI.openMenu(button, sleep.mode === 'time' ? 'Sleep timer · ' + Player.sleepMinutesLeft() + ' min left' : 'Sleep timer', items);
}

// ------------------------------------------------------------------ songs

/** Called by the song form after Java saved the song. */
async function afterSongSaved(song, isNew) {
  NowPlaying.lyricsCache.clear();
  NowPlaying.lyricsFor = null;
  if (isNew) {
    pendingFlash = song.id;
    if (state.route.type === 'library' && !state.query) await refresh();
    else if (state.route.type === 'library') { state.query = ''; $('#search').value = ''; await refresh(); }
    else { await loadPlaylists(); location.hash = '#/library'; }
  } else {
    await refresh();
    setPlayerInfo(await Api.player());
    if (NowPlaying.fsOpen) NowPlaying.loadLyrics();
  }
}

// ------------------------------------------------------------------ scroll effects

/*
 * Scroll effects: in Chrome and Edge the browser runs them by itself from CSS (style.css,
 * "scroll-driven effects"), so nothing here runs while you scroll. Other browsers use onScroll.
 */
const CSS_SCROLL_EFFECTS = window.CSS && CSS.supports('animation-timeline: scroll()');

let scrollQueued = false;
function onScroll() {
  if (CSS_SCROLL_EFFECTS || scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(() => {
    scrollQueued = false;
    const main = $('#main');
    const y = main.scrollTop;
    const max = main.scrollHeight - main.clientHeight;
    $('#topbar-bg').style.opacity = Math.min(Math.max((y - 40) / 200, 0), 1).toFixed(3);
    $('#scroll-progress').style.transform = 'scaleX(' + (max > 0 ? y / max : 0).toFixed(4) + ')';
    $('#to-top').classList.toggle('show', y > 700);
    const show = y > 290;
    const compact = $('#compact');
    if (show !== compact.classList.contains('show')) compact.classList.toggle('show', show);
    if (!Motion.reduced) {
      const s = Math.min(y / 360, 1);
      const cover = document.querySelector('#view .hero > .cover');
      if (cover) cover.style.transform = 'translateY(' + (110 * s).toFixed(1) + 'px) scale(' + (1 - 0.14 * s).toFixed(3) + ')';
      const info = document.querySelector('#view .hero-info, #view .page-head');
      if (info) { info.style.transform = 'translateY(' + (70 * Math.min(y / 300, 1)).toFixed(1) + 'px)'; info.style.opacity = (1 - Math.min(y / 300, 1)).toFixed(3); }
    }
  });
}

/** The song table header takes the top bar's colour once it sticks under it. */
let stuckObserver = null;
function watchStickyHeader() {
  if (stuckObserver) stuckObserver.disconnect();
  const sentinel = document.querySelector('#view .sticky-sentinel');
  const head = document.querySelector('#view .song-row.head');
  if (!sentinel || !head) return;
  stuckObserver = new IntersectionObserver(([entry]) => {
    head.classList.toggle('stuck', !entry.isIntersecting && entry.boundingClientRect.top < entry.rootBounds.top + 2);
  }, { root: $('#main'), rootMargin: '-65px 0px 0px 0px' });
  stuckObserver.observe(sentinel);
}

// ------------------------------------------------------------------ wiring

function bindEvents() {
  const view = $('#view');
  const main = $('#main');

  window.addEventListener('hashchange', navigate);
  // Remember which cover was clicked, so it can fly into the page it opens.
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a.card, a.quick-item, #nav-playlists .nav-item');
    morphSource = link && !e.target.closest('[data-action]') ? link.querySelector('.cover, .quick-art, .nav-icon') : null;
  }, true);
  main.addEventListener('scroll', () => { onScroll(); UI.closeMenu(); }, { passive: true });
  $('#to-top').addEventListener('click', () => SmoothScroll.to(main, 0));
  window.addEventListener('resize', () => { UI.closeMenu(); });

  // Sidebar and top bar
  $('#btn-new-playlist').addEventListener('click', () => createPlaylist());
  $('#btn-add-song').addEventListener('click', () => Forms.song());
  $('#btn-theme').addEventListener('click', UI.toggleTheme);
  $('#btn-settings').addEventListener('click', (e) => Forms.accent(e.currentTarget));
  $('#btn-palette').addEventListener('click', () => Palette.open());
  $('#btn-shortcuts').addEventListener('click', () => Shortcuts.open());
  $('#compact-play').addEventListener('click', playAll);

  // Search (waits until you stop typing for a moment)
  let searchTimer;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const text = e.target.value.trim();
      if (isPlaylistRoute() || state.route.type === 'recent') {
        state.query = text;
        Selection.ids.clear();
        attempt(() => showView());
      } else if (text) {
        pendingQuery = text;                 // other pages: search All Songs
        location.hash = '#/library';
      }
    }, 220);
  });

  // Everything inside the page: toolbar buttons, cards, song rows
  view.addEventListener('click', (e) => {
    if (e.target.closest('.song-row a, .hero a')) return;                // normal links

    const action = e.target.closest('[data-action]');
    const row = e.target.closest('#song-list .song-row');
    const song = row ? state.list.songs.find((s) => s.id === Number(row.dataset.id)) : null;

    if (action) {
      switch (action.dataset.action) {
        case 'play-all':     return playAll();
        case 'shuffle':      return shuffleList();
        case 'shuffle-play': return playerAction(() => Api.playContext('artist', state.list.name, '', undefined, true));
        case 'sort':         return openSortMenu(action);
        case 'sort-order':
          state.sortOrder = state.sortOrder === 'asc' ? 'desc' : 'asc';
          if (state.sortField) return sortList();
          return showView();
        case 'rename':       return renamePlaylist();
        case 'delete':       return deletePlaylist();
        case 'cover':        return Forms.cover(state.list);
        case 'new-playlist': return createPlaylist();
        case 'clear-search':
          $('#search').value = '';
          state.query = '';
          return attempt(() => showView({ animate: true }));
        case 'play-list':    e.preventDefault(); return playList(Number(action.dataset.list));
        case 'like':         return toggleLike(song.id, action);
        case 'add':          return Selection.playlistMenu(action, [song]);
        case 'more':         return Selection.menu(action, song);
        case 'grip':         return;                                     // handled by pointerdown
      }
    }

    const card = e.target.closest('[data-song]');
    if (card) {
      e.preventDefault();
      return playFromLibrary(Number(card.dataset.song));
    }

    if (!song) return;
    if (e.ctrlKey || e.metaKey) return Selection.toggle(song.id);
    if (e.shiftKey) return Selection.range(song.id);
    Selection.clear();
    Selection.anchor = song.id;
    playSong(song.id);
  });

  view.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.grip');
    if (grip && e.button === 0) startDrag(e, grip.closest('.song-row'));
  });

  view.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('#song-list .song-row');
    if (!row) return;
    e.preventDefault();
    const song = state.list.songs.find((s) => s.id === Number(row.dataset.id));
    Selection.menu({ x: e.clientX, y: e.clientY }, song);
  });

  // Keys on a focused song row
  view.addEventListener('keydown', (e) => {
    const row = e.target.closest('#song-list .song-row');
    if (!row || e.target !== row) return;
    const id = Number(row.dataset.id);
    const rows = [...$('#song-list').children];
    const index = rows.indexOf(row);
    if (e.key === 'Enter') { e.preventDefault(); playSong(id, true); }
    else if (e.key === ' ' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); Selection.toggle(id); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      const target = index + (e.key === 'ArrowDown' ? 1 : -1);
      if (target < 0 || target >= rows.length) return;
      if (e.altKey) {
        if (isUserPlaylist() && !state.query) moveSong(id, target, true);
      } else {
        rows[target].focus();
      }
    }
  });

  // Player buttons, in the bar and in full screen (data-cmd="...")
  document.addEventListener('click', (e) => {
    const button = e.target.closest('[data-cmd]');
    if (!button) return;
    switch (button.dataset.cmd) {
      case 'toggle': return playOrPause();
      case 'next':   return playerAction(() => Api.next(false));
      case 'prev':   return previous();
      case 'repeat': return cycleRepeat();
      case 'like':   return Player.song && toggleLike(Player.song.id, button);
      case 'queue':  return NowPlaying.toggleQueue();
      case 'full':   return NowPlaying.toggleFull();
      case 'back':    return history.back();
      case 'forward': return history.forward();
    }
  });
  $('#btn-speed').addEventListener('click', (e) => openSpeedMenu(e.currentTarget));
  $('#btn-sleep').addEventListener('click', (e) => openSleepMenu(e.currentTarget));
  $('#btn-mute').addEventListener('click', () => {
    if (Player.volume === 0) Player.setVolume(0.5);
    else Player.setMuted(!Player.muted);
  });
  $('#volume').addEventListener('input', (e) => Player.setVolume(Number(e.target.value) / 100));

  // Progress bars: click, drag, hover time, arrow keys
  $$('.progress').forEach((bar) => {
    const fraction = (e) => {
      const r = bar.getBoundingClientRect();
      return Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
    };
    const tip = bar.querySelector('.progress-tip');
    bar.addEventListener('pointerdown', (e) => {
      if (!Player.song) return;
      bar.setPointerCapture(e.pointerId);
      bar.classList.add('dragging');
      Player.seek(fraction(e));
    });
    bar.addEventListener('pointermove', (e) => {
      const f = fraction(e);
      tip.style.left = (f * 100) + '%';
      tip.textContent = UI.time(f * (Player.song ? Player.song.duration : 0));
      if (bar.classList.contains('dragging')) Player.seek(f);
    });
    const stop = () => bar.classList.remove('dragging');
    bar.addEventListener('pointerup', stop);
    bar.addEventListener('pointercancel', stop);
    bar.addEventListener('keydown', (e) => {
      if (!Player.song) return;
      if (e.key === 'ArrowRight') { e.stopPropagation(); Player.seekTo(Player.elapsed + 5); }
      if (e.key === 'ArrowLeft') { e.stopPropagation(); Player.seekTo(Player.elapsed - 5); }
    });
  });

  // Close pop-ups when clicking elsewhere
  document.addEventListener('pointerdown', (e) => {
    if (UI.menuOpen() && !e.target.closest('#menu')) UI.closeMenu();
    if (NowPlaying.queueOpen && phoneLayout.matches && !e.target.closest('#queue-panel, #menu, [data-cmd="queue"], .player, dialog')) NowPlaying.toggleQueue(false);
  });

  document.addEventListener('keydown', onKey);
}

/** Keyboard shortcuts. Press ? in the app to see the list. */
function onKey(e) {
  const mod = e.ctrlKey || e.metaKey;

  if (mod && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (!$('#dialog').open) Palette.isOpen() ? Palette.close() : Palette.open();
    return;
  }
  if (e.key === 'Escape') {
    if ($('#dialog').open) return UI.closeModal();
    if (UI.menuOpen()) return UI.closeMenu();
    if (Palette.isOpen()) return Palette.close();
    if (NowPlaying.fsOpen) return NowPlaying.closeFull();
    if (NowPlaying.queueOpen) return NowPlaying.toggleQueue(false);
    if (Selection.ids.size) return Selection.clear();
    if (document.activeElement === $('#search')) $('#search').blur();
    return;
  }

  const typing = e.target.matches('input, select, textarea') || $('#dialog').open || Palette.isOpen();
  if (typing || e.altKey) return;

  if (mod) {
    if (e.key.toLowerCase() === 'a' && state.list && state.list.songs.length && !NowPlaying.fsOpen) {
      e.preventDefault();
      Selection.all();
    }
    return;
  }

  const onButton = e.target.matches('button, a, [role="button"]');
  switch (e.key) {
    case ' ':
      if (onButton) return;
      e.preventDefault();
      return playOrPause();
    case 'ArrowRight': if (Player.song) { e.preventDefault(); Player.seekTo(Player.elapsed + 5); } return;
    case 'ArrowLeft':  if (Player.song) { e.preventDefault(); Player.seekTo(Player.elapsed - 5); } return;
    case 'ArrowUp':    e.preventDefault(); return Player.setVolume(Player.level() + 0.05);
    case 'ArrowDown':  e.preventDefault(); return Player.setVolume(Player.level() - 0.05);
    case 'Delete':
    case 'Backspace':
      if (Selection.ids.size && isUserPlaylist()) { e.preventDefault(); removeSongs([...Selection.ids]); }
      return;
    case '/': e.preventDefault(); NowPlaying.closeFull(); return $('#search').focus();
    case '?': e.preventDefault(); return Shortcuts.open();
  }
  switch (e.key.toLowerCase()) {
    case 'n': return playerAction(() => Api.next(false));
    case 'p': return previous();
    case 'm': return Player.volume === 0 ? Player.setVolume(0.5) : Player.setMuted(!Player.muted);
    case 'l': return Player.song && toggleLike(Player.song.id);
    case 'f': return NowPlaying.toggleFull();
    case 'q': return NowPlaying.toggleQueue();
  }
}

// ------------------------------------------------------------------ start

/**
 * A short logo reveal, once per browser session.
 * It waits for the font (so the name never changes shape mid-animation), only animates
 * transform and opacity, and fades out once the first page has been drawn behind it.
 */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nextFrames = (n) => new Promise((resolve) => {
  const step = () => (--n <= 0 ? resolve() : requestAnimationFrame(step));
  requestAnimationFrame(step);
});

const Splash = {
  el: null,
  shownAt: 0,
  MIN_MS: 450,              // long enough not to flicker
  MAX_MS: 1200,             // never keeps you waiting longer than this

  start() {
    const el = $('#splash');
    if (!el) return;
    if (document.documentElement.classList.contains('no-splash')) { el.remove(); return; }
    Splash.el = el;
    Splash.shownAt = performance.now();
    Motion.startBoot();
    const fonts = document.fonts ? Promise.race([document.fonts.ready, wait(600)]) : Promise.resolve();
    fonts.then(() => { el.classList.add('font-ready'); Splash.progress(0.4); });
    setTimeout(() => Splash.finish(), Splash.MAX_MS);       // a slow server never traps you here
  },

  /** Fill the bar to show real progress: fonts, library data, first page. */
  progress(p) {
    if (Splash.el) Splash.el.style.setProperty('--p', p);
  },

  async finish() {
    if (!Splash.el || Splash.el.classList.contains('failed')) return;
    const el = Splash.el;
    Splash.el = null;
    el.style.setProperty('--p', 1);
    const left = Splash.MIN_MS - (performance.now() - Splash.shownAt);
    if (left > 0) await wait(left);
    await nextFrames(2);                     // the first page has been painted behind it
    el.classList.add('done');
    Motion.endBoot();                        // the page rises in as the start-up screen lifts away
    setTimeout(() => el.remove(), 500);
  },

  /** Java is not running: say so clearly, with a button to try again. Returns false if the screen has gone already. */
  fail() {
    const el = Splash.el;
    if (!el) return false;
    el.classList.add('failed');
    el.setAttribute('aria-label', 'Cannot reach the Java server');
    $('#splash-error').hidden = false;
    $('#splash-retry').onclick = () => location.reload();
    $('#splash-retry').focus();
    return true;
  },
};

async function init() {
  UI.fillIcons();
  UI.renderThemeButton();
  Player.restoreSettings();
  Views.initCharts();
  Tilt.init();
  UI.initDialog();
  NowPlaying.init();
  Selection.init();
  Palette.init();
  bindEvents();
  if (!history.state || typeof history.state.idx !== 'number') history.replaceState({ idx: 0 }, '');
  else historyIndex = history.state.idx;
  Visualiser.attach($('#viz-mini'), { bars: 14 });
  Visualiser.attach($('#viz-big'), { bars: 48, mirror: true, active: () => NowPlaying.fsOpen });

  Player.onTick = () => { UI.renderProgress(); NowPlaying.syncLyrics(); };
  Player.onTimeline = () => UI.syncTimeline();
  // A real audio file is a little longer or shorter than the listed length: show and keep the real one.
  Player.onDuration = (song) => {
    UI.renderProgress();
    Api.setDuration(song.id, song.duration).then(() => refresh()).catch(() => {});
  };
  Player.onError = (song) => UI.toast('Couldn\'t play the audio file for “' + song.title + '”', 'error');
  Player.onState = () => UI.renderPlayState();
  Player.onEnded = () => playerAction(() => Api.next(true), true);
  Player.onSleep = () => { UI.renderPlayState(); UI.toast('Sleep timer: playback stopped', 'info'); };
  setInterval(() => UI.renderSleep(), 5000);       // keeps the countdown badge up to date

  UI.renderPlayState();
  $('#view').innerHTML = UI.skeleton();
  Splash.start();

  try {
    await loadPlaylists();
    Splash.progress(0.7);
    setPlayer(await Api.player(), false);          // show the last song, paused
  } catch (e) {
    UI.renderSidebar([], { type: 'home' });
    if (!Splash.fail()) showOffline(e);
    else showOffline(e, true);
    return;
  }
  if (!location.hash) history.replaceState(null, '', '#/home');
  Splash.progress(0.85);
  await navigate(null, true);
  Splash.finish();
}

init();
