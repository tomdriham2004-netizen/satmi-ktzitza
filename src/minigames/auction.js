// AUCTION RUSH — everyone holds their key while the price climbs. Let go and
// you're out. Last one holding buys the lot at the current price.
//
// Online: the host runs this with `holdFn` answering "is player p holding?"
// (local keys or a guest's streamed state) and a mirrored `ui`/`audio` that
// replays every call on the guests' screens.
import { every, wait } from "../core/tween.js";
import { input, SEAT_KEYS } from "../core/input.js";
import { TILES } from "../game/board.js";

const round5 = (v) => Math.max(5, Math.round(v / 5) * 5);

export async function runAuction({ ui, audio, idx, bidders, aiValues, holdFn = null, keyLabel = null }) {
  const t = TILES[idx];
  const humans = bidders.filter((b) => !b.isAI);
  const soloHuman = humans.length === 1;
  const keyOf = (p) => (p.isAI ? null : SEAT_KEYS[p.seat].code);
  const localHold = (p) => {
    const k = keyOf(p);
    if (!k) return false;
    return input.isDown(k) || (soloHuman && input.isDown('Space'));
  };
  const holding = holdFn || localHold;
  const label = keyLabel || ((p) => (p.isAI ? null : SEAT_KEYS[p.seat].label + (soloHuman ? ' / רווח' : '')));
  const el = ui.auction.open({ idx, bidders: bidders.map((p) => ({ p, key: label(p) })) });
  // Pointer hold support (touch / mouse) on the bidder cards — local offline play only
  const cleanups = [];
  if (!holdFn && el) {
    el.querySelectorAll('.bidder').forEach((card) => {
      const p = bidders.find((b) => b.id === +card.dataset.pid);
      const k = keyOf(p);
      if (!k) return;
      const down = (e) => { e.preventDefault(); input.pressVirtual(k); };
      const up = () => input.releaseVirtual(k);
      card.addEventListener('pointerdown', down);
      window.addEventListener('pointerup', up);
      cleanups.push(() => { card.removeEventListener('pointerdown', down); window.removeEventListener('pointerup', up); input.releaseVirtual(k); });
    });
  }

  const start = round5(t.price * 0.1);
  let price = start;
  ui.auction.price(price);
  // ── get ready
  let tReady = 0;
  let lastBeep = 3;
  const shown = new Map();
  const setState = (id, st, lbl) => {
    const key = `${st}|${lbl}`;
    if (shown.get(id) === key) return;
    shown.set(id, key);
    ui.auction.set(id, st, lbl);
  };
  await every((dt) => {
    tReady += dt;
    const left = Math.ceil(2.7 - tReady);
    if (left !== lastBeep && left > 0) {
      lastBeep = left;
      audio.play('beep');
      ui.auction.status(`החזיקו את המקש כדי להצטרף… <b>${left}</b>`);
    }
    for (const p of bidders) {
      if (p.isAI) setState(p.id, (aiValues[p.id] ?? 0) >= start ? 'holding' : 'idle', (aiValues[p.id] ?? 0) >= start ? 'מחשב · בפנים' : 'מחשב · מוותר');
      else setState(p.id, holding(p) ? 'holding' : 'idle');
    }
    return tReady >= 2.7;
  }, true);
  ui.auction.status('יאללה!');
  audio.play('go');
  const inSet = new Set(bidders.filter((p) => (p.isAI ? (aiValues[p.id] ?? 0) >= start && p.cash >= start : holding(p))).map((p) => p.id));
  for (const p of bidders) if (!inSet.has(p.id)) ui.auction.set(p.id, 'out', 'passed');
  let winner = null;
  let finalPrice = price;
  if (inSet.size === 0) {
    ui.auction.status('אף אחד לא רוצה את זה!');
    await wait(1.2, true);
  } else if (inSet.size === 1) {
    winner = [...inSet][0];
  } else {
    // ── rising price
    let acc = 0;
    let tick = 0;
    await every((dt) => {
      acc += dt;
      if (acc < 0.15) return false;
      acc = 0;
      tick++;
      const prev = price;
      price += Math.max(5, round5(price * 0.045));
      ui.auction.price(price);
      audio.play('tick', { pitch: 0.8 + Math.min(1.5, price / t.price) * 0.6 });
      const dropped = [];
      for (const id of inSet) {
        const p = bidders.find((b) => b.id === id);
        const out = p.cash < price || (p.isAI ? price > (aiValues[id] ?? 0) : !holding(p));
        if (out) dropped.push(id);
      }
      for (const id of dropped) {
        inSet.delete(id);
        ui.auction.set(id, 'out', `יצא ב-₪${prev}`);
        audio.play('pop', { pitch: 0.7 });
      }
      ui.auction.status(`${inSet.size} עדיין מחזיקים…`);
      if (inSet.size === 1) { winner = [...inSet][0]; finalPrice = price; return true; }
      if (inSet.size === 0) {
        winner = dropped[Math.floor(Math.random() * dropped.length)];
        finalPrice = prev;
        return true;
      }
      return tick > 400;
    }, true);
  }
  if (winner != null) {
    const w = bidders.find((b) => b.id === winner);
    finalPrice = Math.min(finalPrice, w.cash);
    ui.auction.set(winner, 'win', 'זוכה!');
    ui.auction.price(finalPrice);
    ui.auction.status(`נמכר ל<b>${w.name}</b>!`);
    audio.play('hammer', { pitch: 0.6 });
    audio.play('cash', { delay: 0.1 });
    await wait(1.5, true);
  }
  cleanups.forEach((f) => f());
  await ui.auction.close();
  return winner != null ? { winner, price: finalPrice } : null;
}
