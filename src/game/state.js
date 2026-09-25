// Game state factory + (de)serialization. The state object is plain JSON so it
// can be saved to localStorage today and sent over a socket tomorrow.
import { CONFIG } from "./config.js";
import { OWNABLE_INDICES } from "./board.js";
import { rosterById } from "./roster.js";
import { NEWS_CARDS, FORTUNE_CARDS } from "./cards.js";
import { RNG } from "../core/rng.js";

export const SAVE_KEY = 'boomtown.save.v1';

export function createGame({ players, settings = {}, seed }) {
  const rng = new RNG(seed ?? (Math.random() * 2 ** 32) >>> 0);
  const s = {
    v: 1,
    seed: rng.state,
    rng: 0,
    round: 1,
    turn: 0,
    timePhase: 0,
    settings: {
      startingCash: CONFIG.startingCash,
      roundLimit: 0,
      duels: true,
      cpuDuels: 'quick',
      speed: 1,
      noBuildFirstRound: false,   // classic rule: nobody builds until round 2
      map: 'boomtown',
      ...settings,
    },
    players: players.map((p, i) => {
      const ch = rosterById(p.charId);
      return {
        id: i,
        seat: i,
        name: p.name || ch.name,
        charId: ch.id,
        color: ch.color,
        isAI: !!p.isAI,
        aiLevel: p.aiLevel || 'normal',
        cash: settings.startingCash ?? CONFIG.startingCash,
        pos: 0,
        inJail: false,
        jailTurns: 0,
        bankrupt: false,
        cards: { jailFree: 0 },
        stats: { duelsWon: 0, duelsLost: 0, rentPaid: 0, rentEarned: 0, heists: 0, takeovers: 0, bounties: 0, bestHeist: 0 },
      };
    }),
    tiles: Object.fromEntries(OWNABLE_INDICES.map((i) => [i, { owner: null, level: 0, mortgaged: false }])),
    vault: CONFIG.vaultSeed,
    hype: {},
    bounty: null,
    decks: {
      news: rng.shuffle(NEWS_CARDS.map((c) => c.id)),
      fortune: rng.shuffle(FORTUNE_CARDS.map((c) => c.id)),
    },
    lastMinigame: null,
    winner: null,
    over: false,
  };
  s.rng = rng.state;
  return s;
}

export function saveGame(state) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ at: Date.now(), state })); } catch { /* storage unavailable */ }
}
export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.state || data.state.v !== 1 || data.state.over) return null;
    return data;
  } catch { return null; }
}
export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
