// Online game sessions.
//
// HostSession — the host's browser runs the real GameEngine. The engine talks
// to a Proxy of the presenter: every beat is played locally AND broadcast
// (with a state snapshot) so guests replay the same cinematic. Decisions for
// a guest's player are routed to that guest's UI; everyone else watches them
// resolve live. Duels, heists and auctions get small real-time sub-protocols.
//
// GuestSession — mirrors the host: applies snapshots, replays beats in order,
// answers its own player's decisions and streams inputs during minigames.
import { ser, des, applySnapshot } from "./serialize.js";
import { RemoteInput } from "../minigames/minigame.js";
import { EventFeed } from "../minigames/heist.js";
import { DUEL_KEYS, SEAT_KEYS, input } from "../core/input.js";
import { AIController, aiSkill } from "../game/controllers.js";
import { clock, every, wait } from "../core/tween.js";
import { audio } from "../audio/audio.js";

export const EMOTES = ['😂', '👏', '🔥', '😡', '😭', '🤑'];
const CHOICES = new Set(['buyChoice', 'rentChoice', 'jailChoice', 'targetChoice', 'tradeResponse']);
const MENUS = new Set(['humanTurnMenu', 'raiseFundsMenu']);
const skillOf = (p) => aiSkill(p);

const FALLBACK = {
  buyChoice: (ai, ctx) => ai.decideBuy(ctx),
  rentChoice: (ai, ctx) => ai.decideRent(ctx),
  jailChoice: (ai, ctx) => ai.decideJail(ctx),
  targetChoice: (ai, ctx) => ai.chooseTarget(ctx),
  tradeResponse: (ai, ctx) => ai.respondTrade(ctx),
  humanTurnMenu: (ai, ctx) => ai.turnMenu(ctx),
  raiseFundsMenu: (ai, ctx) => ai.raiseFunds(ctx),
};

// ═══════════════════════════════════════════════════════════════════ HOST
export class HostSession {
  /**
   * seats[pid] = { kind: 'host' | 'guest' | 'cpu', clientId }
   */
  constructor({ net, presenter, ui, state, seats }) {
    this.net = net;
    this.P = presenter;
    this.ui = ui;
    this.state = state;
    this.seats = seats;
    this.seq = 0;
    this.askSeq = 0;
    this.subSeq = 0;
    this.asks = new Map();
    this.duels = new Map();
    this.heists = new Map();
    this.auctions = new Map();
    this.fallback = new AIController({});
    this.proxy = this.makeProxy();
    this.offs = [
      net.on('msg', (m) => this.onMsg(m)),
      net.on('peer-leave', (m) => this.onLeave(m.id)),
      net.on('peer-join', (m) => this.onJoin(m)),
    ];
    this.broadcastPresence();
  }

  dispose() { this.offs.forEach((f) => f()); this.disposed = true; }

  ownerOf(p) {
    const seat = this.seats[p.id];
    if (!seat || seat.kind === 'cpu') return 'cpu';
    if (seat.kind === 'host') return 'host';
    return seat.clientId;
  }
  pidOf(clientId) { return this.seats.findIndex((s) => s && s.clientId === clientId && s.kind === 'guest'); }
  online(clientId) { return !!this.net.peers.get(clientId)?.connected; }

  broadcast(data) { this.net.send('all', data); }
  beat(m, args, extra = {}) {
    if (this.disposed) return;
    this.broadcast({ k: 'beat', seq: ++this.seq, m, args: ser(args, this.state), state: this.state, ...extra });
  }

  broadcastPresence() {
    const presence = {};
    this.seats.forEach((s, pid) => { if (s?.kind === 'guest') presence[pid] = this.online(s.clientId); });
    this.ui.setPresence?.(presence);
    this.broadcast({ k: 'presence', presence });
  }

  /** What a (re)joining client needs to pick the game up mid-flight. */
  syncFor(clientId) {
    const pid = this.pidOf(clientId);
    return { k: 'sync', state: this.state, seats: this.seats, me: pid >= 0 ? pid : null, seq: this.seq };
  }

  onJoin() {
    // the (re)joining client says 'hello' and gets a full sync back
    this.broadcastPresence();
  }

  onLeave(clientId) {
    // Anything waiting on that player is answered by the CPU instead.
    for (const [id, a] of this.asks) {
      if (a.clientId !== clientId) continue;
      this.asks.delete(id);
      Promise.resolve(FALLBACK[a.m](this.fallback, a.ctx)).then((v) => this.settle(id, a, v));
    }
    for (const h of this.heists.values()) if (h.owner === clientId) h.feed.push({ e: 'end', cracked: 1 });
    this.broadcastPresence();
  }

  settle(id, a, value) {
    this.broadcast({ k: 'resolved', ask: id, value: ser(value, this.state) });
    a.resolve(value);
  }

  // ─────────────────────────── the presenter proxy the engine talks to
  makeProxy() {
    const self = this;
    return new Proxy(this.P, {
      get(target, name) {
        const v = target[name];
        if (typeof v !== 'function') return v;
        if (name === 'runDuel') return (o) => self.duel(o);
        if (name === 'runAuction') return (o) => self.auction(o);
        if (name === 'runHeist') return (p, pot) => self.heist(p, pot);
        if (CHOICES.has(name) || MENUS.has(name)) {
          return (ctx, ...rest) => {
            if (rest.length && rest[0] !== undefined) { // a CPU's decision, shown to everyone
              self.beat(name, [ctx, rest[0]]);
              return v.call(target, ctx, rest[0]);
            }
            return self.localDecision(name, ctx);
          };
        }
        return (...args) => { self.beat(name, args); return v.apply(target, args); };
      },
    });
  }

  /** The host's own player decides; guests spectate. */
  async localDecision(m, ctx) {
    const id = ++this.askSeq;
    this.beat(m, [ctx], { ask: id, owner: this.net.id });
    const r = await this.P[m](ctx);
    this.broadcast({ k: 'resolved', ask: id, value: ser(r, this.state) });
    return r;
  }

  /** A guest's player decides on their own screen; everyone else spectates. */
  async askRemote(pid, m, ctx) {
    const clientId = this.seats[pid].clientId;
    if (!this.online(clientId)) {
      // Disconnected: the CPU plays their turn (shown like any CPU decision).
      const v = await FALLBACK[m](this.fallback, ctx);
      if (MENUS.has(m)) return this.proxy.aiAction(ctx, v);
      return this.proxy[m](ctx, v);
    }
    const id = ++this.askSeq;
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    this.asks.set(id, { pid, clientId, m, ctx, resolve });
    this.beat(m, [ctx], { ask: id, owner: clientId });
    const view = MENUS.has(m) ? this.P.spectateMenu(ctx, promise) : this.P[m](ctx, promise);
    const r = await promise;
    await view;
    return r;
  }

  onMsg({ from, data }) {
    if (!data || this.disposed) return;
    switch (data.k) {
      case 'answer': {
        const a = this.asks.get(data.ask);
        if (!a || a.clientId !== from) return;
        this.asks.delete(data.ask);
        this.settle(data.ask, a, des(data.value, this.state));
        break;
      }
      case 'din': {
        const d = this.duels.get(data.id);
        if (!d) return;
        const side = d.owners.indexOf(from);
        if (side >= 0) d.inputs[side]?.feed(data.m || {});
        break;
      }
      case 'dready': this.duels.get(data.id)?.ready.add(from); break;
      case 'hev': {
        const h = this.heists.get(data.id);
        if (!h || h.owner !== from) return;
        h.feed.push(data.ev);
        this.broadcast({ k: 'hev', id: data.id, ev: data.ev });
        break;
      }
      case 'ain': {
        const pid = this.pidOf(from);
        const held = this.auctions.get(data.id);
        if (held && pid >= 0) held.set(pid, !!data.h);
        break;
      }
      case 'hello':
        this.net.send(from, this.syncFor(from));
        break;
      case 'emote':
        if (!EMOTES.includes(data.e) || this.pidOf(from) < 0) return;
        this.P.emote?.(this.pidOf(from), data.e);
        this.broadcast({ k: 'emote', pid: this.pidOf(from), e: data.e });
        break;
      default:
    }
  }

  // ─────────────────────────── duels
  async duel(o) {
    const { a, b, game, ctx } = o;
    const skill = [a.isAI ? skillOf(a) : null, b.isAI ? skillOf(b) : null];
    if (a.isAI && b.isAI && this.state.settings.cpuDuels !== 'watch') {
      const pA = Math.min(0.85, Math.max(0.15, 0.5 + (skill[0] - skill[1]) * 0.7));
      const winner = Math.random() < pA ? a.id : b.id;
      this.beat('quickDuelById', [a, b, game, ctx, skill, winner]);
      return this.P.quickDuelById(a, b, game, ctx, skill, winner);
    }
    const id = ++this.subSeq;
    const owners = [a, b].map((p) => this.ownerOf(p));
    const inputs = owners.map((ow) => (ow !== 'host' && ow !== 'cpu' ? new RemoteInput(DUEL_KEYS.solo.label) : null));
    const controls = owners.map((ow, i) => (ow === 'cpu' ? null : ow === 'host' ? DUEL_KEYS.solo : inputs[i]));
    const d = { inputs, owners, ready: new Set() };
    this.duels.set(id, d);
    this.beat('runDuel', [o], { duel: { id, owners } });
    const remote = owners.filter((ow) => ow !== 'host' && ow !== 'cpu');
    const session = {
      host: true,
      controls,
      game: {
        host: true,
        event: (ev) => this.broadcast({ k: 'dev', id, ev }),
        snap: (s) => this.broadcast({ k: 'dsnap', id, s }),
      },
      ready: async () => {
        // wait for remote duelists to be in the arena too (or give up after a while)
        let t = 0;
        await every((dt) => { t += dt; return t > 20 || remote.every((c) => d.ready.has(c) || !this.online(c)); }, true);
        this.broadcast({ k: 'dgo', id });
      },
      end: (w) => this.broadcast({ k: 'dend', id, w }),
    };
    try {
      return await this.P.runDuel(o, session);
    } finally {
      this.duels.delete(id);
    }
  }

  // ─────────────────────────── heists
  async heist(p, pot) {
    const id = ++this.subSeq;
    let owner = this.ownerOf(p);
    if (owner !== 'host' && owner !== 'cpu' && !this.online(owner)) owner = 'cpu';
    this.beat('runHeist', [p, pot], { heist: { id, owner } });
    if (owner === 'host' || owner === 'cpu') {
      return this.P.runHeist(p, pot, {
        mode: 'play', local: owner === 'host', skill: owner === 'cpu' ? skillOf(p) : undefined,
        emit: (ev) => this.broadcast({ k: 'hev', id, ev }),
      });
    }
    const feed = new EventFeed();
    this.heists.set(id, { feed, owner });
    try {
      return await this.P.runHeist(p, pot, { mode: 'spectate', feed });
    } finally {
      this.heists.delete(id);
    }
  }

  // ─────────────────────────── auctions
  async auction(o) {
    const id = ++this.subSeq;
    const held = new Map();
    this.auctions.set(id, held);
    this.beat('runAuction', [{ idx: o.idx, bidders: o.bidders, aiValues: {} }], { auction: { id } });
    const self = this;
    const mirrorUI = {
      auction: new Proxy(this.ui.auction, {
        get(t, name) {
          const f = t[name];
          if (typeof f !== 'function') return f;
          return (...args) => { self.broadcast({ k: 'aop', id, op: name, args: ser(args, self.state) }); return f.apply(t, args); };
        },
      }),
    };
    const mirrorAudio = { play: (n, opt) => { this.broadcast({ k: 'aop', id, op: 'sound', args: [n, opt] }); audio.play(n, opt); } };
    const holdFn = (p) => {
      const ow = this.ownerOf(p);
      if (ow === 'host') return input.isDown('Space') || input.isDown(SEAT_KEYS[p.seat].code);
      return !!held.get(p.id);
    };
    try {
      return await this.P.runAuction(o, { ui: mirrorUI, audio: mirrorAudio, holdFn, keyLabel: (p) => (p.isAI ? null : 'SPACE') });
    } finally {
      this.auctions.delete(id);
    }
  }
}

/** Controller for a guest's player, living on the host. */
export class RemoteController {
  constructor(host, pid) { this.host = host; this.pid = pid; this.human = true; }
  turnMenu(ctx) { return this.host.askRemote(this.pid, 'humanTurnMenu', ctx); }
  decideBuy(ctx) { return this.host.askRemote(this.pid, 'buyChoice', ctx); }
  decideRent(ctx) { return this.host.askRemote(this.pid, 'rentChoice', ctx); }
  decideJail(ctx) { return this.host.askRemote(this.pid, 'jailChoice', ctx); }
  raiseFunds(ctx) { return this.host.askRemote(this.pid, 'raiseFundsMenu', ctx); }
  respondTrade(ctx) { return this.host.askRemote(this.pid, 'tradeResponse', ctx); }
  chooseTarget(ctx) { return this.host.askRemote(this.pid, 'targetChoice', ctx); }
}

// ═══════════════════════════════════════════════════════════════════ GUEST
export class GuestSession {
  constructor({ net, presenter, ui, state, me }) {
    this.net = net;
    this.P = presenter;
    this.ui = ui;
    this.state = state;
    this.me = me;
    this.queue = [];
    this.running = false;
    this.resolved = new Map();
    this.waiters = new Map();
    this.buffers = new Map();   // sub-protocol messages that arrive before their beat
    this.duel = null;
    this.heistFeeds = new Map();
    this.auction = null;
    this.offs = [net.on('msg', (m) => this.onMsg(m))];
  }

  dispose() { this.offs.forEach((f) => f()); this.disposed = true; this.queue = []; }

  onMsg({ from, data }) {
    if (from !== this.net.hostId || !data || this.disposed) return;
    switch (data.k) {
      case 'beat':
        this.queue.push(data);
        this.pump();
        break;
      case 'resolved': {
        const v = des(data.value, this.state);
        const w = this.waiters.get(data.ask);
        if (w) { this.waiters.delete(data.ask); w(v); } else this.resolved.set(data.ask, v);
        break;
      }
      case 'presence': this.ui.setPresence?.(data.presence); break;
      case 'emote': this.P.emote?.(data.pid, data.e); break;
      case 'dgo': case 'dsnap': case 'dev': case 'dend':
        if (this.duel?.id === data.id) this.duelMsg(data);
        else this.buffer(data.id, data);
        break;
      case 'hev': {
        const f = this.heistFeeds.get(data.id);
        if (f) f.push(data.ev); else this.buffer(data.id, data);
        break;
      }
      case 'aop':
        if (this.auction?.id === data.id) this.auctionOp(data);
        else this.buffer(data.id, data);
        break;
      default:
    }
  }

  buffer(id, msg) {
    if (!this.buffers.has(id)) this.buffers.set(id, []);
    this.buffers.get(id).push(msg);
  }
  takeBuffer(id) { const b = this.buffers.get(id) || []; this.buffers.delete(id); return b; }

  resolution(ask) {
    if (this.resolved.has(ask)) { const v = this.resolved.get(ask); this.resolved.delete(ask); return Promise.resolve(v); }
    return new Promise((r) => this.waiters.set(ask, r));
  }

  async pump() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length && !this.disposed) {
      // fall behind the host? play catch-up at a higher speed
      const base = this.state.settings.speed || 1;
      clock.scale = this.queue.length > 8 ? base * 3.5 : this.queue.length > 3 ? base * 2 : base;
      const b = this.queue.shift();
      applySnapshot(this.state, b.state);
      try { await this.run(b); } catch (e) { console.error('[guest beat]', b.m, e); }
    }
    clock.scale = this.state.settings.speed || 1;
    this.running = false;
  }

  async run(b) {
    const args = des(b.args, this.state);
    if (b.ask) {
      if (b.owner === this.net.id) {
        const r = await this.P[b.m](...args);
        this.net.send('host', { k: 'answer', ask: b.ask, value: ser(r, this.state) });
        return;
      }
      const promise = this.resolution(b.ask);
      if (MENUS.has(b.m)) await this.P.spectateMenu(args[0], promise);
      else await this.P[b.m](args[0], promise);
      return;
    }
    if (b.m === 'runDuel') return this.playDuel(args[0], b.duel);
    if (b.m === 'runHeist') return this.playHeist(args[0], args[1], b.heist);
    if (b.m === 'runAuction') return this.watchAuction(args[0], b.auction);
    if (typeof this.P[b.m] !== 'function') return;
    await this.P[b.m](...args);
  }

  // ─────────────────────────── duels
  async playDuel(o, meta) {
    const { id, owners } = meta;
    const side = owners.indexOf(this.net.id);
    let go;
    const goP = new Promise((r) => { go = r; });
    const pending = [];
    const gameNet = {
      puppet: true,
      localSide: side,
      localControls: DUEL_KEYS.solo,
      report: (r) => this.net.send('host', { k: 'din', id, m: { r } }),
      onSnap: null, onEvent: null, onEnd: null,
      flush: () => { for (const m of pending.splice(0)) this.duelMsg(m); },
    };
    this.duel = { id, gameNet, go, pending };
    for (const m of this.takeBuffer(id)) this.duelMsg(m);
    const controls = owners.map((ow) => (ow === 'cpu' ? null : { label: DUEL_KEYS.solo.label }));
    const session = {
      puppet: true,
      controls,
      game: gameNet,
      ready: async () => {
        if (side >= 0) this.net.send('host', { k: 'dready', id });
        let t = 0;
        let gone = false;
        goP.then(() => { gone = true; });
        await every((dt) => { t += dt; return gone || t > 25; }, true);
      },
    };
    // stream our keys while the duel runs
    let streaming = side >= 0;
    if (streaming) {
      let presses = 0, last = '', since = 0;
      every((dt) => {
        if (!streaming) return true;
        if (input.anyPressed(DUEL_KEYS.solo.action)) presses++;
        const c = DUEL_KEYS.solo;
        const a = {
          x: (input.anyDown(c.right) ? 1 : 0) - (input.anyDown(c.left) ? 1 : 0),
          y: (input.anyDown(c.down) ? 1 : 0) - (input.anyDown(c.up) ? 1 : 0),
        };
        const h = input.anyDown(c.action);
        const key = `${presses}|${a.x}|${a.y}|${h}`;
        since += dt;
        if (key !== last || since > 0.15) {
          last = key;
          since = 0;
          this.net.send('host', { k: 'din', id, m: { p: presses, h, a } });
        }
        return false;
      }, true);
    }
    try {
      await this.P.runDuel(o, session);
    } finally {
      streaming = false;
      this.duel = null;
    }
  }

  duelMsg(m) {
    const d = this.duel;
    const g = d.gameNet;
    if (m.k === 'dgo') { d.go(); return; }
    const handler = m.k === 'dsnap' ? g.onSnap : m.k === 'dev' ? g.onEvent : g.onEnd;
    if (!handler) { d.pending.push(m); return; }
    if (m.k === 'dsnap') handler(m.s);
    else if (m.k === 'dev') handler(m.ev);
    else handler(m.w);
  }

  // ─────────────────────────── heists
  async playHeist(p, pot, meta) {
    if (meta.owner === this.net.id) {
      return this.P.runHeist(p, pot, { mode: 'play', local: true, emit: (ev) => this.net.send('host', { k: 'hev', id: meta.id, ev }) });
    }
    const feed = new EventFeed();
    this.heistFeeds.set(meta.id, feed);
    for (const m of this.takeBuffer(meta.id)) feed.push(m.ev);
    try {
      return await this.P.runHeist(p, pot, { mode: 'spectate', feed });
    } finally {
      this.heistFeeds.delete(meta.id);
    }
  }

  // ─────────────────────────── auctions
  async watchAuction(o, meta) {
    let done;
    const doneP = new Promise((r) => { done = r; });
    this.auction = { id: meta.id, done, bidder: o.bidders.some((b) => b.id === this.me && !b.isAI) };
    await this.P.spectateAuction?.(o.idx);
    for (const m of this.takeBuffer(meta.id)) this.auctionOp(m);
    let streaming = this.auction.bidder;
    if (streaming) {
      let last = null, since = 0;
      every((dt) => {
        if (!streaming) return true;
        const h = input.isDown('Space') || input.isDown('Virtual') || (this.me != null && input.isDown(SEAT_KEYS[this.state.players[this.me].seat].code));
        since += dt;
        if (h !== last || since > 0.2) { last = h; since = 0; this.net.send('host', { k: 'ain', id: meta.id, h }); }
        return false;
      }, true);
    }
    await doneP;
    streaming = false;
    this.auction = null;
    this.P.busyCard = false;
  }

  auctionOp(m) {
    if (m.op === 'sound') { const [n, o] = m.args || []; audio.play(n, o || {}); return; }
    const args = des(m.args, this.state);
    const r = this.ui.auction[m.op]?.(...args);
    if (m.op === 'open' && r && this.me != null) {
      const card = r.querySelector(`.bidder[data-pid="${this.me}"]`);
      if (card) {
        card.addEventListener('pointerdown', (e) => { e.preventDefault(); input.pressVirtual('Virtual'); });
        window.addEventListener('pointerup', () => input.releaseVirtual('Virtual'), { once: true });
      }
    }
    if (m.op === 'close') Promise.resolve(r).then(() => this.auction?.done());
  }
}

export { wait };
