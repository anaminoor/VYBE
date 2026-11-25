// forms.js - the add / edit song form, the playlist cover picker and the accent colour picker.
// The forms only collect input: Java checks it and sends back any errors.

const COVER_EMOJIS = ['🎵', '🎧', '🔥', '🌙', '☀️', '🌊', '🏃', '💜', '⭐', '🎸', '🎹', '🥁', '🌧️', '☕', '🚗', '🎉', '💤', '🌸', '⚡', '🍃'];
const ACCENTS = [258, 330, 172, 24, 212, 140];
const GENRES = ['Pop', 'Rock', 'Indie', 'Electronic', 'Synthwave', 'Lo-fi', 'Jazz', 'Folk', 'World', 'Hip-hop', 'Classical', 'Blues', 'Country', 'Ambient', 'Metal'];

const Forms = {

  // ---------------------------------------------------------------- add / edit song

  /** Pass a song to edit it, or nothing to add a new one. */
  song(song) {
    const editing = !!song;
    const field = (name, label, value, attrs = '') => `
      <label class="field" data-field="${name}">
        <span>${label}</span>
        <input name="${name}" value="${UI.esc(value)}" autocomplete="off" ${attrs}>
        <small class="field-error"></small>
      </label>`;

    const d = UI.modal(`
      <form id="song-form" novalidate>
        <h2>${editing ? 'Edit song' : 'Add a song'}</h2>
        <p class="lead">${editing ? 'Change the details and save.' : 'It is added to All Songs. There is no audio, so only the details are needed.'}</p>
        ${field('title', 'Title', editing ? song.title : '', 'maxlength="60" required')}
        ${field('artist', 'Artist', editing ? song.artist : '', 'maxlength="60" required')}
        <div class="field-row">
          ${field('album', 'Album', editing ? song.album : '', 'maxlength="40"')}
          ${field('genre', 'Genre', editing ? song.genre : '', 'maxlength="40" list="genre-list"')}
        </div>
        <div class="field-row">
          ${field('year', 'Year', editing ? (song.year || '') : new Date().getFullYear(), 'inputmode="numeric" maxlength="4"')}
          ${field('duration', 'Length (min:sec)', editing ? UI.time(song.duration) : '', 'placeholder="3:45" maxlength="5"')}
        </div>
        <datalist id="genre-list">${GENRES.map((g) => `<option value="${g}">`).join('')}</datalist>
        <div class="dialog-actions">
          <button type="button" class="btn ghost" id="song-cancel">Cancel</button>
          <button type="submit" class="btn primary">${editing ? 'Save changes' : 'Add song'}</button>
        </div>
      </form>`, 'wide');

    const form = $('#song-form');
    $('#song-cancel').onclick = () => d.close();
    form.querySelector('input').focus();

    // Clear a field's error as soon as you type in it.
    form.addEventListener('input', (e) => {
      const box = e.target.closest('.field');
      if (box) box.classList.remove('bad');
    });

    form.onsubmit = async (e) => {
      e.preventDefault();
      const fields = Object.fromEntries(new FormData(form));
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      try {
        const saved = editing ? await Api.updateSong(song.id, fields) : await Api.createSong(fields);
        d.close();
        UI.toast(editing ? 'Saved “' + saved.title + '”' : 'Added “' + saved.title + '” to All Songs');
        await afterSongSaved(saved, !editing);
      } catch (error) {
        button.disabled = false;
        if (!error.fields) { UI.toast(error.message, 'error'); return; }
        // Show each message from Java under its own box.
        let first = null;
        form.querySelectorAll('.field').forEach((box) => {
          const message = error.fields[box.dataset.field];
          box.classList.toggle('bad', !!message);
          box.querySelector('.field-error').textContent = message || '';
          if (message && !first) first = box.querySelector('input');
        });
        if (first) first.focus();
      }
    };
  },

  // ---------------------------------------------------------------- playlist cover

  cover(playlist) {
    let gradient = playlist.gradient;
    let emoji = playlist.emoji || '';

    const d = UI.modal(`
      <h2>Playlist cover</h2>
      <p class="lead">Pick a colour and an emoji for “${UI.esc(playlist.name)}”.</p>
      <div class="cover-pick">
        <div class="cover" id="cover-preview"></div>
        <div class="pick-col">
          <p class="pick-label">Colour</p>
          <div class="pick-grid" id="pick-gradients">
            ${COVER_GRADIENTS.map((g, i) => `<button type="button" class="pick" data-g="${i}" style="${UI.gradient(g[0], g[1])}" aria-label="Colour ${i + 1}"></button>`).join('')}
          </div>
          <p class="pick-label">Emoji</p>
          <div class="pick-grid emoji" id="pick-emojis">
            <button type="button" class="pick e" data-e="" title="No emoji" aria-label="No emoji">${UI.icon('list')}</button>
            ${COVER_EMOJIS.map((e) => `<button type="button" class="pick e" data-e="${e}">${e}</button>`).join('')}
          </div>
        </div>
      </div>
      <div class="dialog-actions">
        <button type="button" class="btn ghost" id="cover-cancel">Cancel</button>
        <button type="button" class="btn primary" id="cover-save">Save cover</button>
      </div>`, 'wide');

    const draw = () => {
      const preview = $('#cover-preview');
      preview.style.cssText = UI.playlistStyle({ ...playlist, gradient, emoji });
      preview.innerHTML = emoji ? UI.esc(emoji) : '';
      $$('#pick-gradients .pick').forEach((b) => b.classList.toggle('on', Number(b.dataset.g) === gradient));
      $$('#pick-emojis .pick').forEach((b) => b.classList.toggle('on', b.dataset.e === emoji));
    };
    draw();

    $('#pick-gradients').onclick = (e) => {
      const b = e.target.closest('[data-g]');
      if (b) { gradient = Number(b.dataset.g); draw(); }
    };
    $('#pick-emojis').onclick = (e) => {
      const b = e.target.closest('[data-e]');
      if (b) { emoji = b.dataset.e; draw(); }
    };
    $('#cover-cancel').onclick = () => d.close();
    $('#cover-save').onclick = () => attempt(async () => {
      await Api.cover(playlist.id, gradient, emoji);
      d.close();
      UI.toast('Cover updated');
      await refresh();
    });
  },

  // ---------------------------------------------------------------- accent colour

  accent(anchor) {
    const current = Store.get('accent', 'auto');
    const menu = UI.openPopover(anchor, `
      <div class="menu-title">Accent colour</div>
      <div class="swatches">
        <button class="swatch-btn auto${current === 'auto' ? ' on' : ''}" data-accent="auto" title="Auto: follows the playing song" aria-label="Auto">A</button>
        ${ACCENTS.map((h) => `<button class="swatch-btn${current === String(h) ? ' on' : ''}" data-accent="${h}" style="--sw:${h}" aria-label="Accent colour"></button>`).join('')}
      </div>
      <div class="menu-title" style="padding-top:0;text-transform:none;letter-spacing:0;font-weight:500">Auto follows the colour of the playing song.</div>`);
    menu.onclick = (e) => {
      const b = e.target.closest('[data-accent]');
      if (!b) return;
      UI.setAccent(b.dataset.accent);
      menu.querySelectorAll('.swatch-btn').forEach((s) => s.classList.toggle('on', s === b));
    };
  },
};
