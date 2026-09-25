// Turn live game objects into wire-safe JSON and back. Players, tiles, cards
// and the state itself travel as references and are re-bound to the receiving
// client's mirrored state, so presenter code works unchanged on every machine.
import { TILES } from "../game/board.js";
import { CARD_BY_ID } from "../game/cards.js";

export function ser(v, state, depth = 0) {
  if (v == null || typeof v !== 'object') return typeof v === 'function' ? undefined : v;
  if (depth > 12) return undefined;
  if (v === state) return { $s: 1 };
  if (Array.isArray(v)) return v.map((x) => ser(x, state, depth + 1));
  if (state && 'cash' in v && 'charId' in v && state.players[v.id] === v) return { $p: v.id };
  if (typeof v.index === 'number' && v.type && TILES[v.index] === v) return { $t: v.index };
  if (typeof v.id === 'string' && CARD_BY_ID[v.id] === v) return { $c: v.id };
  if (typeof v.then === 'function') return undefined;
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    const s = ser(x, state, depth + 1);
    if (s !== undefined) out[k] = s;
  }
  return out;
}

export function des(v, state) {
  if (v == null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => des(x, state));
  if (v.$s) return state;
  if ('$p' in v) return state.players[v.$p];
  if ('$t' in v) return TILES[v.$t];
  if ('$c' in v) return CARD_BY_ID[v.$c];
  const out = {};
  for (const [k, x] of Object.entries(v)) out[k] = des(x, state);
  return out;
}

/** Copy a state snapshot into the mirrored state, keeping object identity. */
export function applySnapshot(mirror, snap) {
  for (const [k, v] of Object.entries(snap)) {
    if (k === 'players') {
      v.forEach((sp, i) => {
        if (mirror.players[i]) Object.assign(mirror.players[i], sp);
        else mirror.players[i] = sp;
      });
    } else if (k === 'tiles') {
      for (const [i, t] of Object.entries(v)) {
        if (mirror.tiles[i]) Object.assign(mirror.tiles[i], t);
        else mirror.tiles[i] = t;
      }
    } else mirror[k] = v;
  }
  return mirror;
}

export const clone = (o) => JSON.parse(JSON.stringify(o));
