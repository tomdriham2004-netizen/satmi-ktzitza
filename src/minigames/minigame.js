// Base class for 1v1 duel minigames.
//
// To add a new duel:
//   1. create src/minigames/mygame.js extending Minigame
//   2. implement build(), play() (resolve with 0 = left wins, 1 = right wins)
//   3. register it in src/minigames/index.js and add its id to
//      src/game/minigames.js
//
// ctx = { stage, ui, audio, players: [a, b], controls: [keysA|null, keysB|null],
//         skill: [numberOrNull, numberOrNull], net? }  (skill set => CPU-controlled)
//
// Online play: the host runs play() authoritatively. A control can be a
// RemoteInput (a guest's streamed keys). Discrete moments go through
// emit()/onEvent() so every screen shows them; continuous state goes through
// netSnap()/netApply(). Spectators run netPlay() instead of play().
import { input } from "../core/input.js";
import { every } from "../core/tween.js";

export class Minigame {
  static meta = { id: 'base', name: 'Minigame', icon: '🎮', howto: '', controls: 'action' };

  constructor(ctx) {
    this.ctx = ctx;
    this.players = ctx.players;
    this.controls = ctx.controls;
    this.skill = ctx.skill;
    this.ui = ctx.ui;
    this.audio = ctx.audio;
    this.net = ctx.net || null;       // { host: true, ... } | { puppet: true, localSide, ... } | null
    this.arena = null;
    this.done = false;
    this.snapEvery = 3;
    this.frame = 0;
  }

  get isHost() { return !this.net || this.net.host; }
  get isPuppet() { return !!this.net?.puppet; }

  isAI(side) { return this.skill[side] != null; }

  /** Edge-triggered action press for a side (humans only). */
  pressed(side) {
    const c = this.controls[side];
    if (!c) return false;
    if (c.remote) return c.pressed();
    return input.anyPressed(c.action);
  }
  /** Number of presses this frame (remote players can deliver several at once). */
  pressCount(side) {
    const c = this.controls[side];
    if (!c) return 0;
    if (c.remote) { const n = c.presses - c.consumed; c.consumed = c.presses; return n; }
    return input.anyPressed(c.action) ? 1 : 0;
  }
  held(side) {
    const c = this.controls[side];
    if (!c) return false;
    if (c.remote) return c.held();
    return input.anyDown(c.action);
  }
  axis(side) {
    const c = this.controls[side];
    if (!c) return { x: 0, y: 0 };
    if (c.remote) return c.axis();
    return {
      x: (input.anyDown(c.right) ? 1 : 0) - (input.anyDown(c.left) ? 1 : 0),
      y: (input.anyDown(c.down) ? 1 : 0) - (input.anyDown(c.up) ? 1 : 0),
    };
  }
  /** Reports a remote player sent about what they saw (timing games). */
  reports(side) {
    const c = this.controls[side];
    return c?.remote ? c.reports : null;
  }

  /** A discrete moment every screen should see. */
  emit(ev) {
    if (this.net?.host) this.net.event(ev);
    this.onEvent(ev);
  }
  onEvent() {}

  /** Host: call once per frame from play(); streams snapshots to spectators. */
  tickNet() {
    if (!this.net?.host) return;
    if (++this.frame % this.snapEvery === 0) this.net.snap(this.netSnap());
  }
  netSnap() { return {}; }
  netApply() {}
  netTick() {}

  /** Spectator / remote-duelist loop: mirror the host until it declares a winner. */
  async netPlay() {
    let winner = null;
    this.net.onSnap = (s) => this.netApply(s);
    this.net.onEvent = (ev) => this.onEvent(ev);
    this.net.onEnd = (w) => { winner = w; };
    this.net.flush?.();
    await every((dt) => {
      this.netTick(dt);
      return winner != null;
    }, true);
    return winner;
  }

  async build() {}
  /** Camera sweep before the countdown. */
  async intro() {}
  /** Run the game; resolve with the winning side (0 or 1). */
  async play() { return 0; }
  /** Post-result drama that must play on every screen (e.g. the fall into the pool). */
  async finish() {}
  /** Winner/loser reactions. */
  async outro(winner) {
    const [w, l] = winner === 0 ? [this.pawns?.[0], this.pawns?.[1]] : [this.pawns?.[1], this.pawns?.[0]];
    l?.sad();
    await w?.celebrate();
  }
  update() {}
  dispose() { this.arena?.dispose(); }
}

/** A remote player's keys, fed by the network on the host. */
export class RemoteInput {
  constructor(label) {
    this.remote = true;
    this.presses = 0;
    this.consumed = 0;
    this.isHeld = false;
    this.ax = { x: 0, y: 0 };
    this.reports = [];
    this.label = label || { move: 'REMOTE', action: 'REMOTE' };
  }
  feed(m) {
    if (typeof m.p === 'number') this.presses = Math.max(this.presses, m.p);
    if (m.h !== undefined) this.isHeld = !!m.h;
    if (m.a) this.ax = { x: Math.sign(m.a.x || 0), y: Math.sign(m.a.y || 0) };
    if (m.r) this.reports.push(m.r);
  }
  pressed() {
    if (this.consumed < this.presses) { this.consumed++; return true; }
    return false;
  }
  held() { return this.isHeld; }
  axis() { return this.ax; }
}
