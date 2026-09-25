// Procedural audio: every SFX is synthesized on the fly (no asset files) and
// the soundtrack is a small generative sequencer with board / duel / night moods.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicOn = true;
    this.sfxVol = 0.9;
    this.musicVol = 0.5;
    this.mood = 'board';
    this.started = false;
    this.lastPlay = new Map();
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxVol;
    this.sfx.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? this.musicVol * 0.55 : 0;
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 9000;
    this.musicBus.connect(this.musicFilter).connect(this.master);
    // shared reverb-ish delay for sparkle
    this.delay = ctx.createDelay(0.5);
    this.delay.delayTime.value = 0.18;
    const fb = ctx.createGain(); fb.gain.value = 0.28;
    const wet = ctx.createGain(); wet.gain.value = 0.22;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(wet).connect(this.master);
    const len = ctx.sampleRate * 1.5;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startMusic();
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  setMusic(on) {
    this.musicOn = on;
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? this.musicVol * 0.55 : 0, this.now, 0.3);
  }
  setSfx(on) {
    this.enabled = on;
    if (this.sfx) this.sfx.gain.setTargetAtTime(on ? this.sfxVol : 0, this.now, 0.05);
  }
  setMood(m) {
    if (this.mood === m) return;
    this.mood = m;
    if (!this.musicFilter) return;
    const f = m === 'night' ? 2400 : m === 'muffled' ? 700 : 9000;
    this.musicFilter.frequency.setTargetAtTime(f, this.now, 0.6);
  }

  // ───────────────────────────── primitives
  osc(type, freq, t0, dur, vol, { to = null, attack = 0.005, dest = this.sfx, detune = 0, curve = 'exp' } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    o.detune.value = detune;
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    else g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    return { o, g };
  }

  noise(t0, dur, vol, { type = 'bandpass', freq = 1200, q = 1, to = null, dest = this.sfx, attack = 0.002 } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
    return g;
  }

  bell(freq, t0, vol = 0.12, dur = 0.5, dest = this.sfx) {
    this.osc('sine', freq, t0, dur, vol, { dest });
    this.osc('sine', freq * 2.76, t0, dur * 0.5, vol * 0.35, { dest });
    this.osc('sine', freq * 5.4, t0, dur * 0.25, vol * 0.15, { dest });
  }

  // ───────────────────────────── sound library
  play(name, o) {
    o = o || {};
    if (!this.ctx || !this.enabled) return;
    // de-dupe floods of identical sounds in the same instant
    const t = this.now + (o.delay || 0);
    const last = this.lastPlay.get(name) ?? -1;
    if (Math.abs(t - last) < (o.minGap ?? 0.018)) return;
    this.lastPlay.set(name, t);
    const p = o.pitch ?? 1;
    const v = o.vol ?? 1;
    switch (name) {
      case 'click': this.osc('sine', 900 * p, t, 0.07, 0.14 * v, { to: 600 * p }); break;
      case 'hover': this.osc('sine', 1500 * p, t, 0.035, 0.035 * v); break;
      case 'open': this.osc('triangle', 520 * p, t, 0.12, 0.08 * v, { to: 780 * p }); break;
      case 'close': this.osc('triangle', 700 * p, t, 0.1, 0.07 * v, { to: 420 * p }); break;
      case 'hop':
        this.osc('triangle', 320 * p, t, 0.13, 0.16 * v, { to: 560 * p });
        this.noise(t, 0.03, 0.05 * v, { freq: 3000, q: 2 });
        break;
      case 'land':
        this.osc('sine', 150, t, 0.16, 0.3 * v, { to: 60 });
        this.noise(t, 0.08, 0.12 * v, { type: 'lowpass', freq: 900 });
        break;
      case 'bigland':
        this.osc('sine', 110, t, 0.35, 0.5 * v, { to: 40 });
        this.noise(t, 0.25, 0.22 * v, { type: 'lowpass', freq: 700, to: 150 });
        break;
      case 'dice': {
        const f = 1800 + Math.random() * 2400;
        this.noise(t, 0.03 + Math.random() * 0.02, 0.28 * v, { freq: f, q: 3 });
        this.osc('square', 900 + Math.random() * 900, t, 0.02, 0.03 * v);
        break;
      }
      case 'shake':
        for (let i = 0; i < 7; i++) this.noise(t + i * 0.045 + Math.random() * 0.02, 0.025, 0.12 * v, { freq: 2500 + Math.random() * 2000, q: 4 });
        break;
      case 'coin': {
        const f = (1900 + Math.random() * 300) * p;
        this.bell(f, t, 0.075 * v, 0.28);
        break;
      }
      case 'cash':
        this.noise(t, 0.05, 0.2 * v, { freq: 2500, q: 1 });
        this.osc('square', 180, t, 0.05, 0.05 * v);
        [2093, 2637, 3136].forEach((f, i) => this.bell(f, t + 0.06 + i * 0.03, 0.08 * v, 0.7));
        break;
      case 'buy': {
        const notes = [72, 76, 79, 84];
        notes.forEach((n, i) => {
          this.osc('triangle', NOTE(n), t + i * 0.085, 0.3, 0.13 * v);
          this.osc('square', NOTE(n), t + i * 0.085, 0.12, 0.03 * v);
        });
        [72, 76, 79].forEach((n) => this.osc('triangle', NOTE(n + 12), t + 0.34, 0.8, 0.07 * v, { attack: 0.02 }));
        this.sparkle(t + 0.3, v * 0.7);
        break;
      }
      case 'thunk':
        this.osc('sine', 110 * p, t, 0.14, 0.32 * v, { to: 55 * p });
        this.noise(t, 0.06, 0.14 * v, { type: 'lowpass', freq: 1200 * p });
        this.noise(t, 0.02, 0.08 * v, { freq: 3500, q: 3 });
        break;
      case 'hammer':
        this.noise(t, 0.04, 0.18 * v, { freq: 2200 * p, q: 6 });
        this.osc('square', 420 * p, t, 0.04, 0.04 * v);
        break;
      case 'sparkle': this.sparkle(t, v); break;
      case 'whoosh':
        this.noise(t, 0.45 * (o.len || 1), 0.22 * v, { freq: 300, to: 3200, q: 1.4, attack: 0.15 * (o.len || 1) });
        break;
      case 'swoosh':
        this.noise(t, 0.35, 0.18 * v, { freq: 3000, to: 250, q: 1.2, attack: 0.05 });
        break;
      case 'impact':
        this.osc('sine', 80, t, 0.7, 0.55 * v, { to: 30 });
        this.noise(t, 0.5, 0.3 * v, { type: 'lowpass', freq: 2000, to: 100 });
        this.noise(t, 0.9, 0.08 * v, { type: 'highpass', freq: 5000 });
        break;
      case 'duel': {
        this.play('impact', { vol: v });
        [57, 60, 64, 69].forEach((n) => {
          const { o: os } = this.osc('sawtooth', NOTE(n - 12), t, 1.4, 0.06 * v, { attack: 0.01 });
          os.detune.value = (Math.random() - 0.5) * 16;
        });
        this.osc('sawtooth', NOTE(45), t, 1.4, 0.1 * v);
        break;
      }
      case 'beep': this.osc('square', 660 * p, t, 0.14, 0.09 * v, { curve: 'lin' }); break;
      case 'go':
        this.osc('square', 990, t, 0.35, 0.1 * v, { curve: 'lin' });
        [72, 76, 79].forEach((n) => this.osc('sawtooth', NOTE(n), t, 0.5, 0.04 * v));
        break;
      case 'win': {
        [67, 72, 76, 79, 84].forEach((n, i) => this.osc('triangle', NOTE(n), t + i * 0.09, 0.35, 0.14 * v));
        [72, 76, 79, 84].forEach((n) => this.osc('triangle', NOTE(n), t + 0.5, 1.2, 0.06 * v, { attack: 0.02 }));
        this.sparkle(t + 0.45, v);
        this.play('crowd', { vol: 0.6 * v, delay: 0.1 });
        break;
      }
      case 'lose': {
        [58, 57, 56, 55].forEach((n, i) => {
          const dur = i === 3 ? 0.9 : 0.32;
          const { o: os } = this.osc('sawtooth', NOTE(n - 12), t + i * 0.34, dur, 0.1 * v, { attack: 0.03, curve: 'lin' });
          if (i === 3) {
            const lfo = this.ctx.createOscillator(); const lg = this.ctx.createGain();
            lfo.frequency.value = 6; lg.gain.value = 12;
            lfo.connect(lg).connect(os.frequency); lfo.start(t + i * 0.34); lfo.stop(t + 1.9);
          }
        });
        break;
      }
      case 'alarm':
        for (let i = 0; i < 4; i++) {
          this.osc('square', 760, t + i * 0.4, 0.2, 0.07 * v, { to: 1100, curve: 'lin' });
          this.osc('square', 1100, t + i * 0.4 + 0.2, 0.2, 0.07 * v, { to: 760, curve: 'lin' });
        }
        break;
      case 'jail':
        this.noise(t, 0.4, 0.3 * v, { freq: 400, q: 8 });
        this.noise(t, 0.6, 0.15 * v, { freq: 1300, q: 12 });
        this.osc('sine', 90, t, 0.3, 0.4 * v, { to: 40 });
        break;
      case 'siren':
        for (let i = 0; i < 3; i++) this.osc('sine', 700, t + i * 0.5, 0.5, 0.08 * v, { to: 1200, curve: 'lin' });
        break;
      case 'bankrupt':
        this.osc('sawtooth', 600, t, 1.2, 0.12 * v, { to: 60 });
        this.play('impact', { vol: v, delay: 1.1 });
        break;
      case 'card':
        this.noise(t, 0.12, 0.12 * v, { freq: 5000, to: 1500, q: 0.8 });
        this.osc('triangle', 880, t + 0.05, 0.15, 0.06 * v, { to: 1320 });
        break;
      case 'news':
        [[67, 0], [72, 0.12], [79, 0.24]].forEach(([n, d]) => { this.osc('sawtooth', NOTE(n), t + d, 0.22, 0.06 * v); this.osc('square', NOTE(n - 12), t + d, 0.22, 0.03 * v); });
        break;
      case 'tick': this.osc('square', 1200 * p, t, 0.03, 0.05 * v); break;
      case 'gun':
        this.noise(t, 0.35, 0.55 * v, { type: 'lowpass', freq: 4000, to: 300 });
        this.osc('sine', 120, t, 0.3, 0.5 * v, { to: 40 });
        break;
      case 'boing':
        this.osc('sine', 180 * p, t, 0.35, 0.2 * v, { to: 520 * p });
        this.osc('triangle', 360 * p, t, 0.25, 0.06 * v, { to: 900 * p });
        break;
      case 'pop': this.osc('sine', 500 * p, t, 0.09, 0.18 * v, { to: 1100 * p }); break;
      case 'bump':
        this.osc('sine', 200 * p, t, 0.15, 0.35 * v, { to: 80 });
        this.noise(t, 0.08, 0.2 * v, { type: 'lowpass', freq: 1500 });
        break;
      case 'splash':
        this.noise(t, 0.6, 0.3 * v, { freq: 1200, to: 400, q: 0.6, attack: 0.01 });
        break;
      case 'crowd':
        this.noise(t, 1.6, 0.12 * v, { freq: 1100, q: 0.5, attack: 0.3 });
        this.noise(t + 0.1, 1.4, 0.07 * v, { freq: 2500, q: 0.7, attack: 0.3 });
        break;
      case 'error': this.osc('square', 140, t, 0.18, 0.08 * v, { curve: 'lin' }); break;
      case 'drumroll':
        for (let i = 0; i < (o.count || 24); i++) this.noise(t + i * 0.045, 0.05, (0.05 + (i / (o.count || 24)) * 0.12) * v, { freq: 900, q: 1 });
        break;
      case 'lock': this.noise(t, 0.05, 0.25 * v, { freq: 3000, q: 5 }); this.osc('square', 300, t, 0.05, 0.05 * v); break;
      case 'unlock': this.noise(t, 0.08, 0.2 * v, { freq: 1800, q: 4 }); this.osc('triangle', 660, t + 0.04, 0.2, 0.1 * v, { to: 990 }); break;
      case 'type': this.noise(t, 0.015, 0.06 * v, { freq: 4000, q: 2 }); break;
      default:
    }
  }

  sparkle(t, v = 1) {
    const scale = [84, 86, 88, 91, 93, 96, 98];
    for (let i = 0; i < 7; i++) {
      const n = scale[Math.floor(Math.random() * scale.length)];
      this.osc('sine', NOTE(n), t + i * 0.05, 0.25, 0.035 * v, { dest: this.delay });
      this.osc('sine', NOTE(n), t + i * 0.05, 0.25, 0.04 * v);
    }
  }

  // ───────────────────────────── generative music
  startMusic() {
    if (this.started || !this.ctx) return;
    this.started = true;
    this.step = 0;
    this.nextTime = this.now + 0.1;
    setInterval(() => this.schedule(), 30);
  }

  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const duel = this.mood === 'duel';
    const bpm = duel ? 138 : 94;
    const spb = 60 / bpm / 2; // eighth notes
    while (this.nextTime < this.now + 0.15) {
      this.playStep(this.step, this.nextTime, duel, spb);
      const swing = !duel && this.step % 2 === 0 ? spb * 0.14 : !duel ? -spb * 0.14 : 0;
      this.nextTime += spb + swing;
      this.step++;
    }
  }

  playStep(step, t, duel, spb) {
    if (!this.musicOn) return;
    const dest = this.musicBus;
    const bar = Math.floor(step / 8) % 4;
    const s = step % 8;
    const board = [
      { root: 53, chord: [65, 69, 72, 76] },   // Fmaj7
      { root: 50, chord: [62, 65, 69, 72] },   // Dm7
      { root: 55, chord: [62, 65, 67, 70] },   // Gm7
      { root: 48, chord: [64, 67, 70, 72] },   // C7
    ];
    const duelProg = [
      { root: 45, chord: [57, 60, 64] }, { root: 41, chord: [57, 60, 65] },
      { root: 43, chord: [59, 62, 67] }, { root: 40, chord: [56, 59, 64] },
    ];
    const prog = duel ? duelProg : board;
    const ch = prog[bar];
    if (duel) {
      // driving bass 8ths + four on the floor
      this.osc('sawtooth', NOTE(ch.root - 12 + (s % 4 === 3 ? 7 : 0)), t, spb * 0.9, 0.07, { dest, curve: 'lin' });
      if (s % 2 === 0) { this.osc('sine', 110, t, 0.18, 0.35, { to: 45, dest }); }
      if (s === 2 || s === 6) this.noise(t, 0.12, 0.12, { freq: 1800, q: 0.8, dest });
      this.noise(t, 0.03, 0.04, { type: 'highpass', freq: 7000, dest });
      if (s === 0 || s === 3 || s === 6) ch.chord.forEach((n) => this.osc('square', NOTE(n), t, spb * 0.6, 0.018, { dest, curve: 'lin' }));
      if (Math.random() < 0.3) this.osc('triangle', NOTE(ch.chord[Math.floor(Math.random() * 3)] + 12), t, 0.15, 0.04, { dest });
      return;
    }
    // bossa comping
    if (s === 0 || s === 3 || s === 6) {
      ch.chord.forEach((n, i) => {
        this.osc('sine', NOTE(n), t + i * 0.008, 0.9, 0.035, { dest, attack: 0.01 });
        this.osc('triangle', NOTE(n + 12), t + i * 0.008, 0.35, 0.008, { dest });
      });
    }
    // bass
    if (s === 0) this.osc('triangle', NOTE(ch.root - 12), t, spb * 2.6, 0.16, { dest, attack: 0.01 });
    if (s === 4) this.osc('triangle', NOTE(ch.root - 5), t, spb * 2, 0.12, { dest, attack: 0.01 });
    if (s === 7 && Math.random() < 0.5) this.osc('triangle', NOTE(ch.root - 13), t, spb, 0.08, { dest });
    // light percussion
    if (s % 2 === 0) this.noise(t, 0.035, 0.03, { type: 'highpass', freq: 8000, dest });
    else this.noise(t, 0.025, 0.015, { type: 'highpass', freq: 9000, dest });
    if (s === 0 || s === 5) this.osc('sine', 90, t, 0.15, 0.13, { to: 50, dest });
    if (s === 2 || s === 6) this.noise(t, 0.05, 0.035, { freq: 2200, q: 6, dest });
    // marimba melody sprinkles
    if ((s === 1 || s === 4 || s === 7) && Math.random() < 0.28) {
      const pent = [72, 74, 77, 79, 81, 84];
      const n = pent[Math.floor(Math.random() * pent.length)];
      this.osc('sine', NOTE(n), t, 0.3, 0.05, { dest });
      this.osc('sine', NOTE(n + 24), t, 0.06, 0.012, { dest });
    }
  }
}

export const audio = new AudioEngine();
