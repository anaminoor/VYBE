// selection.js - selecting several songs (Ctrl-click, Shift-click, Ctrl+A),
// the action bar that appears for them, and the right-click menu.

const Selection = {
  ids: new Set(),
  anchor: null,         // the last song clicked, for Shift-click ranges

  init() {
    $('#select-bar').addEventListener('click', (e) => {
      const button = e.target.closest('[data-sel]');
      if (!button) return;
      const songs = Selection.songs();
      const ids = songs.map((s) => s.id);
      switch (button.dataset.sel) {
        case 'queue':  queueSongs(ids); Selection.clear(); break;
        case 'add':    Selection.playlistMenu(button, songs); break;
        case 'like':   likeSongs(ids, true); break;
        case 'unlike': likeSongs(ids, false); break;
        case 'remove': removeSongs(ids); break;
        case 'clear':  Selection.clear(); break;
      }
    });
  },

  /** The selected songs, in the order they are shown. */
  songs() {
    return state.list ? state.list.songs.filter((s) => Selection.ids.has(s.id)) : [];
  },

  toggle(id) {
    if (Selection.ids.has(id)) Selection.ids.delete(id);
    else Selection.ids.add(id);
    Selection.anchor = id;
    Selection.render();
  },

  /** Shift-click: select everything between the last clicked song and this one. */
  range(id) {
    const songs = state.list.songs;
    const from = songs.findIndex((s) => s.id === Selection.anchor);
    const to = songs.findIndex((s) => s.id === id);
    if (from < 0 || to < 0) return Selection.toggle(id);
    for (let i = Math.min(from, to); i <= Math.max(from, to); i++) Selection.ids.add(songs[i].id);
    Selection.render();
  },

  all() {
    if (!state.list) return;
    state.list.songs.forEach((s) => Selection.ids.add(s.id));
    Selection.render();
  },

  clear() {
    if (!Selection.ids.size) return;
    Selection.ids.clear();
    Selection.anchor = null;
    Selection.render();
  },

  render() {
    // Forget songs that are no longer on the page.
    const shown = new Set(state.list ? state.list.songs.map((s) => s.id) : []);
    for (const id of [...Selection.ids]) if (!shown.has(id)) Selection.ids.delete(id);

    $$('#song-list .song-row').forEach((row) => row.classList.toggle('selected', Selection.ids.has(Number(row.dataset.id))));
    const n = Selection.ids.size;
    const bar = $('#select-bar');
    bar.classList.toggle('show', n > 0);
    bar.inert = n === 0;
    $('#select-count').textContent = n + ' selected';
    bar.querySelector('[data-sel="remove"]').hidden = !isUserPlaylist();
  },

  // ---------------------------------------------------------------- menus

  /** "Add to playlist" list for one or more songs. */
  playlistMenu(where, songs) {
    const targets = state.playlists.filter((p) => !p.builtIn && !(state.list && state.list.kind === 'playlist' && p.id === state.list.id));
    const items = targets.map((p) => ({
      label: p.name,
      icon: 'list',
      onClick: () => addSongsTo(p, songs),
    }));
    if (items.length) items.push({ sep: true });
    items.push({ label: 'New playlist…', icon: 'plus', onClick: () => createPlaylist(songs) });
    UI.openMenu(where, 'Add to playlist', items);
  },

  /** Right-click menu (also opened by the "⋯" button on a row). */
  menu(where, song) {
    // Right-clicking a selected row acts on the whole selection.
    const many = Selection.ids.has(song.id) && Selection.ids.size > 1;
    const songs = many ? Selection.songs() : [song];
    const ids = songs.map((s) => s.id);
    const items = [];

    if (!many) items.push({ label: 'Play', icon: 'play', onClick: () => playSong(song.id, true) });
    items.push({ label: 'Play next', icon: 'queue-add', onClick: () => { queueSongs(ids); if (many) Selection.clear(); } });
    items.push({ label: 'Add to playlist…', icon: 'plus', onClick: () => Selection.playlistMenu(where, songs) });
    if (many) {
      items.push({ label: 'Like all', icon: 'heart', onClick: () => likeSongs(ids, true) });
    } else {
      items.push({ label: song.liked ? 'Remove from Liked Songs' : 'Add to Liked Songs', icon: 'heart', onClick: () => toggleLike(song.id) });
      items.push({ sep: true });
      items.push({ label: 'Go to artist', icon: 'user', onClick: () => { location.hash = UI.artistHref(song.artist); } });
      items.push({ label: 'Go to album', icon: 'disc', onClick: () => { location.hash = UI.albumHref(song.artist, song.album); } });
      items.push({ label: 'Edit song…', icon: 'edit', onClick: () => Forms.song(song) });
    }
    if (isUserPlaylist()) {
      items.push({ sep: true });
      items.push({ label: 'Remove from this playlist', icon: 'trash', danger: true, onClick: () => removeSongs(ids) });
    }
    UI.openMenu(where, many ? songs.length + ' songs' : song.title, items);
  },
};
