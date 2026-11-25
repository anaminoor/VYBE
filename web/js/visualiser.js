// visualiser.js - dancing bars drawn on a <canvas>.
// When a song has a real audio file the bars follow the music (Web Audio analyser);
// otherwise they are made up from a few sine waves and a "beat", seeded by the song id.
// Bars rise while playing, sink when paused, and scale with the volume.

const Visualiser = {
  items: [],
  running: false,
  clock: 0,            // seconds of "music" drawn so far (stops when paused)
  lastFrame: 0,

  /** Attach a visualiser to a canvas. mirror = bars grow up and down from the middle. */
  attach(canvas, { bars = 24, mirror = false, active = () => true } = {}) {
    const item = { canvas, ctx: canvas.getContext('2d'), bars, mirror, active, w: 0, h: 0, levels: new Float32Array(bars), color: '', colorAge: 99 };
    this.items.push(item);
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      item.w = w;
      item.h = h;
      if (!w || !h) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      item.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.kick();
    };
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
    resize();
  },

  /** Start the drawing loop if it is not already running. */
  kick() {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  },

  frame(now) {
    const dt = Math.min((now - this.lastFrame) / 1000, 0.1);
    this.lastFrame = now;
    if (Player.playing && !Motion.reduced) this.clock += dt * Player.speed;
    this.freq = Player.frequencies();          // the real music, when a song plays from a file

    let moving = false;
    for (const item of this.items) {
      if (!item.w || !item.active()) continue;         // hidden right now: skip the drawing
      if (this.draw(item)) moving = true;
    }
    if (Player.playing && !Motion.reduced) moving = true;

    if (moving) requestAnimationFrame((t) => this.frame(t));
    else this.running = false;
  },

  /** Height of one bar (0 to 1) at the current moment. */
  target(i, bars) {
    if (!Player.playing || !Player.song) return 0.05;
    if (this.freq) {
      // Real audio: spread the bars over the musical part of the spectrum (more bars for the lows).
      const x = i / (bars - 1);
      const bin = Math.min(this.freq.length - 1, 2 + Math.floor(Math.pow(x, 1.5) * 70));
      return Math.max(0.05, Math.min(1, Math.pow(this.freq[bin] / 255, 1.4) * 1.15));
    }
    const seed = Player.song.id * 12.9898;
    const t = this.clock;
    const bpm = 92 + (Player.song.id * 37) % 48;
    const wave1 = 0.5 + 0.5 * Math.sin(t * (1.7 + (i % 5) * 0.37) + seed + i * 1.3);
    const wave2 = 0.5 + 0.5 * Math.sin(t * (3.1 + (i % 7) * 0.23) + seed * 0.7 + i * 0.6);
    const beat = Math.pow(0.5 + 0.5 * Math.sin(t * Math.PI * 2 * bpm / 60), 4);
    const x = i / (bars - 1);
    const shape = 0.5 + 0.5 * Math.sin(Math.PI * (0.15 + x * 0.85));      // louder in the middle
    const value = shape * (0.12 + 0.6 * wave1 * wave2 + 0.32 * beat * (1 - x * 0.6));
    return Math.max(0.05, Math.min(1, value * 1.25)) * (0.15 + 0.85 * Player.level());
  },

  /** Draw one canvas. Returns true while its bars are still moving. */
  draw(item) {
    const { ctx, canvas, bars, levels } = item;
    const w = item.w;
    const h = item.h;

    // Read the accent colour now and then (it changes with the song and the theme).
    if (++item.colorAge > 30) {
      item.color = getComputedStyle(canvas).color;
      item.colorAge = 0;
    }

    let moving = false;
    for (let i = 0; i < bars; i++) {
      const goal = this.target(i, bars);
      const diff = goal - levels[i];
      levels[i] += Motion.reduced ? diff : diff * (diff > 0 ? 0.28 : 0.1);   // quick up, slow down
      if (Math.abs(diff) > 0.004) moving = true;
    }

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = item.color;
    const slot = w / bars;
    const barW = Math.max(2, slot * 0.56);
    for (let i = 0; i < bars; i++) {
      const barH = Math.max(2, levels[i] * h);
      const x = i * slot + (slot - barW) / 2;
      const y = item.mirror ? (h - barH) / 2 : h - barH;
      ctx.globalAlpha = 0.35 + 0.65 * levels[i];
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, barW, barH, barW / 2);
      else ctx.rect(x, y, barW, barH);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return moving;
  },
};
