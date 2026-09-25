// Frame-driven tweening + timing. Everything visual waits on this clock so the
// global game speed setting (and pausing) applies uniformly.

export const Ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2),
  outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  inOutExpo: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  outBack: (t) => { const s = 1.70158; return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); },
  outBackStrong: (t) => { const s = 3; return 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); },
  inBack: (t) => { const s = 1.70158; return (s + 1) * t * t * t - s * t * t; },
  outElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  outBounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
// Frame-rate independent exponential damping.
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

class Clock {
  constructor() {
    this.time = 0;       // scaled game time (seconds)
    this.realTime = 0;   // unscaled
    this.scale = 1;      // global speed multiplier
    this.slowmo = 1;     // temporary cinematic slow motion
    this.tasks = new Set();
    this.paused = false;
  }
  update(realDt) {
    this.realTime += realDt;
    if (this.paused) return 0;
    const dt = realDt * this.scale * this.slowmo;
    this.time += dt;
    for (const task of [...this.tasks]) {
      if (task.done) { this.tasks.delete(task); continue; }
      task.step(task.real ? realDt : dt);
    }
    return dt;
  }
  add(task) { this.tasks.add(task); return task; }
}

export const clock = new Clock();

/**
 * tween({ duration, ease, onUpdate(t, eased), onComplete, delay, real })
 * returns a promise with a .cancel() method.
 */
export function tween({ duration = 0.5, ease = Ease.outCubic, onUpdate, onComplete, delay = 0, real = false }) {
  let resolveFn;
  const promise = new Promise((r) => (resolveFn = r));
  let elapsed = -delay;
  const task = {
    done: false,
    real,
    step(dt) {
      elapsed += dt;
      if (elapsed < 0) return;
      const t = duration <= 0 ? 1 : Math.min(1, elapsed / duration);
      onUpdate?.(t, ease(t));
      if (t >= 1) {
        this.done = true;
        onComplete?.();
        resolveFn();
      }
    },
  };
  clock.add(task);
  promise.cancel = () => { task.done = true; resolveFn(); };
  return promise;
}

/** Animate numeric properties of an object (e.g. mesh.position). */
export function animate(target, to, duration = 0.5, ease = Ease.outCubic, opts = {}) {
  const from = {};
  for (const k in to) from[k] = target[k];
  return tween({
    duration, ease, delay: opts.delay || 0, real: opts.real,
    onUpdate: (t, e) => {
      for (const k in to) target[k] = from[k] + (to[k] - from[k]) * e;
      opts.onUpdate?.(t, e);
    },
    onComplete: opts.onComplete,
  });
}

/** Wait (in scaled game seconds). */
export function wait(seconds, real = false) {
  return tween({ duration: seconds, ease: Ease.linear, real });
}

/** Run a callback every frame until it returns true (or cancelled). */
export function every(fn, real = false) {
  let resolveFn;
  const promise = new Promise((r) => (resolveFn = r));
  const task = {
    done: false, real, t: 0,
    step(dt) {
      this.t += dt;
      if (fn(dt, this.t)) { this.done = true; resolveFn(); }
    },
  };
  clock.add(task);
  promise.cancel = () => { task.done = true; resolveFn(); };
  return promise;
}
