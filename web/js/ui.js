// ui.js - shared drawing helpers: icons, song rows, sidebar, player bar,
// toasts, menus and dialogs. It never changes data itself; app.js calls
// these functions with data from Java.

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const ICON_PATHS = {
  play:    '<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>',
  pause:   '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/>',
  prev:    '<path d="M6 5v14"/><path d="M19 5 9 12l10 7z" fill="currentColor"/>',
  next:    '<path d="M18 5v14"/><path d="M5 5l10 7-10 7z" fill="currentColor"/>',
  shuffle: '<path d="M3 7h3.5c2 0 3.2 1 4.3 2.6l2.4 3.8C14.3 15 15.5 16 17.5 16H21"/><path d="M3 16h3.5c1.3 0 2.2-.4 3-1.1"/><path d="M14 8.1c.8-.7 1.7-1.1 3-1.1H21"/><path d="m18 4 3 3-3 3"/><path d="m18 13 3 3-3 3"/>',
  repeat:  '<path d="m17 2 3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="m7 22-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  heart:   '<path d="M12 20.5s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1z"/>',
  plus:    '<path d="M12 5v14M5 12h14"/>',
  x:       '<path d="M6 6l12 12M18 6 6 18"/>',
  check:   '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  search:  '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  sun:     '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon:    '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  music:   '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  clock:   '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  timer:   '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5"/>',
  list:    '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  queue:   '<path d="M3 6h12M3 11h12M3 16h7"/><path d="M15 14.5v6l5-3z" fill="currentColor"/>',
  'queue-add': '<path d="M3 6h12M3 11h12M3 16h8"/><path d="M18 13v7M14.5 16.5h7"/>',
  edit:    '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  trash:   '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  up:      '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down:    '<path d="M12 5v14M5 12l7 7 7-7"/>',
  sort:    '<path d="M4 7h16M7 12h10M10 17h4"/>',
  more:    '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
  grip:    '<circle cx="9" cy="6" r="1.3" fill="currentColor"/><circle cx="15" cy="6" r="1.3" fill="currentColor"/><circle cx="9" cy="12" r="1.3" fill="currentColor"/><circle cx="15" cy="12" r="1.3" fill="currentColor"/><circle cx="9" cy="18" r="1.3" fill="currentColor"/><circle cx="15" cy="18" r="1.3" fill="currentColor"/>',
  expand:  '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  volume:  '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11"/>',
  'volume-low': '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z" fill="currentColor"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/>',
  mute:    '<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z" fill="currentColor"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  home:    '<path d="M4 11 12 4l8 7v8.5a.5.5 0 0 1-.5.5H15v-6H9v6H4.5a.5.5 0 0 1-.5-.5z"/>',
  chart:   '<path d="M5 20V11M12 20V4M19 20v-6"/>',
  user:    '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1-4 4-6 7.5-6s6.500 2 7.500 6"/>',
  disc:    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>',
  command: '<path d="M9 9h6v6H9z"/><path d="M9 9V6.5A2.500 2.500 0 1 0 6.500 9H9zM15 9V6.500A2.500 2.500 0 1 1 17.500 9H15zM9 15v2.500A2.500 2.500 0 1 1 6.500 15H9zM15 15v2.500a2.500 2.500 0 1 0 2.500-2.500H15z"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.400 0 2-.900 2-1.800 0-1.700-1.300-1.700-1.300-3 0-1 .800-1.700 1.800-1.700H17a4 4 0 0 0 4-4c0-4.200-4-7.500-9-7.500z"/><circle cx="7.500" cy="11.500" r="1" fill="currentColor"/><circle cx="10.500" cy="7.500" r="1" fill="currentColor"/><circle cx="15.500" cy="8" r="1" fill="currentColor"/>',
  image:   '<rect x="3.500" y="4.500" width="17" height="15" rx="2.500"/><circle cx="9" cy="10" r="1.700"/><path d="m4 17 5-4.500 3.500 3 3-2.500 4.500 4"/>',
  keyboard:'<rect x="2.500" y="6" width="19" height="12" rx="2.500"/><path d="M6.500 10h.01M10 10h.01M13.500 10h.01M17 10h.01M7.500 14h9"/>',
  info:    '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.500M12 7.500h.01"/>',
  alert:   '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.500h.01"/>',
  library: '<path d="M4.500 4v16M9.500 4v16M14 4.500l5.500 15"/>',
  back:    '<path d="m15 18-6-6 6-6"/>',
  forward: '<path d="m9 18 6-6-6-6"/>',
};

// The ten preset playlist cover colours (the same numbering as MusicEngine.GRADIENTS in Java).
const COVER_GRADIENTS = [
  [258, 310], [205, 250], [172, 205], [22, 345], [2, 32],
  [135, 172], [232, 282], [322, 20], [44, 14], [282, 198],
];

const UI = {
  icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON_PATHS[name] + '</svg>';
  },

  /** Fill every element that has data-icon="name" with that icon. */
  fillIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach((el) => {
      if (!el.querySelector(':scope > svg')) el.insertAdjacentHTML('afterbegin', UI.icon(el.dataset.icon));
    });
  },

  esc(text) {
    return String(text).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  /** 214 -> "3:34" */
  time(seconds) {
    const s = Math.floor(seconds);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  },

  /** 4380 -> "1 hr 13 min" */
  longTime(seconds) {
    const min = Math.round(seconds / 60);
    if (min < 60) return min + ' min';
    return Math.floor(min / 60) + ' hr ' + (min % 60) + ' min';
  },

  plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  },

  // ---------------------------------------------------------------- colours and links

  /** A colour for each song, so the generated cover art differs. */
  hue(id) {
    return ((id * 47) % 360 + 360) % 360;
  },

  /** A steady colour from any text (used for artists). */
  hash(text) {
    let h = 0;
    for (const c of String(text).toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
  },

  gradient(g1, g2) {
    return `--g1:${g1};--g2:${g2}`;
  },

  /** Inline style for a song's cover: its generated artwork (art.js). */
  songStyle(song) {
    const h = UI.hue(song.id);
    return UI.gradient(h, h + 40) + ';background-image:' + Art.image(song.id, song.cover);
  },

  /**
   * A playlist's cover: with an emoji, its chosen colour with a pattern behind the emoji;
   * without one, a 2 x 2 mosaic of its first four songs (or the first song's cover).
   */
  playlistStyle(p) {
    const g = COVER_GRADIENTS[p.gradient] || COVER_GRADIENTS[0];
    const art = p.art || [];
    let image;
    if (!p.emoji && art.length >= 4) {
      // 2 x 2 mosaic of the first four songs' covers (real or generated)
      return UI.gradient(g[0], g[1]) + ';background-image:' + art.slice(0, 4).map((id) => Art.image(id)).join(',') +
        ';background-size:50% 50%;background-repeat:no-repeat;background-position:0 0,100% 0,0 100%,100% 100%';
    }
    if (!p.emoji && art.length) image = Art.image(art[0]);
    else image = Art.pattern('pl' + p.id, p.id * 131 + p.gradient * 17 + 5, g[0]);
    return UI.gradient(g[0], g[1]) + ';background-image:' + image;
  },

  artistStyle(name) {
    const h = UI.hash(name);
    return UI.gradient(h, h + 50) + ';background-image:' + Art.pattern('a' + name, h * 7 + 3, h);
  },

  initials(name) {
    return String(name).split(/\s+/).filter((w) => /[a-z0-9]/i.test(w[0] || '')).slice(0, 2)
      .map((w) => w[0].toUpperCase()).join('') || '?';
  },

  artistHref(name) {
    return '#/artist/' + encodeURIComponent(name);
  },

  albumHref(artist, album) {
    return '#/album/' + encodeURIComponent(artist) + '/' + encodeURIComponent(album);
  },

  // ---------------------------------------------------------------- sidebar

  renderSidebar(playlists, route) {
    const find = (id) => playlists.find((p) => p.id === id) || { count: 0 };
    const activeKey = route.type === 'playlist' ? 'playlist' + route.id : route.type;

    // Main links: icon and a bold label.
    const main = [
      { key: 'home', href: '#/home', name: 'Home', icon: 'home' },
      { key: 'library', href: '#/library', name: 'All Songs', icon: 'music' },
      { key: 'recent', href: '#/recent', name: 'Recently Played', icon: 'clock' },
      { key: 'stats', href: '#/stats', name: 'Stats', icon: 'chart' },
    ];
    $('#nav-main').innerHTML = main.map((item) => `
      <a class="nav-item${item.key === activeKey ? ' active' : ''}" data-key="${item.key}" href="${item.href}">
        <span class="nav-icon">${UI.icon(item.icon)}</span>
        <span class="nav-name">${item.name}</span>
      </a>`).join('');

    // Remember the old counts so a changed count can "tick".
    const old = {};
    $$('.nav-item[data-key]').forEach((el) => {
      const c = el.querySelector('.nav-count');
      if (c) old[el.dataset.key] = c.textContent;
    });
    const row = (key, href, art, artStyle, name, kind, count) => `
      <a class="nav-item${key === activeKey ? ' active' : ''}" data-key="${key}" href="${href}">
        <span class="nav-icon swatch" style="${artStyle}">${art}</span>
        <span class="nav-text">
          <span class="nav-name">${UI.esc(name)}</span>
          <span class="nav-sub">${kind} · <span class="nav-count${old[key] !== undefined && old[key] !== String(count) ? ' tick' : ''}">${count}</span> ${count === 1 ? 'song' : 'songs'}</span>
        </span>
      </a>`;

    // Your Library: Liked Songs first, then your playlists.
    const liked = find(-2);
    const mine = playlists.filter((p) => !p.builtIn);
    $('#nav-playlists').innerHTML =
      row('liked', '#/liked', UI.icon('heart'), UI.gradient(250, 290), 'Liked Songs', 'Collection', liked.count) +
      mine.map((p) => row('playlist' + p.id, '#/playlist/' + p.id, p.emoji ? UI.esc(p.emoji) : '',
        UI.playlistStyle(p), p.name, 'Playlist', p.count)).join('') +
      (mine.length ? '' : '<p class="nav-empty">Create your first playlist with +</p>');
  },

  // ---------------------------------------------------------------- song rows

  /**
   * options: animate (rows rise in), draggable (grip handle), numbered (false hides nothing, kept for clarity)
   */
  FIRST_ROWS: 24,

  songsTable(songs, options = {}) {
    const rows = songs.slice(0, UI.FIRST_ROWS).map((s, i) => UI.songRow(s, i, options)).join('');
    UI._moreRows = songs.length > UI.FIRST_ROWS ? { songs, options } : null;
    return `
      <div class="songs" id="songs">
        <div class="sticky-sentinel" aria-hidden="true"></div>
        <div class="song-row head" aria-hidden="true">
          <div class="c-num">#</div>
          <div class="c-title">Title</div>
          <div class="c-album">Album</div>
          <div class="c-genre">Genre</div>
          <div class="c-year">Year</div>
          <div class="c-plays">Plays</div>
          <div class="c-time">${UI.icon('clock')}</div>
          <div class="c-actions"></div>
        </div>
        <div id="song-list">${rows}</div>
      </div>`;
  },

  /** Add the rows that songsTable() left out, 30 per frame, so opening a long list never stalls. */
  renderMoreRows(done) {
    const more = UI._moreRows;
    UI._moreRows = null;
    const list = $('#song-list');
    if (!more || !list) { if (done) done(); return; }
    let next = UI.FIRST_ROWS;
    const step = () => {
      if (!list.isConnected) return;                 // you already went to another page
      const end = Math.min(next + 30, more.songs.length);
      list.insertAdjacentHTML('beforeend',
        more.songs.slice(next, end).map((s, k) => UI.songRow(s, next + k, more.options)).join(''));
      next = end;
      if (next < more.songs.length) requestAnimationFrame(step);
      else if (done) done();
    };
    requestAnimationFrame(step);
  },

  songRow(s, i, options = {}) {
    const selected = typeof Selection !== 'undefined' && Selection.ids.has(s.id);
    const current = Player.song && Player.song.id === s.id;
    const playing = current && Player.playing;
    return `
      <div class="song-row${options.animate && i < 14 ? ' en' : ''}${selected ? ' selected' : ''}${current ? ' current' : ''}${playing ? ' playing' : ''}" data-id="${s.id}" tabindex="0" role="button"
           aria-label="${UI.esc(s.title)} by ${UI.esc(s.artist)}">
        <div class="c-num">
          <span class="n">${i + 1}</span>
          <span class="row-play">${UI.icon('play')}</span>
          <span class="eq"><i></i><i></i><i></i></span>
        </div>
        <div class="c-title">
          <div class="art" style="${UI.songStyle(s)}"></div>
          <div class="t">
            <div class="title" title="${UI.esc(s.title)}">${UI.esc(s.title)}</div>
            <div class="artist"><a href="${UI.artistHref(s.artist)}" tabindex="-1">${UI.esc(s.artist)}</a></div>
          </div>
        </div>
        <div class="c-album"><a href="${UI.albumHref(s.artist, s.album)}" tabindex="-1">${UI.esc(s.album)}</a></div>
        <div class="c-genre"><span class="tag">${UI.esc(s.genre)}</span></div>
        <div class="c-year">${s.year || '—'}</div>
        <div class="c-plays">${s.plays}</div>
        <div class="c-time">${UI.time(s.duration)}</div>
        <div class="c-actions">
          <button class="icon-btn small like${s.liked ? ' on' : ''}" data-action="like" tabindex="-1"
            title="${s.liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}" aria-label="Like">${UI.icon('heart')}</button>
          <button class="icon-btn small" data-action="add" tabindex="-1" title="Add to playlist" aria-label="Add to playlist">${UI.icon('plus')}</button>
          <button class="icon-btn small" data-action="more" tabindex="-1" title="More" aria-label="More actions">${UI.icon('more')}</button>
          ${options.draggable ? `<button class="icon-btn small grip" data-action="grip" tabindex="-1" title="Drag to reorder (or Alt + arrow keys)" aria-label="Drag to reorder">${UI.icon('grip')}</button>` : ''}
        </div>
      </div>`;
  },

  /** Shimmering placeholder shown while a page loads. */
  skeleton() {
    const row = '<div class="sk-row"><div class="sk"></div><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>';
    return `
      <div class="hero">
        <div class="cover sk" style="background-color:transparent;box-shadow:none"></div>
        <div class="hero-info" style="flex:1">
          <div class="sk" style="width:90px;height:12px;margin-bottom:14px"></div>
          <div class="sk" style="width:min(340px,70%);height:44px;margin-bottom:14px"></div>
          <div class="sk" style="width:160px;height:14px"></div>
        </div>
      </div>
      <div class="songs">${row.repeat(8)}</div>`;
  },

  /** An empty state: picture, title, explanation and (optionally) a button that helps. action: { label, href } or { label, action } */
  empty(icon, title, text, action) {
    const button = !action ? '' : action.href
      ? `<a class="btn primary" href="${action.href}">${UI.esc(action.label)}</a>`
      : `<button class="btn primary" data-action="${action.action}">${UI.esc(action.label)}</button>`;
    return `<div class="empty"><span class="empty-art">${UI.icon(icon)}</span><strong>${UI.esc(title)}</strong><p>${UI.esc(text)}</p>${button}</div>`;
  },

  /** Highlight the song that is playing, wherever it appears. */
  markPlaying() {
    const id = Player.song ? Player.song.id : null;
    $$('.song-row[data-id]').forEach((row) => {
      const current = Number(row.dataset.id) === id;
      row.classList.toggle('current', current);
      row.classList.toggle('playing', current && Player.playing);
    });
    $$('.card[data-song]').forEach((card) => card.classList.toggle('current', Number(card.dataset.song) === id));
  },

  // ---------------------------------------------------------------- player bar and full screen

  lastSongId: null,
  hueNow: 258,

  swapDir: 1,          // 1 = moved forward (next / play), -1 = previous

  renderPlayer(ps) {
    const song = Player.song;
    const previousId = UI.lastSongId;
    const changed = (song ? song.id : null) !== previousId;
    UI.lastSongId = song ? song.id : null;

    const applySong = () => {
      const title = song ? song.title : 'Nothing playing';
      $('#np-title').textContent = title;
      $('#fs-title').textContent = title;
      for (const a of [$('#np-artist'), $('#fs-artist')]) {
        a.textContent = song ? song.artist : (a.id === 'np-artist' ? 'Pick a song to start' : '');
        if (song) a.href = UI.artistHref(song.artist); else a.removeAttribute('href');
      }
      for (const art of [$('#np-art'), $('#fs-art')]) {
        art.innerHTML = song ? '' : UI.icon('music');
        art.style.cssText = song ? UI.songStyle(song) : '';
        art.classList.toggle('empty', !song);
      }
      // The cover pulses at this song's tempo (same formula as the visualiser).
      if (song) $('#np-art').style.setProperty('--beat', (60 / (92 + (song.id * 37) % 48)).toFixed(3) + 's');
    };
    if (changed && song && previousId !== null) Motion.swap(document.querySelector('.np'), UI.swapDir, applySong);
    else if (changed) applySong();
    if (changed && song) {
      UI.setHue(UI.hue(song.id) + 20);
      // With a real cover, take the colour from the picture itself once it has loaded.
      const cover = song.cover || Art.covers.get(song.id);
      document.documentElement.style.removeProperty('--np-sat');
      if (cover) {
        Art.coverHue(cover).then((h) => {
          if (h === null || !Player.song || Player.song.id !== song.id) return;
          if (h === -1) document.documentElement.style.setProperty('--np-sat', '6%');   // grey cover: neutral background
          else UI.setHue(h);
        });
      }
    }

    $$('[data-like]').forEach((like) => {
      like.hidden = !song;
      like.classList.toggle('on', !!(song && song.liked));
      like.title = (song && song.liked ? 'Remove from Liked Songs' : 'Add to Liked Songs') + ' (L)';
    });

    $('#fs-from').innerHTML = song && ps
      ? (ps.fromQueue ? 'Playing from<strong>Your queue</strong>' : 'Playing from<strong>' + UI.esc(ps.playlistName) + '</strong>')
      : '';

    const repeat = ps ? ps.repeat : 'off';
    $$('.repeat').forEach((r) => {
      r.classList.toggle('on', repeat !== 'off');
      r.classList.toggle('repeat-one', repeat === 'one');
      r.title = { off: 'Repeat: off', all: 'Repeat: whole playlist', one: 'Repeat: this song' }[repeat];
    });

    const queued = ps ? ps.queueCount : 0;
    $('#queue-badge').hidden = !queued;
    $('#queue-badge').textContent = queued;

    UI.renderPlayState();
    UI.renderProgress();
  },

  /** Everything that depends on play / pause, volume, speed and the sleep timer. */
  renderPlayState() {
    $$('.play-btn').forEach((btn) => {
      if (!btn.firstChild) {
        btn.innerHTML = UI.icon('play').replace('<svg', '<svg class="ic-play"') + UI.icon('pause').replace('<svg', '<svg class="ic-pause"') +
          '<svg class="ic-morph" viewBox="0 0 24 24" aria-hidden="true"><path class="pp1"/><path class="pp2"/></svg>';
      }
      btn.classList.toggle('is-playing', Player.playing);
      btn.title = (Player.playing ? 'Pause' : 'Play') + ' (Space)';
      btn.setAttribute('aria-label', Player.playing ? 'Pause' : 'Play');
    });
    $('#fs').classList.toggle('playing', Player.playing);
    $('#player').classList.toggle('is-playing', Player.playing);

    const level = Player.level();
    $('#btn-mute').innerHTML = UI.icon(level === 0 ? 'mute' : level < 0.5 ? 'volume-low' : 'volume');
    $('#btn-mute').title = (Player.muted ? 'Unmute' : 'Mute') + ' (M)';
    const slider = $('#volume');
    slider.value = Math.round(level * 100);
    slider.style.setProperty('--v', slider.value + '%');

    const speed = $('#btn-speed');
    speed.textContent = Player.speed + '×';
    speed.classList.toggle('on', Player.speed !== 1);

    UI.renderSleep();
    UI.markPlaying();
    Visualiser.kick();
  },

  renderSleep() {
    const badge = $('#sleep-badge');
    const mode = Player.sleep.mode;
    $('#btn-sleep').classList.toggle('on', mode !== 'off');
    badge.hidden = mode === 'off';
    badge.textContent = mode === 'end' ? '♪' : Player.sleepMinutesLeft();
    $('#btn-sleep').title = mode === 'off' ? 'Sleep timer'
      : mode === 'end' ? 'Sleep timer: stops after this song'
      : 'Sleep timer: ' + Player.sleepMinutesLeft() + ' min left';
  },

  /** The time labels. Called 5 times a second; only touches the page when the text changes. */
  renderProgress() {
    const p = UI._progress || (UI._progress = {
      elapsed: [...$$('[data-elapsed]')],
      total: [...$$('[data-total]')],
      elapsed0: '', total0: '',
    });
    const duration = Player.song ? Player.song.duration : 0;
    const elapsed = UI.time(Player.elapsed);
    if (elapsed !== p.elapsed0) { p.elapsed0 = elapsed; for (const el of p.elapsed) el.textContent = elapsed; }
    const total = UI.time(duration);
    if (total !== p.total0) { p.total0 = total; for (const el of p.total) el.textContent = total; }
  },

  /**
   * The progress bars are moved by the browser: one linear animation per bar, from empty to full
   * over the song's length. Here it is only lined up with the player clock when something changes
   * (play, pause, seek, speed, new song), so nothing runs on every frame.
   */
  syncTimeline() {
    const song = Player.song;
    for (const el of $$('.progress-fill, .progress-head')) {
      if (!song) {
        if (el._anim) { el._anim.cancel(); el._anim = null; }
        continue;
      }
      if (!el._anim || el._animFor !== song.id || el._animLength !== song.duration) {
        if (el._anim) el._anim.cancel();
        el._anim = el.animate([{ transform: 'translateX(-100%)' }, { transform: 'translateX(0%)' }],
          { duration: song.duration * 1000, fill: 'both', easing: 'linear' });
        el._animFor = song.id;
        el._animLength = song.duration;
      }
      el._anim.playbackRate = Player.speed;
      el._anim.currentTime = Math.min(Player.elapsed, song.duration) * 1000;
      if (Player.playing) el._anim.play();
      else el._anim.pause();
    }
  },

  /** The playing song's colour (accent and full-screen background), going the short way round the colour wheel. */
  setHue(hue) {
    let delta = ((hue - UI.hueNow) % 360 + 540) % 360 - 180;
    UI.hueNow += delta;
    document.documentElement.style.setProperty('--np-h', UI.hueNow);
  },

  // ---------------------------------------------------------------- theme and accent

  renderThemeButton() {
    const dark = document.documentElement.dataset.theme !== 'light';
    $('#btn-theme').innerHTML = UI.icon(dark ? 'sun' : 'moon');
  },

  toggleTheme() {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    Store.set('theme', next);
    UI.renderThemeButton();
    Visualiser.kick();
  },

  /** accent: 'auto' (follow the song) or a hue number. */
  setAccent(accent) {
    const root = document.documentElement;
    if (accent === 'auto') {
      root.dataset.accent = 'auto';
    } else {
      root.dataset.accent = 'fixed';
      root.style.setProperty('--fixed-h', accent);
    }
    Store.set('accent', accent);
    Visualiser.kick();
  },

  // ---------------------------------------------------------------- toasts

  /** songId (optional): show that song's cover instead of an icon. */
  toast(message, type = 'success', songId) {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = (songId ? `<span class="toast-art" style="${UI.songStyle({ id: songId })}"></span>`
      : UI.icon({ success: 'check', error: 'alert', info: 'info' }[type] || 'info')) + '<span></span>';
    el.lastChild.textContent = message;
    const box = $('#toasts');
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.classList.add('hide'), 2800);
    setTimeout(() => el.remove(), 3200);
  },

  // ---------------------------------------------------------------- pop-up menu

  /**
   * where: an element to open next to, or a point { x, y }.
   * items: [{ label, icon, onClick, checked, danger }] or { sep: true }.
   */
  openMenu(where, title, items) {
    const html = (title ? '<div class="menu-title">' + UI.esc(title) + '</div>' : '') +
      items.map((item, i) => item.sep ? '<div class="menu-sep"></div>' :
        `<button class="menu-item${item.checked ? ' checked' : ''}${item.danger ? ' danger' : ''}" data-i="${i}">
           ${UI.icon(item.checked ? 'check' : item.icon || 'music')}<span>${UI.esc(item.label)}</span>
         </button>`).join('');
    const menu = UI.openPopover(where, html);
    menu.onclick = (e) => {
      const btn = e.target.closest('[data-i]');
      if (!btn) return;
      UI.closeMenu();
      items[Number(btn.dataset.i)].onClick();
    };
    const first = menu.querySelector('.menu-item');
    if (first && !(where instanceof Element)) first.focus({ preventScroll: true });
  },

  /** Open the pop-up with any content, placed so it stays on screen. */
  openPopover(where, html) {
    const menu = $('#menu');
    menu.hidden = true;                    // restart the open animation
    menu.innerHTML = html;
    menu.onclick = null;
    menu.hidden = false;

    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    let left, top, below = true;
    if (where instanceof Element) {
      const r = where.getBoundingClientRect();
      left = r.right - w;
      top = r.bottom + 8;
      if (top + h > window.innerHeight - 8) { top = r.top - h - 8; below = false; }
    } else {
      left = where.x;
      top = where.y;
      if (top + h > window.innerHeight - 8) { top = where.y - h; below = false; }
    }
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.setProperty('--ox', below ? 'top' : 'bottom');
    menu.style.setProperty('--oy', where instanceof Element ? 'right' : 'left');
    return menu;
  },

  closeMenu() {
    const menu = $('#menu');
    if (!menu.hidden) menu.hidden = true;     // no page change at all when it is already closed
  },

  menuOpen() {
    return !$('#menu').hidden;
  },

  // ---------------------------------------------------------------- dialogs

  /**
   * Show any content in the dialog box. Returns the <dialog> element.
   * It is opened with show() plus our own backdrop and focus trap, instead of showModal():
   * the browser's modal mode makes it restyle the whole page, which stutters on slower laptops.
   */
  modal(html, className = '') {
    const d = $('#dialog');
    d.className = 'dialog ' + className;
    $('#dialog-body').innerHTML = html;
    UI.fillIcons(d);
    if (!d.open) {
      UI._returnFocus = document.activeElement;
      $('#dialog-backdrop').hidden = false;
      d.show();
    }
    return d;
  },

  closeModal() {
    const d = $('#dialog');
    if (d.open) d.close();
  },

  /** Wire the dialog once: backdrop, Esc, and keeping Tab inside the dialog. */
  initDialog() {
    const d = $('#dialog');
    d.addEventListener('close', () => {
      $('#dialog-backdrop').hidden = true;
      if (UI._returnFocus && UI._returnFocus.isConnected) UI._returnFocus.focus({ preventScroll: true });
    });
    d.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); d.close(); return; }
      if (e.key !== 'Tab') return;
      const items = [...d.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')]
        .filter((el) => !el.disabled && el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  },

  /**
   * A simple question. With `value` it has a text box and resolves to the text;
   * without it, it is a yes/no box and resolves to true. Cancel resolves to null.
   */
  dialog({ title, message = '', value, confirm = 'OK', danger = false }) {
    return new Promise((resolve) => {
      const hasInput = value !== undefined;
      const d = UI.modal(`
        <form method="dialog" id="ask-form">
          <h2>${UI.esc(title)}</h2>
          ${message ? `<p class="lead">${UI.esc(message)}</p>` : ''}
          ${hasInput ? `<input class="text-input" id="ask-input" maxlength="40" autocomplete="off" value="${UI.esc(value)}">` : ''}
          <div class="dialog-actions">
            <button type="button" class="btn ghost" id="ask-cancel">Cancel</button>
            <button type="submit" class="btn primary${danger ? ' danger-fill' : ''}">${UI.esc(confirm)}</button>
          </div>
        </form>`);
      let result = null;
      const input = $('#ask-input');
      $('#ask-form').onsubmit = (e) => {
        e.preventDefault();
        if (hasInput) {
          const text = input.value.trim();
          if (!text) { input.focus(); return; }
          result = text;
        } else {
          result = true;
        }
        d.close();
      };
      $('#ask-cancel').onclick = () => d.close();
      d.addEventListener('close', () => resolve(result), { once: true });
      if (hasInput) { input.focus(); input.select(); }
    });
  },

  // ---------------------------------------------------------------- chart tooltip

  showTip(html, x, y) {
    let tip = $('#tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'tip';
      tip.className = 'tip';
      document.body.appendChild(tip);
    }
    tip.innerHTML = html;
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = Math.max(8, Math.min(x + 14, window.innerWidth - w - 8)) + 'px';
    tip.style.top = Math.max(8, y - tip.offsetHeight - 12) + 'px';
  },

  hideTip() {
    const tip = $('#tip');
    if (tip) tip.hidden = true;
  },
};
