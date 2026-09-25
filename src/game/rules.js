// Pure rule functions over the game state. No side effects, no rendering.
import { CONFIG, TIME_PHASES } from "./config.js";
import { TILES, DISTRICTS, districtTiles, TRANSIT_INDICES, UTILITY_INDICES, OWNABLE_INDICES } from "./board.js";

export const alive = (s) => s.players.filter((p) => !p.bankrupt);
export const player = (s, id) => s.players[id];
export const tileState = (s, idx) => s.tiles[idx];
export const ownerOf = (s, idx) => (s.tiles[idx] ? s.tiles[idx].owner : null);
export const ownedBy = (s, pid) => OWNABLE_INDICES.filter((i) => s.tiles[i].owner === pid);

export function ownsDistrict(s, pid, district) {
  return districtTiles(district).every((i) => s.tiles[i].owner === pid);
}
export function districtOwnedCount(s, pid, district) {
  return districtTiles(district).filter((i) => s.tiles[i].owner === pid).length;
}

export function isPrimeTime(s, district) {
  const phase = TIME_PHASES[s.timePhase].id;
  const shift = DISTRICTS[district].shift;
  if (shift === 'day') return phase === 'morning' || phase === 'noon' ? 'prime' : 'off';
  return phase === 'dusk' || phase === 'night' ? 'prime' : 'off';
}

const round5 = (v) => Math.max(0, Math.round(v / 5) * 5);
// Rent: exact dollars when small, tidy $5 steps when large, never rounded to zero.
const roundRent = (v) => (v <= 0 ? 0 : v < 25 ? Math.max(1, Math.round(v)) : round5(v));

/** Rent owed when landing on idx. Returns { amount, breakdown: [{label, value}] } */
export function rentFor(s, idx, diceTotal = 7) {
  const t = TILES[idx];
  const ts = s.tiles[idx];
  if (!ts || ts.owner === null || ts.mortgaged) return { amount: 0, breakdown: [] };
  const owner = ts.owner;
  const breakdown = [];
  let amount = 0;
  if (t.type === 'property') {
    amount = t.rent[ts.level];
    breakdown.push({ label: `Base (${['Kiosk', 'Shop', 'Store', 'Flagship', 'Tower', 'Landmark'][ts.level]})`, value: `$${amount}` });
    if (ownsDistrict(s, owner, t.district)) {
      amount *= CONFIG.setRentMultiplier;
      breakdown.push({ label: 'Full district', value: `×${CONFIG.setRentMultiplier}` });
    }
    const pt = isPrimeTime(s, t.district);
    const tm = pt === 'prime' ? CONFIG.primeTimeMultiplier : CONFIG.offHoursMultiplier;
    amount *= tm;
    breakdown.push({ label: pt === 'prime' ? 'Prime time' : 'Off hours', value: `×${tm}`, good: pt === 'prime' });
    const hype = s.hype[t.district];
    if (hype) {
      amount *= hype.mult;
      breakdown.push({ label: hype.mult > 1 ? 'Trending!' : 'Scandal', value: `×${hype.mult}`, good: hype.mult > 1 });
    }
  } else if (t.type === 'transit') {
    const n = TRANSIT_INDICES.filter((i) => s.tiles[i].owner === owner).length;
    amount = 25 * Math.pow(2, n - 1);
    breakdown.push({ label: `${n} transit line${n > 1 ? 's' : ''}`, value: `$${amount}` });
  } else if (t.type === 'utility') {
    const n = UTILITY_INDICES.filter((i) => s.tiles[i].owner === owner).length;
    const mult = n === 2 ? 10 : 4;
    amount = diceTotal * mult;
    breakdown.push({ label: `Dice ${diceTotal} × ${mult}`, value: `$${amount}` });
  }
  return { amount: roundRent(amount), breakdown };
}

export function buildCost(idx) {
  const t = TILES[idx];
  return t.type === 'property' ? DISTRICTS[t.district].buildCost : 0;
}

export function canBuild(s, pid, idx) {
  const t = TILES[idx];
  const ts = s.tiles[idx];
  if (!ts || t.type !== 'property') return { ok: false, reason: 'Cannot build here' };
  if (ts.owner !== pid) return { ok: false, reason: 'Not yours' };
  if (s.settings?.noBuildFirstRound && s.round <= 1) return { ok: false, reason: 'No building in round 1' };
  if (ts.mortgaged) return { ok: false, reason: 'Mortgaged' };
  if (ts.level >= CONFIG.maxLevel) return { ok: false, reason: 'Maxed out' };
  if (ts.level >= CONFIG.levelsWithoutSet && !ownsDistrict(s, pid, t.district))
    return { ok: false, reason: 'Needs full district' };
  const cost = buildCost(idx);
  if (s.players[pid].cash < cost) return { ok: false, reason: 'Not enough cash', cost };
  return { ok: true, cost };
}

export function canSell(s, pid, idx) {
  const ts = s.tiles[idx];
  if (!ts || ts.owner !== pid) return { ok: false };
  if (ts.level <= 0) return { ok: false, reason: 'Nothing to sell' };
  return { ok: true, refund: Math.floor(buildCost(idx) * CONFIG.sellRatio) };
}

export function canMortgage(s, pid, idx) {
  const ts = s.tiles[idx];
  if (!ts || ts.owner !== pid) return { ok: false };
  if (ts.mortgaged) return { ok: false, reason: 'Already mortgaged' };
  if (ts.level > 0) return { ok: false, reason: 'Sell buildings first' };
  return { ok: true, value: Math.floor(TILES[idx].price * CONFIG.mortgageRatio) };
}

export function canUnmortgage(s, pid, idx) {
  const ts = s.tiles[idx];
  if (!ts || ts.owner !== pid || !ts.mortgaged) return { ok: false };
  const cost = Math.ceil(TILES[idx].price * CONFIG.unmortgageRatio);
  if (s.players[pid].cash < cost) return { ok: false, reason: 'Not enough cash', cost };
  return { ok: true, cost };
}

/** Hostile takeover: force-buy a rival's lot at a premium. */
export function takeoverPrice(s, idx) {
  const ts = s.tiles[idx];
  const t = TILES[idx];
  return round5((t.price + ts.level * buildCost(idx)) * CONFIG.takeoverMultiplier);
}
export function canTakeover(s, pid, idx) {
  const t = TILES[idx];
  const ts = s.tiles[idx];
  if (!ts || ts.owner === null || ts.owner === pid) return { ok: false };
  if (ts.mortgaged) return { ok: false, reason: 'Mortgaged' };
  if (t.type === 'property' && ownsDistrict(s, ts.owner, t.district)) return { ok: false, reason: 'District is protected' };
  const price = takeoverPrice(s, idx);
  if (s.players[pid].cash < price) return { ok: false, reason: 'Not enough cash', price };
  return { ok: true, price };
}

export function assetValue(s, idx) {
  const ts = s.tiles[idx];
  const t = TILES[idx];
  const base = ts.mortgaged ? t.price * (1 - CONFIG.mortgageRatio) : t.price;
  return base + ts.level * buildCost(idx);
}

export function netWorth(s, pid) {
  const p = s.players[pid];
  if (p.bankrupt) return 0;
  return p.cash + ownedBy(s, pid).reduce((sum, i) => sum + assetValue(s, i), 0);
}

/** Max cash a player could raise by selling all buildings + mortgaging everything. */
export function liquidity(s, pid) {
  let total = s.players[pid].cash;
  for (const i of ownedBy(s, pid)) {
    const ts = s.tiles[i];
    total += ts.level * Math.floor(buildCost(i) * CONFIG.sellRatio);
    if (!ts.mortgaged) total += Math.floor(TILES[i].price * CONFIG.mortgageRatio);
  }
  return total;
}

export function standings(s) {
  return s.players
    .map((p) => ({ id: p.id, worth: netWorth(s, p.id), bankrupt: p.bankrupt }))
    .sort((a, b) => (a.bankrupt - b.bankrupt) || b.worth - a.worth);
}

export function totalLevels(s, pid) {
  return ownedBy(s, pid).reduce((n, i) => n + s.tiles[i].level, 0);
}
