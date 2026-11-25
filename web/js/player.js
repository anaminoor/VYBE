// player.js - plays the current song.
//
// Two ways to play:
//   - Real audio: when the song has an audio file in the songs folder (song.audio from Java),
//     an <audio> element plays it. Seeking, speed, volume and "ended" come from the real file.
//   - Simulated: songs without a file still "play" on a clock, so the app works without any audio.
//
// Either way a 5-times-a-second step updates the time labels, and the progress bars are moved by the
// browser itself (an animation kept in step with this clock), so the page does no work on every frame.
// When a song ends, onEnded() asks Java for the next song.

const Player = {
  song: null,          // the song object from Java, or null
  elapsed: 0,          // seconds played
  playing: false,
  speed: 1,            // 0.5 to 2
  volume: 0.8,         // 0 to 1
  muted: false,
  sleep: { mode: 'off', until: 0 },   // off | time | end
  real: false,         // true when the current song plays from a real audio file

  onTick: () => {},     // the time moved on (5 times a second)
  onTimeline: () => {}, // play, pause, seek, speed or song changed: re-sync the progress bars
  onState: () => {},    // play / pause / song changed
  onEnded: () => {},    // the song reached its end
  onSleep: () => {},    // the sleep timer stopped playback
  onDuration: () => {}, // a real file turned out to have a different length than Java had
  onError: () => {},    // a real file could not be played

  audio: null,
  _last: 0,
  _timer: 0,
  _ctx: null,
  _analyser: null,
  _freq: null,

  /** The one <audio> element, created the first time it is needed. */
  _audio() {
    if (this.audio) return this.audio;
    const a = new Audio();
    a.preload = 'auto';
    a.addEventListener('ended', () => { if (this.real) this._finished(); });
    a.addEventListener('loadedmetadata', () => {
      if (!this.real || !this.song || !isFinite(a.duration) || a.duration <= 0) return;
      const length = Math.round(a.duration);
      if (Math.abs(length - this.song.duration) >= 1) {
        this.song.duration = length;
        this.onDuration(this.song);
      }
      this.onTimeline();
      this.onTick();
    });
    // While the file is still loading, hold the progress bars; carry on when it plays again.
    a.addEventListener('waiting', () => { if (this.real) this._holdTimeline(); });
    a.addEventListener('playing', () => { if (this.real) this.onTimeline(); });
    a.addEventListener('error', () => {
      if (!this.real || !a.getAttribute('src')) return;
      this.playing = false;
      clearInterval(this._timer);
      this.onTimeline();
      this.onState();
      this.onError(this.song);
    });
    this.audio = a;
    this._applyVolume();
    return a;
  },

  load(song, autoplay) {
    this.song = song || null;
    this.elapsed = 0;
    this.real = !!(song && song.audio);
    const a = this._audio();
    if (this.real) {
      if (a.getAttribute('src') !== song.audio) a.src = song.audio;
      try { a.currentTime = 0; } catch (e) { /* not loaded yet */ }
      a.playbackRate = this.speed;
    } else if (a.getAttribute('src')) {
      a.pause();
      a.removeAttribute('src');
      a.load();
    }
    this.setPlaying(!!autoplay);
  },

  setPlaying(playing) {
    this.playing = playing && !!this.song;
    this._last = performance.now();
    clearInterval(this._timer);
    if (this.real) {
      const a = this._audio();
      if (this.playing) {
        this._connectAnalyser();
        a.playbackRate = this.speed;
        a.play().catch((e) => {
          if (e && e.name === 'AbortError') return;          // replaced by a newer song: fine
          this.playing = false;
          clearInterval(this._timer);
          this.onTimeline();
          this.onState();
        });
      } else {
        a.pause();
      }
    }
    if (this.playing) this._timer = setInterval(() => this._step(), 200);
    this.onTimeline();
    this.onState();
    this.onTick();
  },

  toggle() {
    if (!this.song) return;
    if (!this.playing && this.elapsed >= this.song.duration - 0.25) this.seekTo(0);   // finished: start again
    this.setPlaying(!this.playing);
  },

  _step() {
    this._update();
    if (this.playing) this.onTick();
  },

  /** Move the clock forward: from the real file, or by the time that has passed times the speed. */
  _update() {
    if (!this.playing) return;
    if (this.real) {
      this.elapsed = this._audio().currentTime;
    } else {
      const now = performance.now();
      this.elapsed += ((now - this._last) / 1000) * this.speed;
      this._last = now;
    }

    if (this.sleep.mode === 'time' && Date.now() >= this.sleep.until) {
      this.sleep = { mode: 'off', until: 0 };
      this.setPlaying(false);
      this.onSleep();
      return;
    }
    if (!this.real && this.elapsed >= this.song.duration) this._finished();
  },

  /** The song reached its end (real or simulated). */
  _finished() {
    this.elapsed = this.song.duration;
    this.setPlaying(false);
    if (this.sleep.mode === 'end') {
      this.sleep = { mode: 'off', until: 0 };
      this.onSleep();
    } else {
      this.onEnded();
    }
  },

  /** While a file is buffering, stop the progress bars where they are. */
  _holdTimeline() {
    const wasPlaying = this.playing;
    this.playing = false;
    this.elapsed = this._audio().currentTime;
    this.onTimeline();
    this.playing = wasPlaying;
  },

  /** Jump to a position: fraction between 0 and 1. */
  seek(fraction) {
    if (!this.song) return;
    const f = Math.min(Math.max(fraction, 0), 1);
    this.seekTo(f * this.song.duration);
  },

  seekTo(seconds) {
    if (!this.song) return;
    this.elapsed = Math.min(Math.max(seconds, 0), Math.max(this.song.duration - 0.5, 0));
    if (this.real) {
      try { this._audio().currentTime = this.elapsed; } catch (e) { /* not loaded yet */ }
    }
    this._last = performance.now();
    this.onTimeline();
    this.onTick();
  },

  restart() {
    this.seekTo(0);
  },

  setSpeed(speed) {
    this._update();
    this.speed = speed;
    if (this.audio) this.audio.playbackRate = speed;
    Store.set('speed', speed);
    this.onTimeline();
    this.onState();
  },

  setVolume(volume) {
    this.volume = Math.min(Math.max(volume, 0), 1);
    if (this.volume > 0) this.muted = false;
    Store.set('volume', this.volume);
    Store.set('muted', this.muted);
    this._applyVolume();
    this.onState();
  },

  setMuted(muted) {
    this.muted = muted;
    Store.set('muted', muted);
    this._applyVolume();
    this.onState();
  },

  _applyVolume() {
    if (this.audio) this.audio.volume = this.muted ? 0 : this.volume;
  },

  /** How loud it is (0 to 1); also scales the visualiser. */
  level() {
    return this.muted ? 0 : this.volume;
  },

  // ---------------------------------------------------------------- real frequencies for the visualiser

  /** Listen to the real audio, so the visualiser bars follow the music. Needs a click first (browser rule). */
  _connectAnalyser() {
    if (this._ctx) {
      if (this._ctx.state === 'suspended') this._ctx.resume().catch(() => {});
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      this._ctx = new Ctx();
      const source = this._ctx.createMediaElementSource(this._audio());
      this._analyser = this._ctx.createAnalyser();
      this._analyser.fftSize = 256;
      this._analyser.smoothingTimeConstant = 0.75;
      source.connect(this._analyser);
      this._analyser.connect(this._ctx.destination);
      this._freq = new Uint8Array(this._analyser.frequencyBinCount);
    } catch (e) {
      this._analyser = null;                 // the visualiser falls back to its own animation
    }
  },

  /** Current loudness per frequency band (0-255), or null when there is no real audio playing. */
  frequencies() {
    if (!this.real || !this.playing || !this._analyser) return null;
    this._analyser.getByteFrequencyData(this._freq);
    return this._freq;
  },

  // ---------------------------------------------------------------- sleep timer and settings

  /** mode: 'off', 'end' (stop when this song ends) or 'time' with a number of minutes. */
  setSleep(mode, minutes) {
    this.sleep = { mode, until: mode === 'time' ? Date.now() + minutes * 60000 : 0 };
    this.onState();
  },

  /** Whole minutes left on the sleep timer (rounded up). */
  sleepMinutesLeft() {
    return Math.max(0, Math.ceil((this.sleep.until - Date.now()) / 60000));
  },

  /** Load the saved volume and speed. */
  restoreSettings() {
    const volume = parseFloat(Store.get('volume', '0.8'));
    const speed = parseFloat(Store.get('speed', '1'));
    this.volume = isNaN(volume) ? 0.8 : Math.min(Math.max(volume, 0), 1);
    this.speed = [0.5, 0.75, 1, 1.25, 1.5, 2].includes(speed) ? speed : 1;
    this.muted = Store.get('muted', 'false') === 'true';
  },
};
