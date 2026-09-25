// The authoritative game engine. It owns the rules and the turn flow, mutates
// state, and awaits two collaborators:
//   • presenter  — plays every visual/audio beat (or a no-op in headless sims)
//   • controllers — one per player: Human (UI), AI, or (later) Network
// Nothing here touches Three.js or the DOM, so the same engine can run on a
// server for online play.
import { CONFIG } from "./config.js";
import { TILES, BOARD_SIZE, JAIL_INDEX, isOwnable } from "./board.js";
import { CARD_BY_ID } from "./cards.js";
import { DUEL_MINIGAMES } from "./minigames.js";
import {
  alive, rentFor, canBuild, canSell, canMortgage, canUnmortgage, canTakeover,
  liquidity, ownedBy, standings, netWorth, buildCost,
} from "./rules.js";
import { RNG } from "../core/rng.js";

const isPlayer = (x) => x && typeof x === 'object' && 'cash' in x;

export class GameEngine {
  constructor(state, { presenter, controllers, onSave } = {}) {
    this.state = state;
    this.P = presenter;
    this.ctrls = controllers;
    this.onSave = onSave;
    this.rng = new RNG(0);
    this.rng.state = state.rng;
    this.stopped = false;
  }

  ctrl(p) { return this.ctrls[p.id]; }
  syncRng() { this.state.rng = this.rng.state; }
  get current() { return this.state.players[this.state.turn]; }

  // ───────────────────────────────────────────── main loop
  async run() {
    const s = this.state;
    await this.P.gameStart(s);
    while (!s.over && !this.stopped) {
      const p = this.current;
      if (!p.bankrupt) {
        await this.playTurn(p);
        if (this.checkGameOver()) break;
      }
      await this.nextTurn();
      if (s.over) break;
      this.syncRng();
      this.onSave?.(s);
    }
    if (s.over) {
      this.onSave?.(s);
      await this.P.gameOver(s.players[s.winner], standings(s));
    }
  }

  async playTurn(p) {
    const s = this.state;
    await this.P.turnStart(p);
    if (p.inJail) {
      const r = await this.jailTurn(p);
      if (p.bankrupt || s.over) return;
      if (!r.free) { await this.menu(p, 'post'); return; }
      if (r.dice) {
        await this.moveBy(p, r.dice[0] + r.dice[1], { resolve: true, dice: r.dice });
        if (!p.bankrupt && !s.over) await this.menu(p, 'post');
        return;
      }
    }
    let doubles = 0;
    for (;;) {
      await this.menu(p, 'pre');
      if (p.bankrupt || s.over) return;
      const dice = this.rollDice();
      await this.P.rollDice(p, dice);
      const dbl = dice[0] === dice[1];
      if (dbl) {
        doubles++;
        if (doubles === 3) {
          await this.sendToJail(p, 'שלושה דאבלים ברצף: מהירות מופרזת!');
          break;
        }
      }
      await this.moveBy(p, dice[0] + dice[1], { resolve: true, dice });
      if (p.bankrupt || s.over) return;
      if (dbl && !p.inJail) { await this.P.doublesAgain(p); continue; }
      break;
    }
    if (!p.bankrupt && !s.over) await this.menu(p, 'post');
  }

  async nextTurn() {
    const s = this.state;
    const n = s.players.length;
    let wrapped = false;
    let t = s.turn;
    for (let step = 1; step <= n; step++) {
      t = (s.turn + step) % n;
      if (t === 0) wrapped = true;
      if (!s.players[t].bankrupt) break;
    }
    s.turn = t;
    if (wrapped) await this.newRound();
  }

  async newRound() {
    const s = this.state;
    s.round++;
    if (s.settings.roundLimit && s.round > s.settings.roundLimit) {
      s.round = s.settings.roundLimit;
      const top = standings(s)[0];
      this.finish(top.id, 'rounds');
      return;
    }
    await this.P.newRound(s.round);
    for (const d of Object.keys(s.hype)) {
      s.hype[d].rounds--;
      if (s.hype[d].rounds <= 0) { delete s.hype[d]; await this.P.hypeEnded(d); }
    }
    s.timePhase = (s.timePhase + 1) % 4;
    await this.P.timeChanged(s.timePhase, 'round');
    await this.updateBounty();
  }

  checkGameOver() {
    const s = this.state;
    if (s.over) return true;
    const a = alive(s);
    if (a.length <= 1) { this.finish(a[0]?.id ?? 0, 'last'); return true; }
    return false;
  }
  finish(winnerId, why) {
    this.state.over = true;
    this.state.winner = winnerId;
    this.state.endReason = why;
  }

  // ───────────────────────────────────────────── menus & management
  async menu(p, phase) {
    const s = this.state;
    for (let guard = 0; guard < 60; guard++) {
      if (p.bankrupt || s.over) return;
      const act = await this.ctrl(p).turnMenu({ phase, player: p, state: s });
      if (!act) continue;
      if (phase === 'pre' && act.type === 'roll') return;
      if (phase === 'post' && act.type === 'end') return;
      await this.perform(p, act);
    }
  }

  async perform(p, act) {
    const s = this.state;
    const idx = act.idx;
    switch (act.type) {
      case 'build': {
        const c = canBuild(s, p.id, idx);
        if (!c.ok) return;
        await this.pay(p, 'bank', c.cost, 'בנייה', { quiet: true });
        s.tiles[idx].level++;
        await this.P.build(idx, p);
        return;
      }
      case 'sell': {
        const c = canSell(s, p.id, idx);
        if (!c.ok) return;
        s.tiles[idx].level--;
        p.cash += c.refund;
        await this.P.demolish(idx, p, c.refund);
        return;
      }
      case 'mortgage': {
        const c = canMortgage(s, p.id, idx);
        if (!c.ok) return;
        s.tiles[idx].mortgaged = true;
        p.cash += c.value;
        await this.P.mortgage(idx, p, true, c.value);
        return;
      }
      case 'unmortgage': {
        const c = canUnmortgage(s, p.id, idx);
        if (!c.ok) return;
        p.cash -= c.cost;
        s.tiles[idx].mortgaged = false;
        await this.P.mortgage(idx, p, false, c.cost);
        return;
      }
      case 'trade':
        await this.trade(p, act.offer);
        return;
      default:
    }
  }

  validTrade(offer) {
    const s = this.state;
    const a = s.players[offer.from], b = s.players[offer.to];
    if (!a || !b || a.bankrupt || b.bankrupt || a === b) return false;
    if ((offer.give.cash || 0) > a.cash || (offer.get.cash || 0) > b.cash) return false;
    if (offer.give.cash < 0 || offer.get.cash < 0) return false;
    if (!offer.give.tiles.every((i) => s.tiles[i]?.owner === a.id)) return false;
    if (!offer.get.tiles.every((i) => s.tiles[i]?.owner === b.id)) return false;
    return offer.give.tiles.length + offer.get.tiles.length + (offer.give.cash || 0) + (offer.get.cash || 0) > 0;
  }

  async trade(p, offer) {
    const s = this.state;
    if (!this.validTrade(offer)) return false;
    const partner = s.players[offer.to];
    await this.P.tradeProposed(offer);
    const yes = await this.ctrl(partner).respondTrade({ offer, player: partner, state: s });
    if (!yes) { await this.P.tradeResult(offer, false); return false; }
    const a = s.players[offer.from];
    a.cash += (offer.get.cash || 0) - (offer.give.cash || 0);
    partner.cash += (offer.give.cash || 0) - (offer.get.cash || 0);
    offer.give.tiles.forEach((i) => { s.tiles[i].owner = partner.id; });
    offer.get.tiles.forEach((i) => { s.tiles[i].owner = a.id; });
    await this.P.tradeResult(offer, true);
    return true;
  }

  // ───────────────────────────────────────────── money
  /**
   * Move money between players / 'bank' / 'vault'. If a player can't cover it
   * they must raise funds (sell / mortgage / trade) or go bankrupt.
   * Returns false when the payer went bankrupt.
   */
  async pay(from, to, amount, reason, opts = {}) {
    const s = this.state;
    amount = Math.max(0, Math.round(amount));
    if (amount === 0) return true;
    if (isPlayer(from)) {
      if (from.bankrupt) return false;
      if (from.cash < amount) {
        const ok = await this.raiseFunds(from, amount, reason);
        if (!ok) { await this.bankrupt(from, to); return false; }
      }
      from.cash -= amount;
    } else if (from === 'vault') {
      amount = Math.min(amount, s.vault);
      s.vault -= amount;
    }
    if (isPlayer(to)) { if (!to.bankrupt) to.cash += amount; } else if (to === 'vault') s.vault += amount;
    await this.P.money(from, to, amount, reason, opts);
    return true;
  }

  async raiseFunds(p, amount, reason) {
    const s = this.state;
    for (let guard = 0; guard < 80 && p.cash < amount; guard++) {
      if (liquidity(s, p.id) < amount) {
        await this.P.cannotPay(p, amount, reason);
        return false;
      }
      const act = await this.ctrl(p).raiseFunds({ player: p, amount, reason, state: s });
      if (!act || act.type === 'bankrupt') return false;
      if (['sell', 'mortgage', 'trade'].includes(act.type)) await this.perform(p, act);
    }
    return p.cash >= amount;
  }

  async bankrupt(p, creditor) {
    const s = this.state;
    const props = ownedBy(s, p.id);
    p.bankrupt = true;
    p.inJail = false;
    await this.P.bankrupt(p, isPlayer(creditor) ? creditor : null, props);
    if (isPlayer(creditor) && !creditor.bankrupt) {
      creditor.cash += Math.max(0, p.cash);
      props.forEach((i) => { s.tiles[i].owner = creditor.id; });
    } else {
      s.vault += Math.max(0, p.cash);
      props.forEach((i) => { s.tiles[i] = { owner: null, level: 0, mortgaged: false }; });
    }
    p.cash = 0;
    if (s.bounty?.playerId === p.id) s.bounty = null;
    await this.P.refreshTiles(props);
    this.P.syncPlayers();
    this.checkGameOver();
  }

  // ───────────────────────────────────────────── movement
  rollDice() {
    const d = [this.rng.int(1, 6), this.rng.int(1, 6)];
    this.syncRng();
    return d;
  }

  async moveBy(p, steps, { resolve = false, dice = null } = {}) {
    const from = p.pos;
    const to = (((from + steps) % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
    const passedGo = steps > 0 && from + steps >= BOARD_SIZE;
    p.pos = to;
    if (passedGo) p.cash += CONFIG.salary;
    await this.P.movePawn(p, from, steps, { salary: passedGo ? CONFIG.salary : 0 });
    if (resolve) await this.resolveTile(p, dice);
  }

  async moveTo(p, idx, { resolve = false } = {}) {
    const steps = (idx - p.pos + BOARD_SIZE) % BOARD_SIZE;
    if (steps === 0) { if (resolve) await this.resolveTile(p, null); return; }
    await this.moveBy(p, steps, { resolve });
  }

  async sendToJail(p, reason) {
    p.pos = JAIL_INDEX;
    p.inJail = true;
    p.jailTurns = 0;
    await this.P.toJail(p, reason);
  }

  async release(p, how) {
    p.inJail = false;
    p.jailTurns = 0;
    await this.P.release(p, how);
  }

  async jailTurn(p) {
    const s = this.state;
    const bail = CONFIG.jailBail;
    p.jailTurns++;
    if (p.jailTurns > CONFIG.maxJailTurns) {
      if (!(await this.pay(p, 'vault', bail, 'ערבות'))) return { free: false };
      await this.release(p, 'served');
      return { free: true };
    }
    const others = alive(s).filter((o) => o !== p);
    const options = {
      bail,
      canPay: p.cash >= bail,
      card: p.cards.jailFree > 0,
      appeal: s.settings.duels && others.length > 0,
      turn: p.jailTurns,
      maxTurns: CONFIG.maxJailTurns,
    };
    const choice = await this.ctrl(p).decideJail({ player: p, options, state: s });
    if (choice === 'card' && options.card) {
      p.cards.jailFree--;
      await this.release(p, 'card');
      return { free: true };
    }
    if (choice === 'pay' && options.canPay) {
      await this.pay(p, 'vault', bail, 'ערבות');
      await this.release(p, 'bail');
      return { free: true };
    }
    if (choice === 'appeal' && options.appeal) {
      const prosecutor = others.slice().sort((a, b) => netWorth(s, b.id) - netWorth(s, a.id))[0];
      const w = await this.duel(p, prosecutor, { reason: 'appeal' });
      if (w === p.id) { await this.release(p, 'appeal'); return { free: true }; }
      await this.P.toast(`הערעור נדחה! ${p.name} נשאר בכלא.`, 'bad');
      return { free: false };
    }
    const dice = this.rollDice();
    await this.P.rollDice(p, dice, { jail: true });
    if (dice[0] === dice[1]) { await this.release(p, 'doubles'); return { free: true, dice }; }
    if (p.jailTurns >= CONFIG.maxJailTurns) {
      if (!(await this.pay(p, 'vault', bail, 'ערבות'))) return { free: false };
      await this.release(p, 'served');
      return { free: true, dice };
    }
    await this.P.toast(`אין דאבל. ${p.name} נשאר בפנים.`, 'bad');
    return { free: false };
  }

  // ───────────────────────────────────────────── tiles
  async resolveTile(p, dice) {
    const s = this.state;
    const t = TILES[p.pos];
    await this.P.landed(p, p.pos);
    if (isOwnable(t)) return this.landOwnable(p, t, dice);
    switch (t.type) {
      case 'go':
        await this.pay('bank', p, CONFIG.exactPaydayBonus, 'יום משכורת מושלם!');
        return;
      case 'tax':
        await this.pay(p, 'vault', t.amount, t.name);
        return;
      case 'news':
      case 'fortune':
        await this.drawCard(p, t.type);
        return;
      case 'heist':
        await this.heist(p);
        return;
      case 'gotojail':
        await this.sendToJail(p, 'נתפסת!');
        return;
      default:
        if (t.type === 'jail') await this.P.toast(`${p.name} רק מבקר בכלא.`);
    }
    void s;
  }

  async landOwnable(p, t, dice) {
    const s = this.state;
    const ts = s.tiles[t.index];
    if (ts.owner === null) {
      const canAfford = p.cash >= t.price;
      const choice = await this.ctrl(p).decideBuy({ player: p, tile: t, canAfford, state: s });
      if (choice === 'buy' && canAfford) {
        await this.pay(p, 'bank', t.price, 'קנייה', { quiet: true });
        ts.owner = p.id;
        await this.P.purchased(p, t.index, { price: t.price });
      } else {
        await this.auction(t.index);
      }
      return;
    }
    if (ts.owner === p.id) { await this.P.homeTurf(p, t.index); return; }
    const owner = s.players[ts.owner];
    if (ts.mortgaged) { await this.P.toast(`${t.name} ממושכן, אז אין שכירות.`); return; }
    const diceTotal = dice ? dice[0] + dice[1] : 7;
    const rent = rentFor(s, t.index, diceTotal);
    if (rent.amount <= 0) return;
    const tk = canTakeover(s, p.id, t.index);
    const ctx = {
      player: p, owner, tile: t, rent, state: s,
      duel: s.settings.duels,
      duelLoss: rent.amount * CONFIG.duelLossMultiplier,
      takeover: tk.ok ? tk.price : null,
      takeoverReason: tk.ok ? null : (tk.reason || null),
      takeoverPrice: tk.price,
    };
    const choice = await this.ctrl(p).decideRent(ctx);
    if (choice === 'takeover' && tk.ok) {
      const ok = await this.pay(p, owner, tk.price, 'השתלטות עוינת', { quiet: true });
      if (ok) {
        ts.owner = p.id;
        p.stats.takeovers++;
        await this.P.takeover(p, owner, t.index, tk.price);
      }
      return;
    }
    if (choice === 'duel' && s.settings.duels) {
      const w = await this.duel(p, owner, { reason: 'rent', tile: t.index, stake: rent.amount });
      if (w === p.id) { await this.P.rentDodged(p, owner, t.index, rent.amount); return; }
      const amt = rent.amount * CONFIG.duelLossMultiplier;
      p.stats.rentPaid += amt; owner.stats.rentEarned += amt;
      await this.pay(p, owner, amt, 'שכירות כפולה!', { big: true });
      return;
    }
    p.stats.rentPaid += rent.amount; owner.stats.rentEarned += rent.amount;
    await this.pay(p, owner, rent.amount, 'שכירות');
  }

  async auction(idx) {
    const s = this.state;
    const bidders = alive(s).filter((o) => o.cash >= 10);
    if (!bidders.length) return;
    const aiValues = {};
    for (const b of bidders) {
      const c = this.ctrl(b);
      if (c.auctionValue) aiValues[b.id] = c.auctionValue({ player: b, idx, state: s });
    }
    const res = await this.P.runAuction({ idx, bidders, aiValues });
    if (res && res.winner != null && res.price > 0) {
      const w = s.players[res.winner];
      const price = Math.min(res.price, w.cash);
      await this.pay(w, 'bank', price, 'מכירה פומבית', { quiet: true });
      s.tiles[idx].owner = w.id;
      await this.P.purchased(w, idx, { auction: true, price });
    } else {
      await this.P.toast('אף אחד לא הציע. המגרש נשאר למכירה.');
    }
  }

  async drawCard(p, deck) {
    const s = this.state;
    const id = s.decks[deck].shift();
    s.decks[deck].push(id);
    const card = CARD_BY_ID[id];
    const ctx = card.prepare ? card.prepare(this, p) : { text: card.text };
    this.syncRng();
    await this.P.showCard(p, deck, card, ctx);
    await card.effect(this, p, ctx);
  }

  async heist(p) {
    const s = this.state;
    const pot = s.vault;
    if (pot <= 0) { await this.P.toast('הכספת ריקה. מישהו הקדים אותך.'); return; }
    const cracked = await this.P.runHeist(p, pot);
    if (cracked <= 0) {
      await this.P.toast('אזעקה! השוטרים חיכו לך.', 'bad');
      await this.sendToJail(p, 'אזעקה בשוד');
      return;
    }
    const share = [0, 0.2, 0.5, 1][cracked];
    const amt = Math.max(5, Math.round((pot * share) / 5) * 5);
    await this.pay('vault', p, amt, cracked === 3 ? 'ג׳קפוט!' : 'שלל מהשוד', { big: cracked === 3 });
    p.stats.heists++;
    p.stats.bestHeist = Math.max(p.stats.bestHeist, amt);
    if (s.vault <= 0) { s.vault = CONFIG.vaultSeed; this.P.syncPlayers(); }
  }

  // ───────────────────────────────────────────── duels & twists
  pickMinigame() {
    const s = this.state;
    const pool = DUEL_MINIGAMES.filter((g) => g !== s.lastMinigame);
    const g = this.rng.pick(pool.length ? pool : DUEL_MINIGAMES);
    this.syncRng();
    return g;
  }

  async duel(a, b, ctx = {}) {
    const s = this.state;
    const game = this.pickMinigame();
    s.lastMinigame = game;
    const winnerId = await this.P.runDuel({ a, b, game, ctx });
    const winner = s.players[winnerId];
    const loser = winnerId === a.id ? b : a;
    winner.stats.duelsWon++;
    loser.stats.duelsLost++;
    if (s.bounty && s.bounty.playerId === loser.id) {
      const amt = s.bounty.amount;
      s.bounty = null;
      winner.stats.bounties++;
      await this.P.bountyClaimed(winner, loser, amt);
      await this.pay('bank', winner, amt, 'הפרס נגבה!', { big: true });
    }
    return winnerId;
  }

  async updateBounty() {
    const s = this.state;
    const st = standings(s).filter((x) => !x.bankrupt);
    if (st.length < 2 || s.round < CONFIG.bountyMinRound) return;
    const [a, b] = st;
    if (a.worth >= b.worth * CONFIG.bountyLeadRatio) {
      if (s.bounty?.playerId === a.id) {
        s.bounty.amount = Math.min(CONFIG.bountyMax, s.bounty.amount + CONFIG.bountyGrowth);
        s.bounty.rounds++;
        await this.P.bountyUpdate(s.bounty, false);
      } else {
        s.bounty = { playerId: a.id, amount: CONFIG.bountyStart, rounds: 1 };
        await this.P.bountyUpdate(s.bounty, true);
      }
    } else if (s.bounty) {
      s.bounty = null;
      await this.P.bountyUpdate(null, false);
    }
  }

  async setHype(district, mult) {
    this.state.hype[district] = { mult, rounds: CONFIG.hypeRounds };
    await this.P.hype(district, mult);
  }

  async setTimePhase(n) {
    this.state.timePhase = n;
    await this.P.timeChanged(n, 'card');
  }

  async chooseTarget(p, candidates, kind, prompt) {
    const id = await this.ctrl(p).chooseTarget({ player: p, candidates, kind, prompt, state: this.state });
    return this.state.players[id] || candidates[0];
  }
}

export { buildCost };
