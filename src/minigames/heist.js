// THE HEIST — solo safe-cracking. Three dials, each faster with a smaller
// window. Stop the needle in the green zone. 3/3 = jackpot, 0/3 = busted.
//
// mode 'play'     — this screen cracks the vault (human or CPU) and emits events
// mode 'spectate' — mirror someone else's attempt from those events
import { every, wait, lerp } from "../core/tween.js";
import { input, DUEL_KEYS } from "../core/input.js";
import { $, money } from "../ui/ui.js";
import { rand } from "../core/rng.js";

const DIALS = [
  { zone: 74, speed: 210 },
  { zone: 52, speed: 270 },
  { zone: 36, speed: 340 },
];

function arcPath(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.cos((a - 90) * Math.PI / 180), cy + r * Math.sin((a - 90) * Math.PI / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

/** A tiny queue so spectators can await events in order. */
export class EventFeed {
  constructor() { this.q = []; this.waiter = null; }
  push(ev) { this.q.push(ev); if (this.waiter) { const w = this.waiter; this.waiter = null; w(); } }
  async next(timeout = 40) {
    if (this.q.length) return this.q.shift();
    let timer;
    await Promise.race([
      new Promise((r) => { this.waiter = r; }),
      new Promise((r) => { timer = setTimeout(r, timeout * 1000); }),
    ]);
    clearTimeout(timer);
    return this.q.shift() || null;
  }
}

export async function runHeist({ ui, audio, player, pot, skill = null, onDial, mode = 'play', emit = () => {}, feed = null, local = true }) {
  const spectate = mode === 'spectate';
  const host = $(`<div class="heist">
    <div class="loot">פרוץ את הכספת · ${money(pot)}</div>
    <div class="dials">${DIALS.map((d, i) => `
      <div class="dial" data-i="${i}">
        <svg viewBox="0 0 170 170">
          <circle cx="85" cy="85" r="70" fill="#2b2f45" stroke="#12131f" stroke-width="4"/>
          ${Array.from({ length: 24 }, (_, k) => { const a = (k / 24) * Math.PI * 2; return `<line x1="${85 + Math.cos(a) * 62}" y1="${85 + Math.sin(a) * 62}" x2="${85 + Math.cos(a) * 68}" y2="${85 + Math.sin(a) * 68}" stroke="#8a93b0" stroke-width="2"/>`; }).join('')}
          <path class="zone" d="" stroke="#2fe08f" stroke-width="12" fill="none" stroke-linecap="round" opacity="0.95"/>
          <g class="needle"><line x1="85" y1="85" x2="85" y2="24" stroke="#ffd166" stroke-width="5" stroke-linecap="round"/><circle cx="85" cy="85" r="10" fill="#ffd166"/></g>
        </svg>
        <div class="state">${i === 0 ? 'מוכן' : 'נעול'}</div>
      </div>`).join('')}</div>
    <div class="glass" style="padding:10px 16px;border-radius:16px;font:800 14px var(--font)">
      ${!spectate && skill == null && local ? `לחצו <span class="kbd">רווח</span> כשהמחוג נמצא על ה<span style="color:#1fcf86">ירוק</span>` : `${player.name} מסובב את החוגות…`}
    </div></div>`);
  const ov = ui.overlay(host, { clear: true });
  audio.play('drumroll', { count: 20 });
  await wait(0.9, true);
  let cracked = 0;
  for (let i = 0; i < DIALS.length; i++) {
    const d = DIALS[i];
    const el = host.querySelector(`.dial[data-i="${i}"]`);
    let center, ang;
    if (spectate) {
      let ev = await feed.next();
      while (ev && ev.e !== 'dial' && ev.e !== 'end') ev = await feed.next();
      if (!ev || ev.e === 'end') { cracked = ev?.cracked ?? cracked; break; }
      center = ev.center; ang = ev.ang;
    } else {
      center = rand(40, 320);
      ang = rand(0, 360);
      emit({ e: 'dial', i, center, ang });
    }
    el.classList.add('active');
    el.querySelector('.state').textContent = 'פורץ…';
    const a0 = center - d.zone / 2, a1 = center + d.zone / 2;
    el.querySelector('.zone').setAttribute('d', arcPath(85, 85, 70, a0, a1));
    const needle = el.querySelector('.needle');
    let t = 0;
    let result = null;
    const willHit = skill != null && Math.random() < lerp(0.35, 0.88, skill) - i * 0.08;
    const aiTarget = willHit ? rand(a0 + 4, a1 - 4) : center + (Math.random() < 0.5 ? -1 : 1) * rand(d.zone / 2 + 15, d.zone / 2 + 60);
    const minTime = skill != null ? rand(0.8, 1.8) : 0;
    let lastTick = 0;
    let specResult = null;
    if (spectate) feed.next(12).then((ev) => { specResult = ev && ev.e === 'res' ? ev : { ok: false, ang }; });
    await every((dt) => {
      t += dt;
      ang = (ang + d.speed * dt) % 360;
      if (Math.floor(ang / 30) !== lastTick) { lastTick = Math.floor(ang / 30); audio.play('tick', { vol: 0.35, pitch: 1.4 }); }
      if (spectate) {
        if (specResult) { result = !!specResult.ok; if (typeof specResult.ang === 'number') ang = specResult.ang; }
      } else {
        let press = skill == null && local && input.anyPressed(DUEL_KEYS.solo.action);
        if (skill != null && t > minTime) {
          const diff = ((ang - ((aiTarget % 360) + 360) % 360) + 540) % 360 - 180;
          if (Math.abs(diff) < d.speed * dt) press = true;
        }
        if (press) result = (((ang - a0) % 360) + 360) % 360 <= d.zone;
        else if (t > 7) result = false;
      }
      needle.setAttribute('transform', `rotate(${ang} 85 85)`);
      return result != null;
    }, true);
    if (!spectate) emit({ e: 'res', i, ok: result, ang });
    el.classList.remove('active');
    el.classList.add(result ? 'ok' : 'fail');
    el.querySelector('.state').textContent = result ? 'קליק! ✓' : 'נתקע ✗';
    audio.play(result ? 'unlock' : 'error');
    if (result) cracked++;
    onDial?.(i, result);
    await wait(0.55, true);
  }
  if (!spectate) emit({ e: 'end', cracked });
  host.querySelector('.loot').textContent = cracked === 3 ? 'ג׳קפוט!' : cracked === 0 ? 'אזעקה!!!' : `${cracked}/3: שלל חלקי`;
  await wait(1.1, true);
  await ov.close();
  return cracked;
}
