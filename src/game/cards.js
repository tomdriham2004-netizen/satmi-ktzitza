// Card decks. Each card: { id, title, text, icon, prepare?(engine, p) -> ctx, effect(engine, p, ctx) }
// `prepare` runs before the card is shown (to pick a district/target so the
// text can mention it); `effect` runs after the reveal and may await animations.
import { DISTRICTS, TILES, TRANSIT_INDICES, HEIST_INDEX } from "./board.js";
import { CONFIG } from "./config.js";
import { alive, ownedBy, canBuild, totalLevels, netWorth } from "./rules.js";

const districtIds = Object.keys(DISTRICTS);

// ─────────────────────────────────────────── BREAKING NEWS (global chaos)
export const NEWS_CARDS = [
  {
    id: 'trending', icon: '🔥', title: 'Gone Viral!',
    prepare: (e) => {
      const owned = districtIds.filter((d) => TILES.some((t) => t.district === d && e.state.tiles[t.index].owner !== null));
      const d = e.rng.pick(owned.length ? owned : districtIds);
      return { district: d, text: `${DISTRICTS[d].name} is trending! Rent there is DOUBLED for ${CONFIG.hypeRounds} rounds.` };
    },
    effect: async (e, p, ctx) => e.setHype(ctx.district, 2),
  },
  {
    id: 'scandal', icon: '📉', title: 'Scandal!',
    prepare: (e) => {
      const d = e.rng.pick(districtIds);
      return { district: d, text: `A shocking scandal rocks ${DISTRICTS[d].name}. Rent there is HALVED for ${CONFIG.hypeRounds} rounds.` };
    },
    effect: async (e, p, ctx) => e.setHype(ctx.district, 0.5),
  },
  {
    id: 'flashmob', icon: '🕺', title: 'Flash Mob!',
    text: 'Everyone drops what they\'re doing and dances over to your tile. Nobody knows why.',
    effect: async (e, p) => {
      const movers = alive(e.state).filter((o) => o.id !== p.id && !o.inJail);
      await e.P.flashMob(p, movers);
      movers.forEach((o) => { o.pos = p.pos; });
    },
  },
  {
    id: 'earthquake', icon: '🌋', title: 'Earthquake!',
    text: 'The ground shakes! Every player\'s tallest building loses a level.',
    effect: async (e) => {
      const hits = [];
      for (const o of alive(e.state)) {
        const mine = ownedBy(e.state, o.id).filter((i) => e.state.tiles[i].level > 0);
        if (!mine.length) continue;
        mine.sort((a, b) => e.state.tiles[b].level - e.state.tiles[a].level || TILES[b].price - TILES[a].price);
        hits.push(mine[0]);
      }
      await e.P.earthquake(hits);
      hits.forEach((i) => { e.state.tiles[i].level -= 1; });
      await e.P.refreshTiles(hits);
    },
  },
  {
    id: 'robinhood', icon: '🏹', title: 'Robin Hood Strikes',
    text: 'The richest player hands $150 to the poorest. Very noble. Very forced.',
    effect: async (e) => {
      const list = alive(e.state).slice().sort((a, b) => b.cash - a.cash);
      if (list.length < 2 || list[0] === list[list.length - 1]) return;
      await e.pay(list[0], list[list.length - 1], 150, 'Robin Hood');
    },
  },
  {
    id: 'stimulus', icon: '💸', title: 'Stimulus Check',
    text: 'The bank is feeling generous. Everyone collects $100!',
    effect: async (e) => {
      for (const o of alive(e.state)) await e.pay('bank', o, 100, 'Stimulus', { quick: true });
    },
  },
  {
    id: 'crash', icon: '📊', title: 'Market Crash!',
    text: 'Panic selling! Every player drops 10% of their cash into the Vault.',
    effect: async (e) => {
      for (const o of alive(e.state)) {
        const amt = Math.round((o.cash * 0.1) / 5) * 5;
        if (amt > 0) await e.pay(o, 'vault', amt, 'Market crash', { quick: true });
      }
    },
  },
  {
    id: 'blackout', icon: '🌑', title: 'City-Wide Blackout',
    text: 'Somebody tripped over the power cord. It\'s suddenly NIGHT — night spots charge prime rent.',
    effect: async (e) => e.setTimePhase(3),
  },
  {
    id: 'sunrise', icon: '🌅', title: 'Surprise Sunrise',
    text: 'A rogue scientist fast-forwards the sun. It\'s MORNING — day businesses charge prime rent.',
    effect: async (e) => e.setTimePhase(0),
  },
  {
    id: 'showdown', icon: '⚔️', title: 'Street Showdown',
    prepare: (e, p) => {
      const rivals = alive(e.state).filter((o) => o.id !== p.id);
      const r = rivals.length ? e.rng.pick(rivals) : null;
      return { rival: r?.id, text: r ? `You and ${r.name} bump shoulders. Settle it with a duel — loser pays the winner $150.` : 'Nobody to fight. Awkward.' };
    },
    effect: async (e, p, ctx) => {
      if (ctx.rival == null) return;
      const r = e.state.players[ctx.rival];
      const winner = await e.duel(p, r, { reason: 'showdown', stake: 150 });
      const loser = winner === p.id ? r : p;
      await e.pay(loser, e.state.players[winner], 150, 'Showdown');
    },
  },
  {
    id: 'celebrity', icon: '📸', title: 'Celebrity Sighting',
    text: 'Paparazzi everywhere! The biggest landlord collects $25 from every other player.',
    effect: async (e) => {
      const list = alive(e.state).slice().sort((a, b) => ownedBy(e.state, b.id).length - ownedBy(e.state, a.id).length);
      const star = list[0];
      if (!star || ownedBy(e.state, star.id).length === 0) return;
      for (const o of list) if (o !== star) await e.pay(o, star, 25, 'Autographs', { quick: true });
    },
  },
];

// ─────────────────────────────────────────── FORTUNE (personal luck)
export const FORTUNE_CARDS = [
  {
    id: 'payday', icon: '💰', title: 'Straight to Payday',
    text: 'Advance to PAYDAY and collect your salary.',
    effect: async (e, p) => e.moveTo(p, 0, { resolve: true }),
  },
  {
    id: 'hotstreak', icon: '🎰', title: 'Hot Streak',
    text: 'You found a winning scratch card in your sock. Collect $150.',
    effect: async (e, p) => e.pay('bank', p, 150, 'Hot streak'),
  },
  {
    id: 'viral', icon: '📱', title: 'Your Video Went Viral',
    text: 'Every player tips you $50 for the content.',
    effect: async (e, p) => {
      for (const o of alive(e.state)) if (o !== p) await e.pay(o, p, 50, 'Tips', { quick: true });
    },
  },
  {
    id: 'ticket', icon: '🚨', title: 'Speeding Ticket',
    text: 'Doing 90 in a pawn zone. Pay $75 into the Vault.',
    effect: async (e, p) => e.pay(p, 'vault', 75, 'Speeding ticket'),
  },
  {
    id: 'lawyer', icon: '⚖️', title: 'Lawyer on Speed Dial',
    text: 'Keep this card. Use it to walk out of the Slammer for free.',
    effect: async (e, p) => { p.cards.jailFree += 1; e.P.syncPlayers(); },
  },
  {
    id: 'busted', icon: '🚓', title: 'Busted!',
    text: 'Caught jaywalking with style. Go directly to the Slammer.',
    effect: async (e, p) => e.sendToJail(p, 'Caught jaywalking'),
  },
  {
    id: 'back3', icon: '↩️', title: 'Wrong Turn',
    text: 'You took the scenic route. Move back 3 spaces.',
    effect: async (e, p) => e.moveBy(p, -3, { resolve: true }),
  },
  {
    id: 'transit', icon: '🎈', title: 'Catch a Ride',
    text: 'Advance to the nearest transit line. Pay the fare if it\'s owned.',
    effect: async (e, p) => {
      const next = TRANSIT_INDICES.find((i) => i > p.pos) ?? TRANSIT_INDICES[0];
      await e.moveTo(p, next, { resolve: true });
    },
  },
  {
    id: 'swap', icon: '🔄', title: 'Swap Meet',
    text: 'Swap places with any player of your choice.',
    effect: async (e, p) => {
      const others = alive(e.state).filter((o) => o !== p && !o.inJail);
      if (!others.length) return;
      const target = await e.chooseTarget(p, others, 'swap', 'Swap places with…');
      if (!target) return;
      await e.P.swap(p, target);
      const tmp = p.pos; p.pos = target.pos; target.pos = tmp;
    },
  },
  {
    id: 'renovation', icon: '🔨', title: 'Free Renovation',
    text: 'A contractor owes you a favor. Upgrade one property for free (or take $100).',
    effect: async (e, p) => {
      const opts = ownedBy(e.state, p.id).filter((i) => {
        const c = canBuild({ ...e.state, players: e.state.players.map((o) => (o.id === p.id ? { ...o, cash: 1e9 } : o)) }, p.id, i);
        return c.ok;
      });
      if (!opts.length) return e.pay('bank', p, 100, 'Renovation voucher');
      opts.sort((a, b) => TILES[b].rent[e.state.tiles[b].level + 1] - TILES[a].rent[e.state.tiles[a].level + 1]);
      const idx = opts[0];
      e.state.tiles[idx].level += 1;
      await e.P.build(idx, p, { free: true });
    },
  },
  {
    id: 'heisttip', icon: '🗝️', title: 'Inside Tip',
    text: 'A nervous banker slips you the vault schedule. Advance to THE HEIST.',
    effect: async (e, p) => e.moveTo(p, HEIST_INDEX, { resolve: true }),
  },
  {
    id: 'grudge', icon: '🥊', title: 'Grudge Match',
    prepare: (e, p) => {
      const rivals = alive(e.state).filter((o) => o.id !== p.id).sort((a, b) => netWorth(e.state, b.id) - netWorth(e.state, a.id));
      const r = rivals[0];
      return { rival: r?.id, text: r ? `Challenge ${r.name}, the richest rival! Win and they pay you $200. Lose and you pay them.` : 'No rivals left.' };
    },
    effect: async (e, p, ctx) => {
      if (ctx.rival == null) return;
      const r = e.state.players[ctx.rival];
      const winner = await e.duel(p, r, { reason: 'grudge', stake: 200 });
      if (winner === p.id) await e.pay(r, p, 200, 'Grudge match');
      else await e.pay(p, r, 200, 'Grudge match');
    },
  },
  {
    id: 'pickpocket', icon: '🧤', title: 'Sticky Fingers',
    text: 'Pick a pocket — steal $75 from any player.',
    effect: async (e, p) => {
      const others = alive(e.state).filter((o) => o !== p);
      if (!others.length) return;
      const target = await e.chooseTarget(p, others, 'steal', 'Steal $75 from…');
      if (target) await e.pay(target, p, 75, 'Pickpocketed');
    },
  },
  {
    id: 'repairs', icon: '🧰', title: 'Plumbing Disaster',
    text: 'Pay $25 into the Vault for every building level you own.',
    effect: async (e, p) => {
      const amt = totalLevels(e.state, p.id) * 25;
      if (amt > 0) await e.pay(p, 'vault', amt, 'Repairs');
      else await e.P.toast(`${p.name} owns nothing to repair. Lucky!`);
    },
  },
];

export const CARD_BY_ID = Object.fromEntries([...NEWS_CARDS, ...FORTUNE_CARDS].map((c) => [c.id, c]));
