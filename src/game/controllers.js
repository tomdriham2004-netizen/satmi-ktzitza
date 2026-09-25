// Player controllers. The engine asks a controller for every decision; the
// controller answers with a plain action object. Human answers come from the
// UI, AI answers from heuristics below. A future NetworkController would
// forward the same calls to a remote client.
import { TILES, DISTRICTS, districtTiles } from "./board.js";
import { CONFIG } from "./config.js";
import {
  alive, ownedBy, canBuild, canMortgage, canUnmortgage, districtOwnedCount, ownsDistrict,
  liquidity, buildCost, rentFor,
} from "./rules.js";

export class HumanController {
  constructor(presenter) { this.P = presenter; this.human = true; }
  turnMenu(ctx) { return this.P.humanTurnMenu(ctx); }
  decideBuy(ctx) { return this.P.buyChoice(ctx); }
  decideRent(ctx) { return this.P.rentChoice(ctx); }
  decideJail(ctx) { return this.P.jailChoice(ctx); }
  raiseFunds(ctx) { return this.P.raiseFundsMenu(ctx); }
  respondTrade(ctx) { return this.P.tradeResponse(ctx); }
  chooseTarget(ctx) { return this.P.targetChoice(ctx); }
}

// Difficulty profiles. `skill` (0..1) drives minigame play; the rest drive
// money decisions. Easy makes real mistakes, Normal is a fair opponent for a
// casual player, Hard plays close to optimally.
export const AI_LEVELS = {
  easy:   { skill: 0.12, reserve: 60,  duel: 0.62, trade: 0,    margin: -60, builds: 1, buildChance: 0.35, smartBuild: false, smartBuy: false, buySkip: 0.3, takeover: 0 },
  normal: { skill: 0.4,  reserve: 120, duel: 0.52, trade: 0.1,  margin: 10,  builds: 2, buildChance: 0.65, smartBuild: true,  smartBuy: true,  buySkip: 0.1, takeover: 0.35 },
  hard:   { skill: 0.72, reserve: 200, duel: 0.58, trade: 0.3,  margin: 60,  builds: 4, buildChance: 1,    smartBuild: true,  smartBuy: true,  buySkip: 0,   takeover: 0.7 },
};
const LEVEL = AI_LEVELS;
/** Minigame skill for a CPU player (0 = hopeless, 1 = perfect). */
export const aiSkill = (p) => (AI_LEVELS[p?.aiLevel] || AI_LEVELS.normal).skill;
const round5 = (v) => Math.round(v / 5) * 5;

export class AIController {
  constructor(presenter) {
    this.P = presenter;
    this.turnKey = '';
    this.actions = 0;
    this.tradeTried = false;
    this.proposed = new Map();
  }

  cfg(p) { return LEVEL[p.aiLevel] || LEVEL.normal; }

  reserve(p, s) {
    // Keep enough cash to survive the nastiest rent currently on the board.
    let worst = 0;
    for (const i of Object.keys(s.tiles)) {
      const ts = s.tiles[i];
      if (ts.owner !== null && ts.owner !== p.id) worst = Math.max(worst, rentFor(s, +i, 8).amount);
    }
    return this.cfg(p).reserve + Math.min(400, worst * 0.4);
  }

  completesDistrict(s, pid, idx) {
    const t = TILES[idx];
    if (t.type !== 'property') return false;
    return districtTiles(t.district).every((i) => i === idx || s.tiles[i].owner === pid);
  }

  // ─────────────────────────────── turn menu
  async turnMenu(ctx) {
    const { player: p, state: s, phase } = ctx;
    const key = `${s.round}:${s.turn}:${p.id}`;
    if (this.turnKey !== key) {
      this.turnKey = key; this.actions = 0; this.tradeTried = false;
      this.buildsThisTurn = Math.random() < this.cfg(p).buildChance; // weaker CPUs often forget to build
    }
    let act = null;
    if (this.actions < this.cfg(p).builds + 1) act = this.pickManage(p, s);
    if (!act && phase === 'pre' && !this.tradeTried) { this.tradeTried = true; act = this.pickTrade(p, s); }
    if (act) this.actions++;
    else act = { type: phase === 'pre' ? 'roll' : 'end' };
    return this.P.aiAction ? this.P.aiAction(ctx, act) : act;
  }

  pickManage(p, s) {
    const reserve = this.reserve(p, s);
    const mine = ownedBy(s, p.id);
    // Unmortgage the most useful lot when flush.
    const mort = mine.filter((i) => s.tiles[i].mortgaged)
      .map((i) => ({ i, c: canUnmortgage(s, p.id, i) }))
      .filter((x) => x.c.ok && p.cash - x.c.cost > reserve * 1.6)
      .sort((a, b) => TILES[b.i].price - TILES[a.i].price);
    if (mort.length) return { type: 'unmortgage', idx: mort[0].i };
    if (!this.buildsThisTurn) return null;
    // Build where it earns the most per dollar, favouring full districts.
    const opts = mine
      .map((i) => ({ i, c: canBuild(s, p.id, i) }))
      .filter((x) => x.c.ok && p.cash - x.c.cost >= reserve)
      .map((x) => {
        const t = TILES[x.i];
        const lvl = s.tiles[x.i].level;
        const gain = t.rent[lvl + 1] - t.rent[lvl];
        const full = ownsDistrict(s, p.id, t.district) ? 1.6 : 1;
        return { ...x, score: (gain / x.c.cost) * full };
      })
      .sort((a, b) => b.score - a.score);
    if (!opts.length) return null;
    // Easy CPUs don't know which upgrade pays best — they just pick one.
    const pick = this.cfg(p).smartBuild ? opts[0] : opts[Math.floor(Math.random() * opts.length)];
    return { type: 'build', idx: pick.i };
  }

  pickTrade(p, s) {
    if (Math.random() > this.cfg(p).trade) return null;
    const reserve = this.reserve(p, s);
    for (const d of Object.keys(DISTRICTS)) {
      const tiles = districtTiles(d);
      const mineN = tiles.filter((i) => s.tiles[i].owner === p.id).length;
      if (mineN !== tiles.length - 1 || mineN === 0) continue;
      const missing = tiles.find((i) => s.tiles[i].owner !== p.id);
      const holder = s.tiles[missing].owner;
      if (holder === null || s.players[holder].bankrupt) continue;
      const k = `${holder}:${missing}`;
      if (this.proposed.has(k) && s.round - this.proposed.get(k) < 5) continue;
      const t = TILES[missing];
      const offerCash = round5(t.price * 1.6 + s.tiles[missing].level * buildCost(missing) * 0.8);
      if (p.cash - offerCash < reserve * 0.7) continue;
      this.proposed.set(k, s.round);
      return {
        type: 'trade',
        offer: { from: p.id, to: holder, give: { cash: offerCash, tiles: [] }, get: { cash: 0, tiles: [missing] } },
      };
    }
    return null;
  }

  // ─────────────────────────────── decisions
  async decideBuy(ctx) {
    const { player: p, tile: t, state: s, canAfford } = ctx;
    let d = 'auction';
    if (canAfford) {
      const reserve = this.reserve(p, s);
      const strategic = t.type === 'property'
        ? districtOwnedCount(s, p.id, t.district) > 0
        : ownedBy(s, p.id).some((i) => TILES[i].type === t.type);
      const cfg = this.cfg(p);
      if (p.cash - t.price >= reserve * (cfg.smartBuy ? 0.6 : 1)) d = 'buy';
      if (cfg.smartBuy && strategic && p.cash - t.price >= 30) d = 'buy';
      if (d === 'buy' && Math.random() < cfg.buySkip) d = 'auction';
    }
    return this.P.buyChoice ? this.P.buyChoice(ctx, d) : d;
  }

  async decideRent(ctx) {
    const { player: p, owner, tile: t, rent, state: s, takeover, duelLoss } = ctx;
    const cfg = this.cfg(p);
    const reserve = this.reserve(p, s);
    let d = 'pay';
    if (takeover && p.cash - takeover >= reserve * 1.5) {
      const strategic = t.type === 'property' && (this.completesDistrict(s, p.id, t.index) || districtOwnedCount(s, p.id, t.district) >= 1);
      const tk = cfg.takeover;
      if ((strategic && Math.random() < tk) || Math.random() < tk * 0.15) d = 'takeover';
    }
    if (d === 'pay' && ctx.duel) {
      const liq = liquidity(s, p.id);
      let pd = cfg.duel;
      if (rent.amount < 25) pd *= 0.35;
      if (s.bounty?.playerId === owner.id) pd += 0.3;
      if (duelLoss > liq) pd = rent.amount > liq ? 0.95 : pd * 0.25;
      if (Math.random() < pd) d = 'duel';
    }
    return this.P.rentChoice ? this.P.rentChoice(ctx, d) : d;
  }

  async decideJail(ctx) {
    const { player: p, options, state: s } = ctx;
    let d = 'roll';
    if (options.card) d = 'card';
    else if (options.appeal && Math.random() < 0.3) d = 'appeal';
    else if (options.canPay && s.round < 10 && p.cash > this.reserve(p, s) + options.bail) d = 'pay';
    return this.P.jailChoice ? this.P.jailChoice(ctx, d) : d;
  }

  async raiseFunds(ctx) {
    const { player: p, state: s } = ctx;
    const mine = ownedBy(s, p.id);
    const built = mine.filter((i) => s.tiles[i].level > 0).sort((a, b) => buildCost(a) - buildCost(b));
    let act = null;
    if (built.length) act = { type: 'sell', idx: built[0] };
    else {
      const m = mine.filter((i) => canMortgage(s, p.id, i).ok)
        .sort((a, b) => (ownsDistrictOf(s, p.id, a) - ownsDistrictOf(s, p.id, b)) || TILES[a].price - TILES[b].price);
      if (m.length) act = { type: 'mortgage', idx: m[0] };
    }
    act = act || { type: 'bankrupt' };
    return this.P.aiAction ? this.P.aiAction(ctx, act) : act;
  }

  tileWorth(s, idx) {
    return TILES[idx].price + s.tiles[idx].level * buildCost(idx) * 0.8 - (s.tiles[idx].mortgaged ? TILES[idx].price * 0.5 : 0);
  }

  async respondTrade(ctx) {
    const { offer, player: p, state: s } = ctx;
    const other = offer.from;
    let gain = offer.give.cash || 0;
    let loss = offer.get.cash || 0;
    for (const i of offer.give.tiles) {
      gain += this.tileWorth(s, i) * (this.completesDistrict(s, p.id, i) ? 2.2 : 1);
    }
    for (const i of offer.get.tiles) {
      let v = this.tileWorth(s, i);
      if (this.completesDistrict(s, other, i)) v += TILES[i].price * 1.8;
      if (TILES[i].type === 'property' && ownsDistrict(s, p.id, TILES[i].district)) v *= 2.5;
      loss += v;
    }
    const cash = p.cash + (offer.give.cash || 0) - (offer.get.cash || 0);
    const yes = gain - loss >= this.cfg(p).margin && cash >= 0;
    return this.P.tradeResponse ? this.P.tradeResponse(ctx, yes) : yes;
  }

  async chooseTarget(ctx) {
    const { candidates, kind, player: p, state: s } = ctx;
    let pick = candidates[0];
    if (kind === 'steal') pick = candidates.slice().sort((a, b) => b.cash - a.cash)[0];
    else if (kind === 'swap') {
      // Swap with whoever stands on the most dangerous-looking spot for us… or just the leader.
      pick = candidates.slice().sort((a, b) => b.pos - a.pos)[Math.floor(Math.random() * candidates.length)];
    }
    void p; void s;
    return this.P.targetChoice ? this.P.targetChoice(ctx, pick.id) : pick.id;
  }

  auctionValue({ player: p, idx, state: s }) {
    const t = TILES[idx];
    let v = t.price * (0.7 + Math.random() * 0.35);
    if (t.type === 'property') {
      const n = districtOwnedCount(s, p.id, t.district);
      v *= 1 + 0.3 * n;
      if (this.completesDistrict(s, p.id, idx)) v *= 1.35;
    }
    v *= 0.8 + this.cfg(p).skill * 0.35; // weaker CPUs underbid
    v = Math.min(v, p.cash - this.reserve(p, s) * 0.4);
    return Math.max(0, round5(v));
  }
}

function ownsDistrictOf(s, pid, idx) {
  const t = TILES[idx];
  return t.type === 'property' && ownsDistrict(s, pid, t.district) ? 1 : 0;
}

export { alive, CONFIG };
