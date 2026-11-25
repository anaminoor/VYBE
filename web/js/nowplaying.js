// nowplaying.js - the full-screen player (big cover, karaoke lyrics)
// and the "Up next" queue, shown in the side panel and inside full screen.

const NowPlaying = {
  fsOpen: false,
  queueOpen: false,
  tab: 'lyrics',
  queueData: null,
  lyricsCache: new Map(),     // song id -> lines
  lyricsFor: null,            // song id currently shown
  activeLine: -1,

  init() {
    // Tabs inside full screen
    document.querySelector('.tabs').addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (tab) NowPlaying.setTab(tab.dataset.tab);
    });
    $('#fs-queue-tab').addEventListener('click', () => NowPlaying.setTab(NowPlaying.tab === 'queue' ? 'lyrics' : 'queue'));

    // Clicks inside either queue list
    for (const body of [$('#queue-body'), $('#fs-queue')]) {
      body.addEventListener('click', (e) => {
        const remove = e.target.closest('[data-q-remove]');
        if (remove) {
          e.stopPropagation();
          return attempt(async () => setPlayerInfo(await Api.queueRemove(remove.dataset.qRemove)));
        }
        if (e.target.closest('[data-q-clear]')) {
          return attempt(async () => {
            setPlayerInfo(await Api.queueClear());
            UI.toast('Queue cleared');
          });
        }
        const queued = e.target.closest('[data-q-play]');
        if (queued) return playerAction(() => Api.queuePlay(queued.dataset.qPlay));
        const next = e.target.closest('[data-next]');
        if (next) return playerAction(() => Api.play(NowPlaying.queueData.playlistId, next.dataset.next));
      });
    }

    // Click a lyric line to jump there
    $('#fs-lyrics').addEventListener('click', (e) => {
      const line = e.target.closest('p[data-t]');
      if (!line) return;
      Player.seekTo(Number(line.dataset.t));
      if (!Player.playing) Player.toggle();
    });

    // Swipe down to close on touch screens
    let startY = null;
    const top = document.querySelector('.fs-left');
    top.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; }, { passive: true });
    top.addEventListener('touchend', (e) => {
      if (startY !== null && e.changedTouches[0].clientY - startY > 90 && $('#fs').scrollTop <= 0) NowPlaying.closeFull();
      startY = null;
    }, { passive: true });
  },

  // ---------------------------------------------------------------- full screen

  toggleFull() {
    if (NowPlaying.fsOpen) NowPlaying.closeFull();
    else NowPlaying.openFull();
  },

  openFull() {
    if (NowPlaying.fsOpen || !Player.song) {
      if (!Player.song) UI.toast('Pick a song first', 'info');
      return;
    }
    const fs = $('#fs');
    const from = $('#np-art').getBoundingClientRect();
    NowPlaying.fsOpen = true;
    NowPlaying.toggleQueue(false);
    fs.classList.add('open');
    fs.inert = false;

    // The small cover in the player bar grows into the big one.
    const art = $('#fs-art');
    const to = art.getBoundingClientRect();
    if (!Motion.reduced && to.width) {
      art.animate([
        { transformOrigin: 'top left', transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`, borderRadius: '40%' },
        { transformOrigin: 'top left', transform: 'none', borderRadius: '28px' },
      ], { duration: 620, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    }

    NowPlaying.loadLyrics();
    NowPlaying.refresh();
    Visualiser.kick();
    fs.querySelector('[data-cmd="full"]').focus({ preventScroll: true });
  },

  closeFull() {
    if (!NowPlaying.fsOpen) return;
    NowPlaying.fsOpen = false;
    // The big cover shrinks back into the player bar while the screen fades.
    const art = $('#fs-art');
    const from = art.getBoundingClientRect();
    const to = $('#np-art').getBoundingClientRect();
    if (!Motion.reduced && from.width && to.width) {
      art.animate([
        { transformOrigin: 'top left', transform: 'none' },
        { transformOrigin: 'top left', transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width})`, borderRadius: '40%' },
      ], { duration: 320, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });
    }
    const fs = $('#fs');
    fs.classList.remove('open');
    fs.inert = true;
  },

  setTab(tab) {
    NowPlaying.tab = tab;
    $$('.tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    $('#fs-lyrics').hidden = tab !== 'lyrics';
    $('#fs-queue').hidden = tab !== 'queue';
    $('#fs-queue-tab').classList.toggle('on', tab === 'queue');
    if (tab === 'lyrics') { NowPlaying.activeLine = -1; NowPlaying.syncLyrics(); }
    else NowPlaying.refresh();
  },

  // ---------------------------------------------------------------- lyrics

  async loadLyrics() {
    const pane = $('#fs-lyrics');
    const song = Player.song;
    if (!song) { pane.innerHTML = ''; NowPlaying.lyricsFor = null; NowPlaying.lines = []; return; }
    if (NowPlaying.lyricsFor === song.id) return;
    NowPlaying.lyricsFor = song.id;
    NowPlaying.activeLine = -1;

    let lines = NowPlaying.lyricsCache.get(song.id);
    if (!lines) {
      try {
        lines = (await Api.lyrics(song.id)).lines;
        NowPlaying.lyricsCache.set(song.id, lines);
      } catch (e) {
        lines = [];
      }
    }
    if (NowPlaying.lyricsFor !== song.id) return;        // the song changed while loading
    pane.innerHTML = lines.length
      ? lines.map((line) => `<p data-t="${line.t}">${UI.esc(line.text)}</p>`).join('') +
        ''
      : '<p class="lyrics-note">Lyrics aren\'t available for this song.</p>';
    NowPlaying.lines = [...pane.querySelectorAll('p[data-t]')].map((el) => ({ el, t: Number(el.dataset.t) }));
    pane.scrollTop = 0;
    NowPlaying.syncLyrics();
  },

  /** Highlight the line being "sung" and keep it in the middle. Called on every tick. */
  syncLyrics() {
    if (!NowPlaying.fsOpen || NowPlaying.tab !== 'lyrics') return;
    const pane = $('#fs-lyrics');
    const lines = NowPlaying.lines || [];
    let active = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].t <= Player.elapsed + 0.15) active = i;
      else break;
    }
    if (active === NowPlaying.activeLine) return;
    NowPlaying.activeLine = active;
    lines.forEach((line, i) => {
      line.el.classList.toggle('active', i === active);
      line.el.classList.toggle('past', i < active);
      line.el.classList.toggle('soon', i === active + 1);
    });
    const target = lines[Math.max(active, 0)] && lines[Math.max(active, 0)].el;
    if (target) {
      SmoothScroll.to(pane, target.offsetTop - pane.clientHeight / 2 + target.offsetHeight / 2);
    }
  },

  // ---------------------------------------------------------------- up next

  toggleQueue(open) {
    const next = open === undefined ? !NowPlaying.queueOpen : open;
    if (next === NowPlaying.queueOpen) return;
    if (next && NowPlaying.fsOpen) { NowPlaying.setTab('queue'); return; }   // full screen has its own queue tab
    NowPlaying.queueOpen = next;
    const panel = $('#queue-panel');
    const slide = () => {
      if (NowPlaying.queueOpen !== next) return;        // toggled again meanwhile
      panel.classList.toggle('open', next);
      panel.inert = !next;
    };
    $('#btn-queue').classList.toggle('on', next);
    if (next) NowPlaying.refresh(true).then(() => requestAnimationFrame(slide));
    else slide();
  },

  /** Reload the queue from Java if it is visible anywhere. */
  async refresh(animate) {
    const inFs = NowPlaying.fsOpen && NowPlaying.tab === 'queue';
    if (!NowPlaying.queueOpen && !inFs) return;
    try {
      NowPlaying.queueData = await Api.queue();
    } catch (e) {
      return;
    }
    const html = NowPlaying.queueHtml(NowPlaying.queueData, animate);
    if (NowPlaying.queueOpen) $('#queue-body').innerHTML = html;
    if (inFs) $('#fs-queue').innerHTML = html;
  },

  queueHtml(q, animate) {
    let n = 0;
    const item = (s, attrs, extra = '', now = false) => `
      <div class="q-item${now ? ' now' : ''}" ${attrs} ${now ? '' : 'role="button" tabindex="0"'}
           style="${animate && n < 8 ? `--d:${n++ * 30}ms` : 'animation:none'}">
        <div class="art" style="${UI.songStyle(s)}"></div>
        <div class="t"><div class="title">${UI.esc(s.title)}</div><div class="artist">${UI.esc(s.artist)}</div></div>
        ${extra}
      </div>`;

    let html = '<div class="q-head"><span>Now playing</span></div>';
    html += q.current
      ? item(q.current, '', '', true)
      : '<p class="q-empty">Nothing is playing.</p>';

    if (q.queued.length) {
      html += '<div class="q-head"><span>Next in queue</span><button data-q-clear>Clear</button></div>';
      html += q.queued.map((s, i) => item(s, `data-q-play="${i}"`,
        `<button class="icon-btn small" data-q-remove="${i}" title="Remove from queue" aria-label="Remove from queue">${UI.icon('x')}</button>`)).join('');
    }

    html += `<div class="q-head"><span>Next from ${UI.esc(q.playlistName)}</span></div>`;
    html += q.next.length
      ? q.next.map((s) => item(s, `data-next="${s.id}"`)).join('')
      : '<p class="q-empty">This is the last song. Turn on repeat to keep going, or right-click a song and choose “Play next”.</p>';
    return html;
  },

  /** Called by the app whenever the playing song changes. */
  onSongChange() {
    NowPlaying.loadLyrics();          // ready before full screen is opened, so opening is instant
    NowPlaying.refresh();
  },
};
