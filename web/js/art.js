// art.js - generated cover artwork, so every song, playlist and artist has its own picture.
//
// Each cover is a small SVG drawing: a two-colour gradient plus one of eight patterns
// (rings, waves, stripes, dots, sun rays, blobs, arcs, diamonds). A seeded random number
// generator picks the pattern and its details from the id, so a song always gets the same cover.
//
// The SVG is turned into a data: URL once and reused as a background image. The browser
// decodes it once and then only paints a picture, which is much cheaper than live SVG.

const Art = {
  _cache: new Map(),
  covers: new Map(),     // song id -> address of its real cover image (from the songs folder)

  /** Look through any reply from Java and remember the real covers of the songs in it. */
  collect(data) {
    if (!data || typeof data !== 'object') return;
    if (Array.isArray(data)) { data.forEach(Art.collect); return; }
    if (typeof data.id === 'number' && 'cover' in data && 'artist' in data) {
      if (data.cover) Art.covers.set(data.id, data.cover);
      else Art.covers.delete(data.id);
    }
    for (const value of Object.values(data)) if (value && typeof value === 'object') Art.collect(value);
  },

  _hues: new Map(),

  /**
   * The main colour (hue, 0-359) of a cover image: the picture is shrunk to 16 x 16 pixels and the
   * colourful pixels are averaged. A black-and-white picture gives -1; an unreadable one gives null.
   */
  coverHue(url) {
    if (Art._hues.has(url)) return Promise.resolve(Art._hues.get(url));
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let hue = null;
        try {
          const c = document.createElement('canvas');
          c.width = c.height = 16;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, 16, 16);
          const px = ctx.getImageData(0, 0, 16, 16).data;
          let x = 0, y = 0, weight = 0;
          for (let i = 0; i < px.length; i += 4) {
            const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b), sat = max - min;
            if (sat < 0.15 || max < 0.15) continue;                 // skip grey, black and white pixels
            let h;
            if (max === r) h = ((g - b) / sat) % 6;
            else if (max === g) h = (b - r) / sat + 2;
            else h = (r - g) / sat + 4;
            const angle = h * 60 * Math.PI / 180;
            x += Math.cos(angle) * sat;                              // average round the colour wheel
            y += Math.sin(angle) * sat;
            weight += sat;
          }
          if (weight > 2) hue = Math.round(((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360);
          else hue = -1;                                               // a black-and-white picture
        } catch (e) { /* unreadable image: keep the generated colour */ }
        Art._hues.set(url, hue);
        resolve(hue);
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  },

  /** A song's picture for CSS: its real cover if you added one, otherwise its generated artwork. */
  image(id, cover) {
    const real = cover || Art.covers.get(id);
    return real ? "url('" + real + "')" : Art.song(id);
  },

  /** Small, fast seeded random generator (mulberry32): the same seed always gives the same numbers. */
  random(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  /** The drawing for one 200 x 200 square (no <svg> wrapper), so mosaics can reuse it. */
  drawing(seed, hue, idPrefix) {
    const r = Art.random(seed * 9301 + 49297);
    const h1 = ((hue % 360) + 360) % 360;
    const h2 = (h1 + 25 + Math.floor(r() * 55)) % 360;
    const ink = (a) => `rgba(255,255,255,${a})`;
    const g = idPrefix;
    let out = `<defs>
      <linearGradient id="${g}a" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="hsl(${h1} 72% 58%)"/><stop offset="1" stop-color="hsl(${h2} 68% 34%)"/>
      </linearGradient>
      <radialGradient id="${g}v" cx="0.5" cy="0.35" r="0.85">
        <stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/>
      </radialGradient>
    </defs><rect width="200" height="200" fill="url(#${g}a)"/>`;

    const kind = Math.floor(r() * 8);
    if (kind === 0) {                                   // rings
      const cx = 30 + r() * 140, cy = 30 + r() * 140;
      for (let i = 1; i <= 8; i++) out += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${i * 22}" fill="none" stroke="${ink(0.2)}" stroke-width="${3 + (i % 3) * 3}"/>`;
    } else if (kind === 1) {                            // waves
      const amp = 10 + r() * 18;
      for (let i = 0; i < 7; i++) {
        const y = 22 + i * 27;
        out += `<path d="M-10 ${y} Q 45 ${(y - amp).toFixed(0)} 100 ${y} T 210 ${y}" fill="none" stroke="${ink(0.16 + (i % 2) * 0.12)}" stroke-width="7" stroke-linecap="round"/>`;
      }
    } else if (kind === 2) {                            // stripes
      const angle = Math.floor(r() * 180);
      out += `<g transform="rotate(${angle} 100 100)">`;
      for (let i = -8; i <= 8; i++) out += `<rect x="${i * 26 + 100}" y="-60" width="${8 + (i % 3 === 0 ? 8 : 0)}" height="320" fill="${ink(0.15)}"/>`;
      out += '</g>';
    } else if (kind === 3) {                            // dots
      for (let x = 0; x < 6; x++) {
        for (let y = 0; y < 6; y++) {
          out += `<circle cx="${18 + x * 33}" cy="${18 + y * 33}" r="${(3 + r() * 10).toFixed(1)}" fill="${ink(0.18 + r() * 0.2)}"/>`;
        }
      }
    } else if (kind === 4) {                            // sun rays from a corner
      const cx = r() < 0.5 ? 0 : 200, cy = r() < 0.5 ? 0 : 200;
      for (let i = 0; i < 18; i += 2) {
        const a1 = (i / 18) * Math.PI * 2, a2 = ((i + 1) / 18) * Math.PI * 2;
        out += `<polygon points="${cx},${cy} ${(cx + Math.cos(a1) * 400).toFixed(0)},${(cy + Math.sin(a1) * 400).toFixed(0)} ${(cx + Math.cos(a2) * 400).toFixed(0)},${(cy + Math.sin(a2) * 400).toFixed(0)}" fill="${ink(0.1)}"/>`;
      }
      out += `<circle cx="${cx}" cy="${cy}" r="62" fill="${ink(0.3)}"/><circle cx="${cx}" cy="${cy}" r="88" fill="none" stroke="${ink(0.2)}" stroke-width="6"/>`;
    } else if (kind === 5) {                            // soft blobs
      for (let i = 0; i < 3; i++) {
        const hh = (h1 + 60 + i * 50 + Math.floor(r() * 40)) % 360;
        out += `<circle cx="${(r() * 200).toFixed(0)}" cy="${(r() * 200).toFixed(0)}" r="${(55 + r() * 45).toFixed(0)}" fill="hsl(${hh} 75% 60%)" fill-opacity="0.45"/>`;
      }
    } else if (kind === 6) {                            // quarter-circle arcs
      for (let x = 0; x < 4; x++) {
        for (let y = 0; y < 4; y++) {
          const corner = Math.floor(r() * 4);
          const ox = x * 50 + (corner % 2) * 50, oy = y * 50 + (corner > 1 ? 50 : 0);
          out += `<circle cx="${ox}" cy="${oy}" r="${r() < 0.5 ? 36 : 50}" fill="none" stroke="${ink(0.22)}" stroke-width="7" clip-path="inset(0)"/>`;
        }
      }
    } else {                                            // diamonds
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) {
          if ((x + y) % 2) continue;
          const cx = x * 50, cy = y * 50, s = 18 + r() * 10;
          out += `<polygon points="${cx},${(cy - s).toFixed(0)} ${(cx + s).toFixed(0)},${cy} ${cx},${(cy + s).toFixed(0)} ${(cx - s).toFixed(0)},${cy}" fill="${ink(0.2)}"/>`;
        }
      }
    }
    return out + `<rect width="200" height="200" fill="url(#${g}v)"/>`;
  },

  _url(key, build) {
    let url = Art._cache.get(key);
    if (!url) {
      url = "url('data:image/svg+xml," + encodeURIComponent(build()) + "')";
      Art._cache.set(key, url);
    }
    return url;
  },

  _svg(inner) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice">${inner}</svg>`;
  },

  /** A song's cover. The base colour matches UI.hue(id), which also colours the app while it plays. */
  song(id) {
    return Art._url('s' + id, () => Art._svg(Art.drawing(id, UI.hue(id), 's' + id)));
  },

  /** Any other seeded cover (playlist colour + pattern, artist). */
  pattern(key, seed, hue) {
    return Art._url('p' + key + '-' + hue, () => Art._svg(Art.drawing(seed, hue, 'p' + seed)));
  },

  /** A 2 x 2 mosaic of four songs' covers, used for playlists. */
  mosaic(ids) {
    return Art._url('m' + ids.join(','), () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">` +
      ids.slice(0, 4).map((id, i) => `<svg x="${(i % 2) * 200}" y="${i > 1 ? 200 : 0}" width="200" height="200" viewBox="0 0 200 200">` +
        Art.drawing(id, UI.hue(id), 'm' + i + 's' + id) + '</svg>').join('') + '</svg>');
  },
};
