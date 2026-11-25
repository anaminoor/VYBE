// motion.js - shared animation helpers, so every movement in the app feels the same.
//
// Rules that keep it smooth on ordinary laptops:
//   - only transform and opacity are animated
//   - nothing does work on every frame unless something is actually moving
//   - if the system asks for reduced motion, every helper skips its animation
//
// Timing: quick (120 - 450 ms) with a soft "ease out", so nothing makes you wait.

const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

const Motion = {
  reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,

  // ---------------------------------------------------------------- start-up

  /** While the start-up screen shows, entrance animations wait (they are paused in CSS). */
  startBoot() {
    document.documentElement.classList.add('booting');
  },

  endBoot() {
    document.documentElement.classList.remove('booting');
  },

  // ---------------------------------------------------------------- page entrance

  /**
   * Elements with class "en" rise in one after another (CSS animation "enter").
   * This just numbers them; after about 14 the rest arrive together.
   */
  enter(root) {
    if (Motion.reduced) return;
    root.querySelectorAll('.en').forEach((el, i) => el.style.setProperty('--i', Math.min(i, 14)));
  },

  /**
   * Cross-fade and slide between pages.
   * The direction (forward / back) is read by CSS from <html data-dir="...">.
   * morphFrom: an element whose cover should fly into the new page's header.
   */
  viewTransition(render, morphFrom) {
    if (Motion.reduced || !document.startViewTransition) {
      render();
      if (!Motion.reduced) {
        const view = document.getElementById('view');
        view.classList.remove('fade-in');
        void view.offsetWidth;                // restart the animation
        view.classList.add('fade-in');
      }
      return;
    }
    if (morphFrom) morphFrom.style.viewTransitionName = 'cover';
    try {
      const transition = document.startViewTransition(() => {
        if (morphFrom) morphFrom.style.viewTransitionName = '';
        render();
        if (morphFrom) {
          const cover = document.querySelector('#view .hero > .cover');
          if (cover) cover.style.viewTransitionName = 'cover';
        }
      });
      transition.ready.catch(() => {});
      transition.finished.catch(() => {}).finally(() => {
        const cover = document.querySelector('#view .hero > .cover');
        if (cover) cover.style.viewTransitionName = '';
      });
    } catch (e) {
      if (morphFrom) morphFrom.style.viewTransitionName = '';
      render();
    }
  },

  // ---------------------------------------------------------------- lists

  /**
   * FLIP: glide elements from where they were to where they are now.
   * getEls() returns the elements (each with data-id); mutate() changes the page.
   */
  async flip(getEls, mutate) {
    if (Motion.reduced) return mutate();
    const before = new Map();
    getEls().forEach((el) => before.set(el.dataset.id, el.getBoundingClientRect()));

    await mutate();

    const viewHeight = window.innerHeight;
    getEls().forEach((el, i) => {
      const from = before.get(el.dataset.id);
      if (!from) return;
      const to = el.getBoundingClientRect();
      if (to.bottom < 0 && from.bottom < 0) return;            // both off screen: nothing to see
      if (to.top > viewHeight && from.top > viewHeight) return;
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (!dx && !dy) return;
      el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
        { duration: 420, delay: Math.min(i * 10, 150), easing: EASE_OUT, fill: 'backwards' });
    });
  },

  /** Smoothly close a row before it is removed. */
  collapse(el) {
    if (Motion.reduced || !el) return Promise.resolve();
    return el.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-24px)' }],
      { duration: 220, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }).finished.catch(() => {});
  },

  // ---------------------------------------------------------------- small effects

  /** Swap content with a slide: the old slides out, update() changes it, the new slides in. dir: 1 = next, -1 = previous. */
  swap(el, dir, update) {
    if (Motion.reduced || !el || !el.isConnected) { update(); return; }
    const token = (el._swapToken || 0) + 1;
    el._swapToken = token;
    if (el._swapIn) el._swapIn.cancel();
    const out = el.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-12 * dir}px)` }],
      { duration: 110, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
    out.finished.catch(() => {}).then(() => {
      if (el._swapToken !== token) return;
      update();
      el._swapIn = el.animate(
        [{ opacity: 0, transform: `translateX(${12 * dir}px)` }, { opacity: 1, transform: 'none' }],
        { duration: 260, easing: EASE_OUT });
      out.cancel();
    });
  },

  /**
   * A copy of a cover flies from one element to another (used when adding a song to a playlist).
   * target can be a CSS selector, so it still finds the element if that part of the page is redrawn meanwhile.
   */
  flyTo(fromEl, target, done) {
    const find = () => (typeof target === 'string' ? document.querySelector(target) : target);
    let toEl = find();
    if (Motion.reduced || !fromEl || !toEl) { if (done) done(); return; }
    const a = fromEl.getBoundingClientRect();
    const b = toEl.getBoundingClientRect();
    if (!a.width || !b.width) { if (done) done(); return; }
    const ghost = document.createElement('div');
    ghost.className = 'fly-ghost';
    ghost.style.cssText = `left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px;` +
      `background-image:${getComputedStyle(fromEl).backgroundImage};`;
    document.body.appendChild(ghost);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const scale = Math.max(b.width / a.width, 0.3);
    ghost.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(${(1 + scale) / 2})`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.3 },
    ], { duration: 560, easing: 'cubic-bezier(0.5, 0, 0.3, 1)' }).finished.catch(() => {}).then(() => {
      ghost.remove();
      toEl = find() || toEl;
      toEl.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }],
        { duration: 380, easing: EASE_OUT });
      if (done) done();
    });
  },

  /** Heart pop: little particles fly out from the button. */
  burst(el) {
    if (!el) return;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    if (Motion.reduced) return;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    for (let i = 0; i < 9; i++) {
      const p = document.createElement('span');
      p.className = 'particle';
      p.style.left = (cx - 3) + 'px';
      p.style.top = (cy - 3) + 'px';
      if (i % 3 === 2) p.style.background = '#ffd166';
      document.body.appendChild(p);
      const angle = (i / 9) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 20 + Math.random() * 16;
      p.animate(
        [{ transform: 'translate(0, 0) scale(1)', opacity: 1 },
         { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(0)`, opacity: 0 }],
        { duration: 500 + Math.random() * 180, easing: EASE_OUT }).onfinish = () => p.remove();
    }
  },

  /** Count a number up from zero. */
  countUp(el, to, format = (n) => String(Math.round(n))) {
    if (Motion.reduced || !to) { el.textContent = format(to); return; }
    const start = performance.now();
    const duration = 700;
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = format(to * eased);
      if (t < 1 && el.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },
};

// ------------------------------------------------------------------ smooth scrolling

/**
 * Wheel, touchpad, scrollbar and keyboard scrolling are left entirely to the browser.
 * It scrolls on the compositor thread (already smooth for mouse wheels in Chrome, Edge
 * and Firefox), so the page never waits on JavaScript and never lags behind the wheel.
 * Only the programmatic jumps ("back to top", lyrics following along) glide, natively.
 */
const SmoothScroll = {
  /** Glide to a position (used by "back to top", jump-to-song and the lyrics). */
  to(el, y) {
    const top = clamp(y, 0, el.scrollHeight - el.clientHeight);
    el.scrollTo({ top, behavior: Motion.reduced ? 'auto' : 'smooth' });
  },
};

// ------------------------------------------------------------------ sideways card rows

/** Card rows you can drag with the mouse (with a little momentum), plus ‹ › buttons and edge fades. */
const HScroll = {
  attach(wrap) {
    const row = wrap.querySelector('.h-scroll');
    if (!row || row._hs) return;
    row._hs = true;

    const update = () => {
      const maxX = row.scrollWidth - row.clientWidth;
      wrap.classList.toggle('at-start', row.scrollLeft <= 2);
      wrap.classList.toggle('at-end', row.scrollLeft >= maxX - 2);
    };
    let queued = false;
    row.addEventListener('scroll', () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; update(); });
    }, { passive: true });
    update();

    wrap.querySelectorAll('[data-hs]').forEach((btn) => btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      row.scrollBy({ left: Number(btn.dataset.hs) * row.clientWidth * 0.8, behavior: Motion.reduced ? 'auto' : 'smooth' });
    }));

    // Mouse drag with momentum.
    let startX = 0, startLeft = 0, lastX = 0, lastT = 0, v = 0, dragging = false, down = false;
    row.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = true; dragging = false;
      startX = lastX = e.clientX; startLeft = row.scrollLeft; lastT = performance.now(); v = 0;
    });
    row.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (!dragging && Math.abs(dx) > 5) {
        dragging = true;
        row.classList.add('dragging');
        row.setPointerCapture(e.pointerId);
      }
      if (!dragging) return;
      row.scrollLeft = startLeft - dx;
      const now = performance.now();
      v = (e.clientX - lastX) / Math.max(now - lastT, 1) * 16;
      lastX = e.clientX; lastT = now;
    });
    const end = () => {
      if (!down) return;
      down = false;
      if (!dragging) return;
      row.classList.remove('dragging');
      if (Motion.reduced) return;
      const glide = () => {
        if (Math.abs(v) < 0.4) return;
        row.scrollLeft -= v;
        v *= 0.93;
        requestAnimationFrame(glide);
      };
      requestAnimationFrame(glide);
    };
    row.addEventListener('pointerup', end);
    row.addEventListener('pointercancel', end);
    // A drag is not a click on the card under the mouse.
    row.addEventListener('click', (e) => {
      if (dragging) { e.preventDefault(); e.stopPropagation(); dragging = false; }
    }, true);
  },
};

// ------------------------------------------------------------------ 3D tilt on cards

/** Cards lean slightly toward the mouse, with a soft light that follows it. Mouse only. */
const Tilt = {
  init() {
    if (Motion.reduced || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let current = null, pending = null;
    const reset = (el) => {
      el.style.transform = '';
      el.classList.remove('tilting');
    };
    document.addEventListener('pointermove', (e) => {
      if (pending === null) {
        requestAnimationFrame(() => {
          const ev = pending;
          pending = null;
          const el = ev.target.closest && ev.target.closest('.card:not(.new), .quick-item');
          if (el !== current) {
            if (current) reset(current);
            current = el;
          }
          if (!el || el.closest('.dragging')) return;
          const r = el.getBoundingClientRect();
          const x = (ev.clientX - r.left) / r.width - 0.5;
          const y = (ev.clientY - r.top) / r.height - 0.5;
          const strength = el.classList.contains('quick-item') ? 3 : 7;
          el.classList.add('tilting');
          el.style.transform = `perspective(800px) rotateX(${(-y * strength).toFixed(2)}deg) rotateY(${(x * strength).toFixed(2)}deg)`;
          el.style.setProperty('--sx', (x * 100).toFixed(1) + '%');
          el.style.setProperty('--sy', (y * 100).toFixed(1) + '%');
        });
      }
      pending = e;
    }, { passive: true });
    document.addEventListener('pointerleave', () => { if (current) reset(current); current = null; });
  },
};
