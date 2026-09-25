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
    id: 'trending', icon: '🔥', title: 'ויראלי!',
    prepare: (e) => {
      const owned = districtIds.filter((d) => TILES.some((t) => t.district === d && e.state.tiles[t.index].owner !== null));
      const d = e.rng.pick(owned.length ? owned : districtIds);
      return { district: d, text: `${DISTRICTS[d].name} בטרנד! השכירות שם כפולה ב-${CONFIG.hypeRounds} הסיבובים הקרובים.` };
    },
    effect: async (e, p, ctx) => e.setHype(ctx.district, 2),
  },
  {
    id: 'scandal', icon: '📉', title: 'שערורייה!',
    prepare: (e) => {
      const d = e.rng.pick(districtIds);
      return { district: d, text: `שערורייה מטלטלת את ${DISTRICTS[d].name}. השכירות שם יורדת בחצי ב-${CONFIG.hypeRounds} הסיבובים הקרובים.` };
    },
    effect: async (e, p, ctx) => e.setHype(ctx.district, 0.5),
  },
  {
    id: 'flashmob', icon: '🕺', title: 'פלאש מוב!',
    text: 'כולם עוזבים הכול ורוקדים אליך. אף אחד לא יודע למה.',
    effect: async (e, p) => {
      const movers = alive(e.state).filter((o) => o.id !== p.id && !o.inJail);
      await e.P.flashMob(p, movers);
      movers.forEach((o) => { o.pos = p.pos; });
    },
  },
  {
    id: 'earthquake', icon: '🌋', title: 'רעידת אדמה!',
    text: 'האדמה רועדת! הבניין הכי גבוה של כל שחקן מאבד קומה.',
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
    id: 'robinhood', icon: '🏹', title: 'רובין הוד מכה שוב',
    text: 'העשיר ביותר מעביר ₪150 לעני ביותר. אצילי? מאוד. מרצון? ממש לא.',
    effect: async (e) => {
      const list = alive(e.state).slice().sort((a, b) => b.cash - a.cash);
      if (list.length < 2 || list[0] === list[list.length - 1]) return;
      await e.pay(list[0], list[list.length - 1], 150, 'רובין הוד');
    },
  },
  {
    id: 'stimulus', icon: '💸', title: 'מענק ממשלתי',
    text: 'הבנק מרגיש נדיב. כל אחד מקבל ₪100!',
    effect: async (e) => {
      for (const o of alive(e.state)) await e.pay('bank', o, 100, 'מענק', { quick: true });
    },
  },
  {
    id: 'crash', icon: '📊', title: 'קריסת שוק!',
    text: 'מכירות בהלה! כל שחקן מאבד 10% מהכסף שלו, והכול נופל לכספת.',
    effect: async (e) => {
      for (const o of alive(e.state)) {
        const amt = Math.round((o.cash * 0.1) / 5) * 5;
        if (amt > 0) await e.pay(o, 'vault', amt, 'קריסת שוק', { quick: true });
      }
    },
  },
  {
    id: 'blackout', icon: '🌑', title: 'הפסקת חשמל בכל העיר',
    text: 'מישהו מעד על הכבל ופתאום לילה! עסקי הלילה גובים עכשיו מחיר של שעות השיא.',
    effect: async (e) => e.setTimePhase(3),
  },
  {
    id: 'sunrise', icon: '🌅', title: 'זריחה בהפתעה',
    text: 'מדען מטורף הריץ את השמש קדימה. בוקר! עסקי היום גובים עכשיו מחיר של שעות השיא.',
    effect: async (e) => e.setTimePhase(0),
  },
  {
    id: 'showdown', icon: '⚔️', title: 'עימות ברחוב',
    prepare: (e, p) => {
      const rivals = alive(e.state).filter((o) => o.id !== p.id);
      const r = rivals.length ? e.rng.pick(rivals) : null;
      return { rival: r?.id, text: r ? `נתקלת ב${r.name} באמצע הרחוב. סוגרים את זה בדו-קרב: המפסיד משלם למנצח ₪150.` : 'אין עם מי לריב. מביך.' };
    },
    effect: async (e, p, ctx) => {
      if (ctx.rival == null) return;
      const r = e.state.players[ctx.rival];
      const winner = await e.duel(p, r, { reason: 'showdown', stake: 150 });
      const loser = winner === p.id ? r : p;
      await e.pay(loser, e.state.players[winner], 150, 'עימות');
    },
  },
  {
    id: 'celebrity', icon: '📸', title: 'סלב נראה בעיר',
    text: 'פפראצי בכל מקום! מי שיש לו הכי הרבה נכסים גובה ₪25 מכל שחקן אחר.',
    effect: async (e) => {
      const list = alive(e.state).slice().sort((a, b) => ownedBy(e.state, b.id).length - ownedBy(e.state, a.id).length);
      const star = list[0];
      if (!star || ownedBy(e.state, star.id).length === 0) return;
      for (const o of list) if (o !== star) await e.pay(o, star, 25, 'חתימות', { quick: true });
    },
  },
];

// ─────────────────────────────────────────── FORTUNE (personal luck)
export const FORTUNE_CARDS = [
  {
    id: 'payday', icon: '💰', title: 'ישר ליום המשכורת',
    text: 'רוץ ישר ליום המשכורת ותאסוף את המשכורת.',
    effect: async (e, p) => e.moveTo(p, 0, { resolve: true }),
  },
  {
    id: 'hotstreak', icon: '🎰', title: 'יום של מזל',
    text: 'מצאת כרטיס גירוד זוכה בתוך הגרב. קבל ₪150.',
    effect: async (e, p) => e.pay('bank', p, 150, 'יום של מזל'),
  },
  {
    id: 'viral', icon: '📱', title: 'הסרטון שלך התפוצץ',
    text: 'כל שחקן נותן לך טיפ של ₪50 על התוכן.',
    effect: async (e, p) => {
      for (const o of alive(e.state)) if (o !== p) await e.pay(o, p, 50, 'טיפים', { quick: true });
    },
  },
  {
    id: 'ticket', icon: '🚨', title: 'דוח מהירות',
    text: 'נסעת 90 קמ״ש בתוך השכונה. שלם ₪75 לכספת.',
    effect: async (e, p) => e.pay(p, 'vault', 75, 'דוח מהירות'),
  },
  {
    id: 'lawyer', icon: '⚖️', title: 'עורך דין בחיוג מהיר',
    text: 'שמור את הקלף. בפעם הבאה שתיכנס לכלא, הוא יוציא אותך בחינם.',
    effect: async (e, p) => { p.cards.jailFree += 1; e.P.syncPlayers(); },
  },
  {
    id: 'busted', icon: '🚓', title: 'נתפסת!',
    text: 'נתפסת חוצה באדום. עם סטייל, אבל עדיין באדום. ישר לכלא.',
    effect: async (e, p) => e.sendToJail(p, 'חצייה באדום'),
  },
  {
    id: 'back3', icon: '↩️', title: 'פנייה לא נכונה',
    text: 'הלכת בדרך הנופית. חזור 3 משבצות אחורה.',
    effect: async (e, p) => e.moveBy(p, -3, { resolve: true }),
  },
  {
    id: 'transit', icon: '🎈', title: 'תפוס טרמפ',
    text: 'התקדם לתחנה הקרובה. אם יש לה בעלים, משלמים על הנסיעה.',
    effect: async (e, p) => {
      const next = TRANSIT_INDICES.find((i) => i > p.pos) ?? TRANSIT_INDICES[0];
      await e.moveTo(p, next, { resolve: true });
    },
  },
  {
    id: 'swap', icon: '🔄', title: 'החלפת מקומות',
    text: 'בחר שחקן ותחליפו מקומות.',
    effect: async (e, p) => {
      const others = alive(e.state).filter((o) => o !== p && !o.inJail);
      if (!others.length) return;
      const target = await e.chooseTarget(p, others, 'swap', 'להתחלף עם…');
      if (!target) return;
      await e.P.swap(p, target);
      const tmp = p.pos; p.pos = target.pos; target.pos = tmp;
    },
  },
  {
    id: 'renovation', icon: '🔨', title: 'שיפוץ חינם',
    text: 'קבלן חייב לך טובה: שדרוג אחד בחינם (ואם אין מה לשדרג, ₪100).',
    effect: async (e, p) => {
      const opts = ownedBy(e.state, p.id).filter((i) => {
        const c = canBuild({ ...e.state, players: e.state.players.map((o) => (o.id === p.id ? { ...o, cash: 1e9 } : o)) }, p.id, i);
        return c.ok;
      });
      if (!opts.length) return e.pay('bank', p, 100, 'שובר שיפוץ');
      opts.sort((a, b) => TILES[b].rent[e.state.tiles[b].level + 1] - TILES[a].rent[e.state.tiles[a].level + 1]);
      const idx = opts[0];
      e.state.tiles[idx].level += 1;
      await e.P.build(idx, p, { free: true });
    },
  },
  {
    id: 'heisttip', icon: '🗝️', title: 'מידע פנימי',
    text: 'בנקאי לחוץ הדליף לך את לוח הזמנים של הכספת. רוץ לשוד!',
    effect: async (e, p) => e.moveTo(p, HEIST_INDEX, { resolve: true }),
  },
  {
    id: 'grudge', icon: '🥊', title: 'סגירת חשבונות',
    prepare: (e, p) => {
      const rivals = alive(e.state).filter((o) => o.id !== p.id).sort((a, b) => netWorth(e.state, b.id) - netWorth(e.state, a.id));
      const r = rivals[0];
      return { rival: r?.id, text: r ? `הזמן את ${r.name}, היריב העשיר ביותר, לדו-קרב. ניצחת? הוא משלם לך ₪200. הפסדת? אתה משלם לו.` : 'לא נשארו יריבים.' };
    },
    effect: async (e, p, ctx) => {
      if (ctx.rival == null) return;
      const r = e.state.players[ctx.rival];
      const winner = await e.duel(p, r, { reason: 'grudge', stake: 200 });
      if (winner === p.id) await e.pay(r, p, 200, 'סגירת חשבונות');
      else await e.pay(p, r, 200, 'סגירת חשבונות');
    },
  },
  {
    id: 'pickpocket', icon: '🧤', title: 'ידיים דביקות',
    text: 'בחר שחקן וגנוב לו ₪75 מהכיס.',
    effect: async (e, p) => {
      const others = alive(e.state).filter((o) => o !== p);
      if (!others.length) return;
      const target = await e.chooseTarget(p, others, 'steal', 'לגנוב ₪75 מ…');
      if (target) await e.pay(target, p, 75, 'כייסות');
    },
  },
  {
    id: 'repairs', icon: '🧰', title: 'אסון אינסטלציה',
    text: 'שלם ₪25 לכספת על כל קומה שיש לך.',
    effect: async (e, p) => {
      const amt = totalLevels(e.state, p.id) * 25;
      if (amt > 0) await e.pay(p, 'vault', amt, 'תיקונים');
      else await e.P.toast(`${p.name}: אין מה לתקן. איזה מזל!`);
    },
  },
];

export const CARD_BY_ID = Object.fromEntries([...NEWS_CARDS, ...FORTUNE_CARDS].map((c) => [c.id, c]));
