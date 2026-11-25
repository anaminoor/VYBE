// palette.js - the quick search box (Ctrl+K) and the keyboard shortcuts list (?).

const Palette = {
  items: [],        // what is listed right now: { group, icon, label, sub, hint, run }
  index: 0,         // which item is highlighted
  timer: 0,
  seq: 0,

  actions() {
    return [
      { icon: 'plus', label: 'New playlist', run: () => createPlaylist() },
      { icon: 'music', label: 'Add a song', run: () => Forms.song() },
      { icon: 'home', label: 'Go to Home', run: () => { location.hash = '#/home'; } },
      { icon: 'chart', label: 'Open Stats', run: () => { location.hash = '#/stats'; } },
      { icon: 'clock', label: 'Recently played', run: () => { location.hash = '#/recent'; } },
      { icon: 'queue', label: 'Show up next', hint: 'Q', run: () => NowPlaying.toggleQueue(true) },
      { icon: 'expand', label: 'Full-screen player', hint: 'F', run: () => NowPlaying.openFull() },
      { icon: 'sun', label: 'Switch light / dark theme', run: () => UI.toggleTheme() },
      { icon: 'keyboard', label: 'Keyboard shortcuts', hint: '?', run: () => Shortcuts.open() },
    ].map((a) => ({ ...a, group: 'Actions' }));
  },

  init() {
    const wrap = $('#palette');
    const input = $('#palette-input');

    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) Palette.close(); });
    input.addEventListener('input', () => {
      clearTimeout(Palette.timer);
      Palette.timer = setTimeout(() => Palette.search(input.value.trim()), 110);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); Palette.move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); Palette.move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); Palette.run(Palette.index); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); Palette.close(); }
    });
    $('#palette-list').addEventListener('click', (e) => {
      const item = e.target.closest('[data-i]');
      if (item) Palette.run(Number(item.dataset.i));
    });
    $('#palette-list').addEventListener('pointermove', (e) => {
      const item = e.target.closest('[data-i]');
      if (item && Number(item.dataset.i) !== Palette.index) { Palette.index = Number(item.dataset.i); Palette.highlight(); }
    });
  },

  isOpen() {
    return !$('#palette').hidden;
  },

  open() {
    UI.closeMenu();
    $('#palette').hidden = false;
    const input = $('#palette-input');
    input.value = '';
    input.focus();
    Palette.search('');
  },

  close() {
    $('#palette').hidden = true;
  },

  async search(q) {
    const my = ++Palette.seq;
    const lower = q.toLowerCase();
    const actions = Palette.actions().filter((a) => a.label.toLowerCase().includes(lower));
    let items = [];

    if (!q) {
      const playlists = state.playlists.filter((p) => !p.builtIn).map((p) => Palette.playlistItem(p));
      items = actions.concat(playlists);
    } else {
      let found = { songs: [], artists: [], albums: [], playlists: [] };
      try { found = await Api.searchAll(q); } catch (e) { /* show the actions only */ }
      if (my !== Palette.seq) return;                    // a newer search has started
      items = [
        ...found.songs.map((s) => ({ group: 'Songs', icon: 'music', label: s.title, sub: s.artist, hint: 'Play', run: () => playFromLibrary(s.id) })),
        ...found.artists.map((a) => ({ group: 'Artists', icon: 'user', label: a.name, sub: UI.plural(a.songs, 'song'), run: () => { location.hash = UI.artistHref(a.name); } })),
        ...found.albums.map((a) => ({ group: 'Albums', icon: 'disc', label: a.name, sub: a.artist, run: () => { location.hash = UI.albumHref(a.artist, a.name); } })),
        ...found.playlists.map((p) => Palette.playlistItem(p)),
        ...actions,
      ];
    }
    Palette.items = items;
    Palette.index = 0;
    Palette.render(q);
  },

  playlistItem(p) {
    return { group: 'Playlists', icon: 'list', label: p.name, sub: UI.plural(p.count, 'song'), run: () => { location.hash = '#/playlist/' + p.id; } };
  },

  render(q) {
    const list = $('#palette-list');
    if (!Palette.items.length) {
      list.innerHTML = `<div class="p-none">Nothing matches “${UI.esc(q)}”.</div>`;
      return;
    }
    let group = '';
    list.innerHTML = Palette.items.map((item, i) => {
      const head = item.group !== group ? `<div class="p-group">${item.group}</div>` : '';
      group = item.group;
      return head + `
        <button class="p-item" data-i="${i}" tabindex="-1">
          <span class="p-icon">${UI.icon(item.icon)}</span>
          <span class="t"><span class="title">${UI.esc(item.label)}</span>${item.sub ? `<span class="artist">${UI.esc(item.sub)}</span>` : ''}</span>
          ${item.hint ? `<span class="p-hint">${item.hint}</span>` : ''}
        </button>`;
    }).join('');
    Palette.highlight();
  },

  highlight() {
    $$('#palette-list .p-item').forEach((el) => {
      const on = Number(el.dataset.i) === Palette.index;
      el.classList.toggle('sel', on);
      if (on) el.scrollIntoView({ block: 'nearest' });
    });
  },

  move(step) {
    const n = Palette.items.length;
    if (!n) return;
    Palette.index = (Palette.index + step + n) % n;
    Palette.highlight();
  },

  run(i) {
    const item = Palette.items[i];
    if (!item) return;
    Palette.close();
    item.run();
  },
};

const Shortcuts = {
  KEYS: [
    ['Play / pause', 'Space'], ['Next song', 'N'], ['Previous song', 'P'],
    ['Seek 5 seconds', '←', '→'], ['Volume', '↑', '↓'], ['Mute', 'M'],
    ['Like the playing song', 'L'], ['Full-screen player', 'F'], ['Up next', 'Q'],
    ['Quick search', 'Ctrl', 'K'], ['Search this list', '/'], ['Select all songs', 'Ctrl', 'A'],
    ['Select more', 'Ctrl / Shift', 'click'], ['Remove selected', 'Delete'],
    ['Move a song in a playlist', 'Alt', '↑ ↓'], ['Close / cancel', 'Esc'],
  ],

  open() {
    const d = UI.modal(`
      <h2>Keyboard shortcuts</h2>
      <div class="keys">
        ${Shortcuts.KEYS.map(([label, ...keys]) => `<div>${label}<span>${keys.map((k) => `<kbd>${k}</kbd>`).join('')}</span></div>`).join('')}
      </div>
      <div class="dialog-actions"><button type="button" class="btn primary" id="keys-close">Got it</button></div>`, 'wide');
    $('#keys-close').onclick = () => d.close();
    $('#keys-close').focus();
  },
};
