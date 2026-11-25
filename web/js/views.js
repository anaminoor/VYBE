// views.js - builds the HTML of each page inside #view:
// song lists (All Songs, Liked, Recent, playlists, artist, album), Home and Stats.

const SORT_FIELDS = [
  ['title', 'Title'], ['artist', 'Artist'], ['album', 'Album'], ['genre', 'Genre'],
  ['year', 'Year'], ['duration', 'Duration'], ['added', 'Date added'], ['plays', 'Most played'],
];

const Views = {

  // ---------------------------------------------------------------- song list pages

  /** state.list = { kind, name, songs, ... } - see loadData() in app.js */
  list(state, animate) {
    const list = state.list;
    const kind = list.kind;
    const isUser = kind === 'playlist' && !list.builtIn;
    const canReorder = kind === 'playlist';                 // All Songs, Liked and your playlists
    const draggable = isUser && !state.query;

    // Hero header
    let cover, eyebrow, meta;
    if (kind === 'artist') {
      cover = `<div class="cover circle" style="${UI.artistStyle(list.name)}">${UI.esc(UI.initials(list.name))}</div>`;
      eyebrow = 'Artist';
      meta = `${UI.plural(list.count, 'song')} · ${UI.plural(list.albums.length, 'album')} · ${UI.plural(list.plays, 'play')}`;
    } else if (kind === 'album') {
      cover = `<div class="cover" style="${UI.songStyle({ id: list.firstSongId })}"></div>`;
      eyebrow = 'Album';
      meta = `<a href="${UI.artistHref(list.artist)}">${UI.esc(list.artist)}</a> · ${list.year || 'Year unknown'} · ${UI.plural(list.count, 'song')} · ${UI.longTime(list.duration)}`;
    } else if (kind === 'recent') {
      cover = `<div class="cover" style="${UI.gradient(190, 235)}">${UI.icon('clock')}</div>`;
      eyebrow = 'History';
      meta = 'Your last ' + UI.plural(list.total, 'song') + ', newest first';
    } else if (isUser) {
      cover = `<button class="cover editable" data-action="cover" style="${UI.playlistStyle(list)}" title="Change cover" aria-label="Change cover">
                 ${list.emoji ? UI.esc(list.emoji) : ''}<span class="cover-edit">${UI.icon('image')}</span></button>`;
      eyebrow = 'Playlist';
    } else {
      const liked = list.id === -2;
      cover = `<div class="cover" style="${liked ? UI.gradient(335, 290) : UI.gradient(258, 212)}">${UI.icon(liked ? 'heart' : 'music')}</div>`;
      eyebrow = 'Collection';
    }
    if (!meta) meta = Views.num(list.count) + (list.count === 1 ? ' song' : ' songs') + (list.count ? ' · ' + UI.longTime(list.duration) : '');
    if (state.query) meta += ' · showing ' + list.songs.length + (list.songs.length === 1 ? ' match' : ' matches');

    const sortLabel = (SORT_FIELDS.find((f) => f[0] === state.sortField) || [0, 'Sort'])[1];
    const toolbar = `
      <div class="toolbar${animate ? ' en' : ''}">
        <button class="btn primary round" data-action="play-all" title="Play from the first song" aria-label="Play"
          ${list.songs.length ? '' : 'disabled'}>${UI.icon('play')}</button>
        ${canReorder ? `
          <button class="btn" data-action="shuffle" title="Shuffle the order of this list">${UI.icon('shuffle')}Shuffle</button>
          <div class="sort">
            <button class="btn" data-action="sort" title="Sort this list">${UI.icon('sort')}${sortLabel}</button>
            <button class="btn icon-only" data-action="sort-order" aria-label="Sort order"
              title="${state.sortOrder === 'asc' ? 'Ascending (click for descending)' : 'Descending (click for ascending)'}">${UI.icon(state.sortOrder === 'asc' ? 'up' : 'down')}</button>
          </div>` : ''}
        ${kind === 'artist' ? `<button class="btn" data-action="shuffle-play">${UI.icon('shuffle')}Shuffle play</button>` : ''}
        <div class="spacer"></div>
        ${isUser ? `
          <button class="btn ghost" data-action="rename">${UI.icon('edit')}Rename</button>
          <button class="btn ghost danger" data-action="delete">${UI.icon('trash')}Delete</button>` : ''}
      </div>`;

    let body;
    if (list.songs.length) {
      body = UI.songsTable(list.songs, { animate, draggable });
    } else if (state.query) {
      body = `<div class="songs">${UI.empty('search', 'No matches', 'Nothing matches “' + state.query + '”. Try another title or artist.', { label: 'Clear search', action: 'clear-search' })}</div>`;
    } else if (kind === 'recent') {
      body = `<div class="songs">${UI.empty('clock', 'Nothing played yet', 'Play a song and it will show up here.', { label: 'Browse All Songs', href: '#/library' })}</div>`;
    } else if (list.id === -2) {
      body = `<div class="songs">${UI.empty('heart', 'No liked songs yet', 'Tap the heart on any song to keep it here.', { label: 'Find songs to like', href: '#/library' })}</div>`;
    } else {
      body = `<div class="songs">${UI.empty('music', 'This playlist is empty', 'Add songs from All Songs with the + button, or right-click any song.', { label: 'Browse All Songs', href: '#/library' })}</div>`;
    }

    let extra = '';
    if (kind === 'artist' && list.albums.length) {
      extra = `
        <section class="section">
          <div class="section-title"><h2>Albums</h2></div>
          <div class="grid">${list.albums.map((a) => Views.albumCard(a, animate)).join('')}</div>
        </section>`;
    }

    return `
      <div class="hero">
        ${cover}
        <div class="hero-info">
          <p class="eyebrow${animate ? ' en' : ''}">${eyebrow}</p>
          <h1 class="${animate ? 'en' : ''}">${UI.esc(list.name)}</h1>
          <p class="hero-meta${animate ? ' en' : ''}">${meta}</p>
        </div>
      </div>
      ${toolbar}
      ${body}
      ${extra}`;
  },

  /** A number that counts up when the page opens. */
  num(n) {
    return `<span data-count="${n}">${n}</span>`;
  },

  // ---------------------------------------------------------------- cards

  songCard(s, animate) {
    return `
      <button class="card${animate ? ' en' : ''}" data-song="${s.id}" title="Play ${UI.esc(s.title)}">
        <div class="cover" style="${UI.songStyle(s)}"><span class="card-play">${UI.icon('play')}</span></div>
        <div class="card-title">${UI.esc(s.title)}</div>
        <div class="card-sub">${UI.esc(s.artist)}</div>
      </button>`;
  },

  playlistCard(p, animate) {
    return `
      <a class="card${animate ? ' en' : ''}" href="#/playlist/${p.id}">
        <div class="cover" style="${UI.playlistStyle(p)}">${p.emoji ? UI.esc(p.emoji) : ''}</div>
        <div class="card-title">${UI.esc(p.name)}</div>
        <div class="card-sub">${UI.plural(p.count, 'song')}${p.count ? ' · ' + UI.longTime(p.duration) : ''}</div>
      </a>`;
  },

  albumCard(a, animate) {
    return `
      <a class="card${animate ? ' en' : ''}" href="${UI.albumHref(a.artist, a.name)}">
        <div class="cover" style="${UI.songStyle({ id: a.firstSongId })}"></div>
        <div class="card-title">${UI.esc(a.name)}</div>
        <div class="card-sub">${a.year ? a.year + ' · ' : ''}${UI.plural(a.songs, 'song')}</div>
      </a>`;
  },

  /** Tooltip text for a chart mark. Escaped twice: once for the attribute, once for the tooltip HTML. */
  tip(label, rest) {
    return UI.esc('<b>' + UI.esc(label) + '</b> · ' + rest);
  },

  /** Horizontal bars: one row per item, the longest bar is the biggest value. */
  bars(items, animate) {
    const max = Math.max(1, ...items.map((item) => item.value));
    return `<div class="bars">${items.map((item, i) => `
      <a class="bar-row" ${item.href ? `href="${item.href}"` : ''} ${item.song ? `data-song="${item.song}" href="#" role="button"` : ''}
         data-tip="${Views.tip(item.label, UI.plural(item.value, 'play'))}">
        <div class="bar-label"><b>${UI.esc(item.label)}</b>${item.sub ? `<span>${UI.esc(item.sub)}</span>` : ''}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(item.value / max) * 100}%;${animate ? `--d:${i * 60}ms` : 'animation:none'}"></div></div>
        <div class="bar-value">${item.value}</div>
      </a>`).join('')}</div>`;
  },

  // ---------------------------------------------------------------- home

  /** A wide tile on Home. listId: the list its play button starts (null = no play button). */
  quickItem(href, style, art, name, listId, animate) {
    return `
      <a class="quick-item${animate ? ' en' : ''}" href="${href}">
        <span class="quick-art" style="${style}">${art}</span>
        <span class="quick-name">${UI.esc(name)}</span>
        ${listId === null ? '' : `<span class="quick-play" data-action="play-list" data-list="${listId}" role="button" title="Play ${UI.esc(name)}">${UI.icon('play')}</span>`}
      </a>`;
  },

  home(data, animate) {
    const hour = new Date().getHours();
    const greeting = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    const recent = data.recent.length
      ? `<div class="h-wrap at-start">
           <button class="h-arrow prev" data-hs="-1" aria-label="Scroll left">${UI.icon('back')}</button>
           <div class="h-scroll">${data.recent.map((s) => Views.songCard(s, animate)).join('')}</div>
           <button class="h-arrow next" data-hs="1" aria-label="Scroll right">${UI.icon('forward')}</button>
         </div>`
      : `<div class="panel">${UI.empty('clock', 'Nothing played yet', 'Open All Songs and press play to get started.', { label: 'Browse All Songs', href: '#/library' })}</div>`;

    const topSongs = data.topSongs.length
      ? Views.bars(data.topSongs.map((s) => ({ label: s.title, sub: s.artist, value: s.plays, song: s.id })), animate)
      : '<p class="muted">Play some songs to see your favourites here.</p>';

    const artists = data.topArtists.map((a) => `
      <a class="artist-chip" href="${UI.artistHref(a.name)}" title="${UI.esc(a.name)}">
        <span class="avatar" style="${UI.artistStyle(a.name)}">${UI.esc(UI.initials(a.name))}</span>
        <span>${UI.esc(a.name)}</span>
      </a>`).join('');

    return `
      <div class="page-head">
        <h1 class="page-title${animate ? ' en' : ''}">${greeting}</h1>
        <p class="${animate ? 'en' : ''}">${Views.num(data.songCount)} songs in your library · ${Views.num(data.totalPlays)} plays so far</p>
        <div class="quick">
          ${Views.quickItem('#/liked', UI.gradient(250, 290), UI.icon('heart'), 'Liked Songs', -2, animate)}
          ${Views.quickItem('#/library', UI.gradient(258, 212), UI.icon('music'), 'All Songs', -1, animate)}
          ${data.playlists.slice(0, 5).map((p) => Views.quickItem('#/playlist/' + p.id, UI.playlistStyle(p),
              p.emoji ? UI.esc(p.emoji) : '', p.name, p.id, animate)).join('')}
          ${Views.quickItem('#/recent', UI.gradient(190, 235), UI.icon('clock'), 'Recently Played', null, animate)}
        </div>
      </div>

      <section class="section">
        <div class="section-title"><h2>Jump back in</h2><a href="#/recent">See history</a></div>
        ${recent}
      </section>

      <section class="section">
        <div class="section-title"><h2>Your playlists</h2></div>
        <div class="grid">
          ${data.playlists.map((p) => Views.playlistCard(p, animate)).join('')}
          <button class="card new${animate ? ' en' : ''}" data-action="new-playlist">${UI.icon('plus')}New playlist</button>
        </div>
      </section>

      <section class="section two-col">
        <div class="panel${animate ? ' en' : ''}">
          <h2>Most played</h2>
          <p class="panel-sub">Your top songs by number of plays</p>
          ${topSongs}
        </div>
        <div class="panel${animate ? ' en' : ''}">
          <h2>Top artists</h2>
          <p class="panel-sub">Who you listen to the most</p>
          <div class="artist-chips">${artists}</div>
        </div>
      </section>`;
  },

  // ---------------------------------------------------------------- stats

  stats(data, animate) {
    const hours = Math.floor(data.secondsListened / 3600);
    const minutes = Math.round((data.secondsListened % 3600) / 60);
    const tile = (icon, label, value, extra = '') => `
      <div class="tile${animate ? ' en' : ''}">
        <div class="tile-label">${UI.icon(icon)}${label}</div>
        <div class="tile-value">${value}${extra}</div>
      </div>`;

    const topSongs = data.topSongs.length
      ? Views.bars(data.topSongs.map((s) => ({ label: s.title, sub: s.artist, value: s.plays, song: s.id })), animate)
      : '<p class="muted">No plays yet.</p>';
    const played = data.topArtists.filter((a) => a.plays > 0);
    const topArtists = played.length
      ? Views.bars(played.map((a) => ({ label: a.name, sub: UI.plural(a.songs, 'song'), value: a.plays, href: UI.artistHref(a.name) })), animate)
      : '<p class="muted">No plays yet.</p>';

    return `
      <div class="page-head">
        <p class="eyebrow">Your listening</p>
        <h1 class="page-title${animate ? ' en' : ''}">Stats</h1>
      </div>

      <div class="tiles">
        ${tile('play', 'Total plays', `<span data-count="${data.totalPlays}">0</span>`)}
        ${tile('clock', 'Time listened', `<span data-count="${hours}">0</span><small>hr</small><span data-count="${minutes}">0</span><small>min</small>`)}
        ${tile('music', 'Songs', `<span data-count="${data.songs}">0</span>`)}
        ${tile('user', 'Artists', `<span data-count="${data.artists}">0</span>`)}
        ${tile('disc', 'Albums', `<span data-count="${data.albums}">0</span>`)}
        ${tile('heart', 'Liked songs', `<span data-count="${data.liked}">0</span>`)}
      </div>

      <section class="section two-col">
        <div class="panel${animate ? ' en' : ''}">
          <h2>Top songs</h2>
          <p class="panel-sub">Number of plays</p>
          ${topSongs}
        </div>
        <div class="panel${animate ? ' en' : ''}">
          <h2>Top artists</h2>
          <p class="panel-sub">Number of plays across all their songs</p>
          ${topArtists}
        </div>
      </section>

      <section class="section">
        <div class="panel${animate ? ' en' : ''}">
          ${Views.genreDonut(data)}
        </div>
      </section>`;
  },

  /**
   * Genre breakdown as a donut with a legend that also works as the data table.
   * At most 8 slices: the smallest genres are folded into "Other".
   */
  genreDonut(data) {
    const byPlays = data.totalPlays > 0;
    let items = data.genres.map((g) => ({ name: g.name, value: byPlays ? g.plays : g.songs }))
      .filter((g) => g.value > 0)
      .sort((a, b) => b.value - a.value);
    if (items.length > 8) {
      const rest = items.slice(7).reduce((sum, g) => sum + g.value, 0);
      items = items.slice(0, 7).concat({ name: 'Other', value: rest });
    }
    const total = items.reduce((sum, g) => sum + g.value, 0);
    const unit = byPlays ? 'play' : 'song';
    if (!total) return '<h2>Genres</h2><p class="muted">No songs yet.</p>';

    const r = 80;
    const c = 2 * Math.PI * r;
    const gap = items.length > 1 ? 2 : 0;          // a thin gap between slices
    let offset = 0;
    const slices = items.map((g, i) => {
      const length = (g.value / total) * c;
      const pct = Math.round((g.value / total) * 100);
      const circle = `<circle cx="100" cy="100" r="${r}" stroke="var(--s${i + 1})" data-slice="${i}"
        stroke-dasharray="${Math.max(length - gap, 0.5)} ${c}" stroke-dashoffset="${-offset}"
        data-tip="${Views.tip(g.name, UI.plural(g.value, unit) + ' · ' + pct + '%')}"></circle>`;
      offset += length;
      return circle;
    }).join('');

    const legend = items.map((g, i) => `
      <div class="legend-row" data-slice="${i}">
        <i style="background:var(--s${i + 1})"></i>
        <b>${UI.esc(g.name)}</b>
        <span>${Math.round((g.value / total) * 100)}%</span>
        <span class="v">${g.value}</span>
      </div>`).join('');

    return `
      <h2>Genres</h2>
      <p class="panel-sub">${byPlays ? 'Share of your plays by genre' : 'Songs in your library by genre'}</p>
      <div class="donut-wrap">
        <div class="donut" role="img" aria-label="Genre breakdown. The list beside it has the numbers.">
          <svg viewBox="0 0 200 200">${slices}</svg>
          <div class="donut-centre"><b>${total}</b><span>${unit}s</span></div>
        </div>
        <div class="legend">${legend}</div>
      </div>`;
  },

  /** Tooltips and legend highlighting for the charts (one listener for all pages). */
  initCharts() {
    const view = $('#view');
    view.addEventListener('pointermove', (e) => {
      const el = e.target.closest('[data-tip]');
      if (!el) { UI.hideTip(); Views.highlightSlice(null); return; }
      UI.showTip(el.dataset.tip, e.clientX, e.clientY);
      Views.highlightSlice(el.dataset.slice !== undefined ? el.dataset.slice : null);
    });
    view.addEventListener('pointerleave', () => { UI.hideTip(); Views.highlightSlice(null); });
    view.addEventListener('pointerover', (e) => {
      const row = e.target.closest('.legend-row');
      if (row) Views.highlightSlice(row.dataset.slice);
    });
  },

  highlightSlice(index) {
    $$('#view [data-slice]').forEach((el) => el.classList.toggle('on', index !== null && el.dataset.slice === String(index)));
  },
};
