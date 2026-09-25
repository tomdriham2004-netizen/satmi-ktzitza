// All DOM UI. Every interactive component returns a Promise so the presenter
// (and through it, the engine's controllers) can simply `await` a decision.
// AI players drive the very same components via `auto` picks, so spectators
// always see what a CPU chose and why.
import { TILES, DISTRICTS, isOwnable, districtTiles } from "../game/board.js";
import { ROSTER, rosterById } from "../game/roster.js";
import { CONFIG, TIME_PHASES, LEVEL_NAMES } from "../game/config.js";
import * as R from "../game/rules.js";
import { SEAT_KEYS } from "../core/input.js";
import { MAP_LIST } from "../game/maps.js";
import { wait } from "../core/tween.js";
import { audio } from "../audio/audio.js";
import { IS_TOUCH, bigHoldButton } from "./touch.js";

export const $ = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
export const money = (n) => `₪${Math.round(n).toLocaleString('en-US')}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function bindSounds(root) {
  root.querySelectorAll('button').forEach((b) => {
    b.addEventListener('pointerenter', () => audio.play('hover'));
    b.addEventListener('click', () => audio.play('click'));
  });
}

export class UI {
  constructor(root) {
    this.root = root;
    this.portraits = {};
    this.state = null;
    this.displayCash = new Map();
    this.layer = (id, cls = '') => {
      let el = document.getElementById(id);
      if (!el) { el = $(`<div id="${id}" class="${cls}"></div>`); root.appendChild(el); }
      return el;
    };
    this.duelHud = new DuelHud(this);
    this.auction = new AuctionUI(this);
  }

  portrait(charId) { return this.portraits[charId] || ''; }
  pimg(p) { return this.portrait(p.charId); }

  // ─────────────────────────────────────────── HUD
  buildHUD(state, { me = null } = {}) {
    this.state = state;
    this.me = me;
    this.clearHUD();
    const players = this.layer('players');
    players.innerHTML = '';
    for (const p of state.players) {
      const ch = rosterById(p.charId);
      const card = $(`
        <div class="pcard glass" data-pid="${p.id}" style="--pc:${ch.color}">
          <div class="avatar"><img src="${this.pimg(p)}" alt=""></div>
          <div class="who">
            <div class="name">${esc(p.name)} ${p.isAI ? '<span class="tag">מחשב</span>' : ''}${me === p.id ? '<span class="tag you">אתה</span>' : ''}</div>
            <div class="cash money">${money(p.cash)}</div>
            <div class="deeds"></div>
          </div>
          <div class="side"><div class="badges"></div>${p.isAI || state.online ? '' : `<span class="kbd" title="המקש שלך במכירה פומבית">${SEAT_KEYS[p.seat].label}</span>`}<span class="net-dot" title="חיבור"></span></div>
          <div class="stamp">פשט רגל</div>
        </div>`);
      card.addEventListener('click', () => this.onPlayerClick?.(p.id));
      players.appendChild(card);
      this.displayCash.set(p.id, p.cash);
    }
    const top = this.layer('topbar');
    top.innerHTML = `
      <div class="pill glass clock-pill">
        <div class="clock"><div class="dial"></div><div class="ico">☀</div></div>
        <div class="phase-txt"><small>סיבוב <b class="rnd">1</b></small><span class="big phase">בוקר</span></div>
      </div>
      <div class="pill glass vault-pill" title="הכספת: נחתו על השוד כדי לפרוץ אותה">
        <span style="font-size:22px">🏦</span>
        <div class="phase-txt"><small>הכספת</small><span class="big vault">₪0</span></div>
      </div>
      <div id="hype"></div>`;
    const menu = this.layer('menubar');
    menu.innerHTML = `
      <button class="iconbtn" data-a="help" title="איך משחקים">❔</button>
      <button class="iconbtn" data-a="music" title="מוזיקה">🎵</button>
      <button class="iconbtn" data-a="sfx" title="צלילים">🔊</button>
      <button class="iconbtn" data-a="menu" title="תפריט (Esc)">☰</button>`;
    menu.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.onMenu?.(b.dataset.a, b)));
    bindSounds(menu);
    this.layer('feed');
    this.layer('toasts');
    const dock = this.layer('dock', 'glass away');
    dock.className = 'glass away';
    const pc = this.layer('propcard', 'away');
    pc.className = 'away';
    this.syncPlayers(state, false);
  }

  clearHUD() {
    for (const id of ['players', 'topbar', 'menubar', 'feed', 'toasts', 'dock', 'propcard']) document.getElementById(id)?.remove();
  }

  setHUDVisible(on) {
    for (const id of ['players', 'topbar', 'menubar', 'feed']) {
      const el = document.getElementById(id);
      if (el) { el.style.transition = 'opacity .4s, transform .5s'; el.style.opacity = on ? '1' : '0'; el.style.pointerEvents = on ? '' : 'none'; }
    }
    if (!on) { this.hideDock(); this.hidePropCard(); }
  }

  syncPlayers(state, animate = true) {
    this.state = state;
    for (const p of state.players) {
      const card = document.querySelector(`.pcard[data-pid="${p.id}"]`);
      if (!card) continue;
      card.classList.toggle('active', state.turn === p.id && !state.over);
      card.classList.toggle('bankrupt', p.bankrupt);
      card.classList.toggle('online', !!state.online && !p.isAI);
      card.classList.toggle('offline-peer', !!state.online && this.presence?.[p.id] === false);
      // deeds
      const deeds = card.querySelector('.deeds');
      const owned = R.ownedBy(state, p.id).sort((a, b) => a - b);
      deeds.innerHTML = owned.map((i) => `<i class="${state.tiles[i].mortgaged ? 'm' : ''}" style="background:${TILES[i].type === 'property' ? DISTRICTS[TILES[i].district].color : '#8c93a8'}"></i>`).join('');
      // badges
      const b = [];
      if (p.inJail) b.push('<span title="בכלא">🔒</span>');
      if (p.cards.jailFree) b.push(`<span title="עורך דין בחיוג מהיר">⚖️</span>`);
      if (state.bounty?.playerId === p.id) b.push('<span title="מבוקש!">🎯</span>');
      card.querySelector('.badges').innerHTML = b.join('');
      // cash
      const shown = this.displayCash.get(p.id) ?? p.cash;
      if (shown !== p.cash) this.animateCash(card, p.id, shown, p.cash, animate);
    }
  }

  animateCash(card, pid, from, to, animate) {
    const el = card.querySelector('.cash');
    this.displayCash.set(pid, to);
    const diff = to - from;
    if (!animate) { el.textContent = money(to); return; }
    el.classList.remove('up', 'down');
    void el.offsetWidth;
    el.classList.add(diff > 0 ? 'up' : 'down');
    const d = $(`<div class="delta ${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '+' : '−'}${money(Math.abs(diff))}</div>`);
    card.appendChild(d);
    setTimeout(() => d.remove(), 1500);
    const t0 = performance.now(), dur = Math.min(1100, 350 + Math.abs(diff) * 0.6);
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      el.textContent = money(from + diff * e);
      if (t < 1 && this.displayCash.get(pid) === to) requestAnimationFrame(step);
      else if (t >= 1) setTimeout(() => el.classList.remove('up', 'down'), 400);
    };
    requestAnimationFrame(step);
  }

  /** Online: which remote players are currently connected. */
  setPresence(presence) {
    this.presence = presence || {};
    for (const [pid, on] of Object.entries(this.presence)) {
      const card = document.querySelector(`.pcard[data-pid="${pid}"]`);
      card?.classList.toggle('offline-peer', !on);
    }
  }

  pulsePlayer(pid) {
    const card = document.querySelector(`.pcard[data-pid="${pid}"]`);
    if (!card) return;
    card.classList.remove('pulse'); void card.offsetWidth; card.classList.add('pulse');
  }

  setClock(round, phase) {
    const top = document.getElementById('topbar');
    if (!top) return;
    const ph = TIME_PHASES[phase];
    top.querySelector('.rnd').textContent = round + (this.state?.settings.roundLimit ? ` / ${this.state.settings.roundLimit}` : '');
    top.querySelector('.phase').textContent = ph.name;
    top.querySelector('.clock .ico').textContent = phase >= 2 ? (phase === 2 ? '🌇' : '🌙') : (phase === 0 ? '🌅' : '☀️');
    this.clockTurns = this.clockTurns ?? 0;
    const target = phase * 90;
    const cur = this.clockAngle ?? 0;
    let next = cur - (cur % 360) + target;
    if (next < cur) next += 360;
    this.clockAngle = next;
    top.querySelector('.clock .dial').style.transform = `rotate(${-next}deg)`;
  }

  setVault(v, flash = false) {
    const el = document.querySelector('#topbar .vault');
    if (!el) return;
    el.textContent = money(v);
    if (flash) { const p = el.closest('.pill'); p.classList.remove('flash'); void p.offsetWidth; p.classList.add('flash'); }
  }

  setHype(hype) {
    const box = document.getElementById('hype');
    if (!box) return;
    box.innerHTML = Object.entries(hype).map(([d, h]) => `
      <div class="hype-chip" style="background:${DISTRICTS[d].color}"><i>${h.mult > 1 ? '🔥' : '📉'}</i>${DISTRICTS[d].name} ×${h.mult} <span style="opacity:.8">· ${h.rounds} סיב׳</span></div>`).join('');
  }

  // ─────────────────────────────────────────── feed / toast / banner
  feed(html, color = '#7b5cff') {
    const f = document.getElementById('feed');
    if (!f) return;
    const item = $(`<div class="feed-item"><span class="dot" style="background:${color}"></span><span>${html}</span></div>`);
    f.appendChild(item);
    while (f.children.length > 5) f.firstElementChild.remove();
    setTimeout(() => item.classList.add('old'), 9000);
    setTimeout(() => item.remove(), 9700);
  }

  toast(text, kind = '') {
    const box = this.layer('toasts');
    const t = $(`<div class="toast glass ${kind}">${text}</div>`);
    box.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2600);
    setTimeout(() => t.remove(), 3100);
  }

  /** Big centered banner. Resolves when it has left the screen. */
  async banner({ title, subtitle = '', icon = '', color = '#7b5cff', duration = 1.3, kind = '', avatar = null }) {
    const host = this.layer('banner');
    host.innerHTML = '';
    const b = $(`
      <div class="banner ${kind}" style="--bc:${color}">
        <div class="ribbon"></div>
        ${avatar ? `<img class="avatar" src="${avatar}" alt="">` : ''}
        ${icon ? `<div class="icon">${icon}</div>` : ''}
        <div class="title">${title}</div>
        ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
      </div>`);
    host.appendChild(b);
    await wait(duration);
    b.classList.add('out');
    await wait(0.33);
    b.remove();
  }

  // ─────────────────────────────────────────── dock
  hideDock() {
    this.dockSession = (this.dockSession || 0) + 1;
    const d = document.getElementById('dock');
    if (d) d.classList.add('away');
  }

  thinking(p) {
    const d = this.layer('dock');
    const ch = rosterById(p.charId);
    this.dockSession = (this.dockSession || 0) + 1;
    d.innerHTML = `<div class="thinking" style="--pc:${ch.color}"><img src="${this.pimg(p)}" style="background:${ch.color}"> ${esc(p.name)} חושב <span class="dots"><i></i><i></i><i></i></span></div>`;
    d.className = 'glass';
  }

  /**
   * Human turn dock. buttons: [{id, label, sub, icon, kind, key, disabled}]
   * Resolves with the clicked id.
   */
  dock(p, buttons, hint = '') {
    const d = this.layer('dock');
    const ch = rosterById(p.charId);
    d.innerHTML = '';
    d.className = 'glass away';
    const who = $(`<div class="who" style="--pc:${ch.color}"><img src="${this.pimg(p)}" style="background:${ch.color}"></div>`);
    d.appendChild(who);
    return new Promise((resolve) => {
      const primary = buttons.filter((b) => b.primary);
      const rest = buttons.filter((b) => !b.primary);
      const mk = (b) => {
        const el = $(`<button class="btn ${b.kind || ''} ${b.primary ? 'lg' : ''}" ${b.disabled ? 'disabled' : ''} title="${esc(b.title || '')}">
          ${b.icon ? `<span class="ico">${b.icon}</span>` : ''}<span class="lbl">${b.label}${b.sub ? `<span class="sub">${b.sub}</span>` : ''}</span>
          ${b.key ? `<span class="kbd">${b.key}</span>` : ''}</button>`);
        el.addEventListener('click', () => { cleanup(); resolve(b.id); });
        return el;
      };
      if (hint) d.appendChild($(`<div class="hint">${hint}</div>`));
      const g1 = $('<div class="group"></div>');
      rest.forEach((b) => g1.appendChild(mk(b)));
      if (rest.length) d.appendChild(g1);
      if (rest.length && primary.length) d.appendChild($('<div class="sep"></div>'));
      primary.forEach((b) => d.appendChild(mk(b)));
      bindSounds(d);
      const session = (this.dockSession = (this.dockSession || 0) + 1);
      let open = true;
      requestAnimationFrame(() => { if (open && this.dockSession === session) d.classList.remove('away'); });
      const onKey = (e) => {
        if (e.target?.tagName === 'INPUT' || e.repeat || this.paused || document.querySelector('.overlay')) return;
        const b = buttons.find((x) => x.hotkey && x.hotkey === e.code && !x.disabled);
        if (b) { e.preventDefault(); audio.play('click'); cleanup(); resolve(b.id); }
      };
      window.addEventListener('keydown', onKey);
      const cleanup = () => { open = false; window.removeEventListener('keydown', onKey); d.classList.add('away'); };
      this.cancelDock = () => { cleanup(); resolve(null); };
    });
  }

  // ─────────────────────────────────────────── property card
  deedHTML(idx, state, { rent = null, stamp = null } = {}) {
    const t = TILES[idx];
    const ts = state.tiles[idx];
    const d = t.district ? DISTRICTS[t.district] : null;
    const color = d ? d.color : t.type === 'transit' ? '#6f7890' : '#3fa2b8';
    const shift = d ? (d.shift === 'day' ? '☀ עסק יום' : '☾ עסק לילה') : t.type === 'transit' ? '🚦 תחבורה' : '⚡ תשתית';
    let table = '';
    if (t.type === 'property') {
      table = `<table class="rent-table">${t.rent.map((r, i) => `
        <tr class="${ts.owner !== null && ts.level === i ? 'cur' : ''}"><td><span class="lvl">${[0, 1, 2, 3, 4, 5].map((k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</span>${LEVEL_NAMES[i]}</td><td>${money(r)}</td></tr>`).join('')}</table>
        <div class="meta"><span>🔨 שדרוג ${money(d.buildCost)}</span><span>כל השכונה ×${CONFIG.setRentMultiplier}</span></div>`;
    } else if (t.type === 'transit') {
      table = `<table class="rent-table">${[1, 2, 3, 4].map((n) => `<tr><td>${n > 1 ? `${n} קווים בבעלותך` : 'קו אחד בבעלותך'}</td><td>${money(25 * 2 ** (n - 1))}</td></tr>`).join('')}</table>`;
    } else {
      table = `<table class="rent-table"><tr><td>תשתית אחת בבעלותך</td><td>×4 הקוביות</td></tr><tr><td>שתיהן בבעלותך</td><td>×10 הקוביות</td></tr></table>`;
    }
    const owner = ts.owner !== null ? state.players[ts.owner] : null;
    const ownerRow = owner ? `<div class="owner"><img src="${this.pimg(owner)}" style="background:${owner.color}"> בבעלות ${esc(owner.name)} ${ts.mortgaged ? '· <span style="color:var(--bad)">ממושכן</span>' : ''}</div>` : '';
    const rentBox = rent ? `<div class="now">
        <div style="font:800 11px var(--font);opacity:.7">השכירות עכשיו</div>
        ${rent.breakdown.map((b) => `<div class="row"><span>${b.label}</span><span class="${b.good === true ? 'bad' : b.good === false ? 'good' : ''}">${b.value}</span></div>`).join('')}
        <div class="total"><span style="font:800 13px var(--font)">אתה חייב</span><span class="money">${money(rent.amount)}</span></div></div>` : '';
    return `
      <div class="deed glass" style="--dc:${color}">
        <div class="head">
          <div class="district"><span>${d ? d.name : t.type === 'transit' ? 'קו תחבורה' : 'תשתית'}</span><span class="shift">${shift}</span></div>
          <div class="title">${esc(t.name)}</div>
          <div class="biz">${t.kind || t.biz ? esc(t.kind || t.biz) : t.type === 'transit' ? 'השכירות מוכפלת על כל קו בבעלותך' : 'השכירות לפי הקוביות'}</div>
        </div>
        ${stamp ? `<div class="stamp ${stamp.good ? 'good' : ''}">${stamp.text}</div>` : ''}
        <div class="body">
          <div class="price-row"><small>מחיר</small><span class="money">${money(t.price)}</span></div>
          ${table}
          ${ownerRow}
          ${rentBox}
        </div>
      </div>`;
  }

  /**
   * Show a deed card. With `buttons`, resolves to the clicked id (or the
   * auto pick for AI players). Without buttons it is informational.
   */
  propCard(idx, state, { buttons = null, note = '', rent = null, auto = null, stamp = null } = {}) {
    const host = this.layer('propcard');
    host.className = 'away';
    host.innerHTML = this.deedHTML(idx, state, { rent, stamp });
    const deed = host.firstElementChild;
    if (note) deed.appendChild($(`<div class="note">${note}</div>`));
    const session = (this.cardSession = (this.cardSession || 0) + 1);
    requestAnimationFrame(() => requestAnimationFrame(() => { if (this.cardSession === session) host.classList.remove('away'); }));
    audio.play('open');
    if (!buttons) return Promise.resolve(null);
    const acts = $('<div class="actions"></div>');
    deed.appendChild(acts);
    return new Promise((resolve) => {
      const els = {};
      for (const b of buttons) {
        const el = $(`<button class="btn ${b.kind || ''}" ${b.disabled || auto ? 'disabled' : ''}>
          ${b.icon ? `<span class="ico">${b.icon}</span>` : ''}<span class="lbl">${b.label}${b.sub ? `<span class="sub">${b.sub}</span>` : ''}</span>
          ${b.cost != null ? `<span class="cost">${b.cost}</span>` : ''}${b.key ? `<span class="kbd">${b.key}</span>` : ''}</button>`);
        if (auto) el.disabled = false, el.style.pointerEvents = 'none';
        if (b.disabled) el.disabled = true;
        el.addEventListener('click', () => { cleanup(); resolve(b.id); });
        acts.appendChild(el);
        els[b.id] = el;
      }
      bindSounds(acts);
      const onKey = (e) => {
        if (auto || e.repeat || this.paused || document.querySelector('.overlay')) return;
        const b = buttons.find((x) => x.hotkey === e.code && !x.disabled);
        if (b) { e.preventDefault(); audio.play('click'); cleanup(); resolve(b.id); }
      };
      window.addEventListener('keydown', onKey);
      const cleanup = () => window.removeEventListener('keydown', onKey);
      if (auto) {
        (async () => {
          let id = auto.id;
          if (auto.promise) id = await auto.promise;
          else await wait(auto.delay ?? 1.1);
          const el = els[id];
          if (el) { el.classList.add('auto', 'chosen'); audio.play('click'); }
          await wait(0.45);
          cleanup();
          resolve(id);
        })();
      }
    });
  }

  hidePropCard() {
    this.cardSession = (this.cardSession || 0) + 1;
    const host = document.getElementById('propcard');
    if (host && !host.classList.contains('away')) { host.classList.add('away'); audio.play('close', { vol: 0.5 }); }
  }

  stampCard(text, good = false) {
    const deed = document.querySelector('#propcard .deed');
    if (!deed) return;
    deed.querySelector('.stamp')?.remove();
    deed.appendChild($(`<div class="stamp ${good ? 'good' : ''}">${text}</div>`));
  }

  // ─────────────────────────────────────────── generic modal choice
  overlay(inner, { clear = false } = {}) {
    const ov = $(`<div class="overlay ${clear ? 'clear' : ''}"></div>`);
    ov.appendChild(typeof inner === 'string' ? $(inner) : inner);
    this.root.appendChild(ov);
    bindSounds(ov);
    ov.close = async () => { ov.classList.add('out'); await sleep(240); ov.remove(); };
    return ov;
  }

  choice({ title, text = '', options, player = null, auto = null, clear = false }) {
    const ch = player ? rosterById(player.charId) : null;
    const modal = $(`<div class="modal glass">
      <div class="choice-head">${player ? `<img src="${this.pimg(player)}" style="--pc:${ch.color};background:${ch.color}">` : ''}
      <div><h2>${title}</h2>${text ? `<p class="lead" style="margin:0">${text}</p>` : ''}</div></div>
      <div class="choices"></div></div>`);
    const box = modal.querySelector('.choices');
    const ov = this.overlay(modal, { clear });
    audio.play('open');
    return new Promise((resolve) => {
      const els = {};
      for (const o of options) {
        const el = $(`<button class="btn ${o.kind || ''}" ${o.disabled ? 'disabled' : ''}>
          ${o.icon ? `<span class="ico">${o.icon}</span>` : ''}<span class="lbl">${o.label}${o.sub ? `<span class="sub">${o.sub}</span>` : ''}</span>
          ${o.cost != null ? `<span class="cost">${o.cost}</span>` : ''}</button>`);
        if (auto) el.style.pointerEvents = 'none';
        el.addEventListener('click', async () => { await ov.close(); resolve(o.id); });
        box.appendChild(el);
        els[o.id] = el;
      }
      bindSounds(box);
      if (auto) {
        (async () => {
          let id = auto.id;
          if (auto.promise) id = await auto.promise;
          else await wait(auto.delay ?? 1.1);
          els[id]?.classList.add('auto', 'chosen');
          audio.play('click');
          await wait(0.5);
          await ov.close();
          resolve(id);
        })();
      }
    });
  }

  // ─────────────────────────────────────────── cards
  cardReveal({ deck, card, text, player, waitClick }) {
    const isNews = deck === 'news';
    const el = $(`<div class="cardwrap"><div class="gcard ${deck}">
      <div class="face front">
        <div class="deck">${isNews ? '<span class="live">שידור חי</span> מבזק חדשות' : '✦ מזל ✦'}</div>
        <div class="emoji">${card.icon}</div>
        <div class="ctitle">${esc(card.title)}</div>
        <div class="ctext">${esc(text)}</div>
        <div class="okrow"></div>
        ${isNews ? `<div class="ticker"><span>חדשות בומטאון • ${esc(card.title)} • ${esc(player.name)} בזירה • השווקים מגיבים • הישארו איתנו •</span></div>` : ''}
      </div>
      <div class="face back">${isNews ? '📰' : '🔮'}</div></div></div>`);
    const ov = this.overlay(el);
    audio.play(isNews ? 'news' : 'card');
    return new Promise((resolve) => {
      const done = async () => { await ov.close(); resolve(); };
      if (waitClick) {
        const b = $(`<button class="btn ${isNews ? 'primary' : 'purple'}">אוקיי! <span class="kbd">רווח</span></button>`);
        el.querySelector('.okrow').appendChild(b);
        bindSounds(el);
        const onKey = (e) => { if (e.repeat || this.paused) return; if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); window.removeEventListener('keydown', onKey); done(); } };
        window.addEventListener('keydown', onKey);
        b.addEventListener('click', () => { window.removeEventListener('keydown', onKey); done(); });
      } else {
        wait(2.6).then(done);
      }
    });
  }

  // ─────────────────────────────────────────── portfolio (manage / raise funds)
  portfolio(state, pid, { mode = 'manage', owed = 0, reason = '' } = {}) {
    const p = state.players[pid];
    const mine = R.ownedBy(state, pid);
    const byDistrict = new Map();
    for (const i of mine) {
      const t = TILES[i];
      const key = t.district || t.type;
      if (!byDistrict.has(key)) byDistrict.set(key, []);
      byDistrict.get(key).push(i);
    }
    const raise = mode === 'raise';
    const modal = $(`<div class="modal glass wide">
      <h2>${raise ? 'צריך להשיג כסף!' : 'האימפריה שלך'}</h2>
      <p class="lead">${raise
        ? `אתה חייב <b>${money(owed)}</b>${reason ? ` (${esc(reason)})` : ''} אבל יש לך רק <b>${money(p.cash)}</b>. אפשר למכור שדרוגים, לקחת משכנתא על מגרשים, או להכריז על פשיטת רגל.`
        : `כסף: <b>${money(p.cash)}</b> · שווי נקי: <b>${money(R.netWorth(state, pid))}</b>. כאן משדרגים, מוכרים שדרוגים או לוקחים משכנתא.`}</p>
      ${raise ? `<div class="owe-bar"><i style="width:${Math.min(100, (p.cash / owed) * 100)}%"></i></div>` : ''}
      <div class="pf"></div>
      <div class="row" style="justify-content:flex-end;margin-top:14px">
        ${raise ? '<button class="btn danger" data-a="bankrupt"><span class="ico">💥</span>הכרז על פשיטת רגל</button>' : '<button class="btn dark" data-a="close">סיום</button>'}
      </div></div>`);
    const pf = modal.querySelector('.pf');
    if (!mine.length) pf.appendChild($('<div class="pf-empty">אין לך נכסים עדיין. לך תקנה משהו!</div>'));
    for (const [key, list] of byDistrict) {
      const d = DISTRICTS[key];
      const g = $(`<div class="pf-group"><h4><i style="background:${d ? d.color : '#8c93a8'}"></i>${d ? d.name : key === 'transit' ? 'תחבורה' : 'תשתיות'}${d && R.ownsDistrict(state, pid, key) ? ' · <span style="color:var(--good)">כל השכונה שלך ✓</span>' : ''}</h4></div>`);
      for (const i of list) {
        const t = TILES[i], ts = state.tiles[i];
        const b = R.canBuild(state, pid, i), s = R.canSell(state, pid, i), m = R.canMortgage(state, pid, i), u = R.canUnmortgage(state, pid, i);
        const row = $(`<div class="pf-row ${ts.mortgaged ? 'mort' : ''}">
          <div class="n">${esc(t.name)}<small>${t.type === 'property' ? `${LEVEL_NAMES[ts.level]} · שכירות ${money(R.rentFor(state, i, 7).amount)} כרגע` : 'השכירות גדלה עם כל קו'}${ts.mortgaged ? ' · ממושכן' : ''}</small></div>
          <div class="acts"></div></div>`);
        const acts = row.querySelector('.acts');
        const btn = (a, label, kind, ok, title = '') => {
          const e = $(`<button class="btn sm ${kind}" data-a="${a}" data-i="${i}" ${ok ? '' : 'disabled'} title="${esc(title)}">${label}</button>`);
          acts.appendChild(e);
        };
        if (t.type === 'property' && !raise) btn('build', `＋ שדרוג ${money(R.buildCost(i))}`, 'go', b.ok, b.reason || '');
        if (t.type === 'property' && ts.level > 0) btn('sell', `מכור +${money(s.refund)}`, 'blue', s.ok);
        if (!ts.mortgaged) btn('mortgage', `משכנתא +${money(Math.floor(t.price * CONFIG.mortgageRatio))}`, 'ghost', m.ok, m.reason || '');
        else if (!raise) btn('unmortgage', `פדיון ${money(Math.ceil(t.price * CONFIG.unmortgageRatio))}`, 'primary', u.ok, u.reason || '');
        g.appendChild(row);
      }
      pf.appendChild(g);
    }
    const ov = this.overlay(modal);
    audio.play('open');
    return new Promise((resolve) => {
      modal.addEventListener('click', async (e) => {
        const b = e.target.closest('button[data-a]');
        if (!b || b.disabled) return;
        const a = b.dataset.a;
        await ov.close();
        if (a === 'close') resolve({ type: 'close' });
        else if (a === 'bankrupt') resolve({ type: 'bankrupt' });
        else resolve({ type: a, idx: +b.dataset.i });
      });
    });
  }

  // ─────────────────────────────────────────── trading
  tradeBuilder(state, pid) {
    const me = state.players[pid];
    const others = state.players.filter((o) => !o.bankrupt && o.id !== pid);
    if (!others.length) return Promise.resolve(null);
    let partner = others[0];
    const sel = { give: new Set(), get: new Set(), giveCash: 0, getCash: 0 };
    const modal = $(`<div class="modal glass wide"><h2>בוא נעשה עסקה 🤝</h2><p class="lead">בחר מה עובר ידיים. הנכסים שומרים על השדרוגים והמשכנתאות שלהם.</p>
      <div class="trade-partners"></div><div class="trade-cols"></div>
      <div class="trade-summary"><div class="lead" style="margin:0" id="tsum"></div>
      <div class="row"><button class="btn ghost" data-a="cancel">ביטול</button><button class="btn go" data-a="propose"><span class="ico">📨</span>הצע עסקה</button></div></div></div>`);
    const ov = this.overlay(modal);
    const chip = (i, on) => `<button class="chip ${on ? 'on' : ''} ${state.tiles[i].mortgaged ? 'mort' : ''}" data-i="${i}"><i style="background:${TILES[i].district ? DISTRICTS[TILES[i].district].color : '#8c93a8'}"></i>${esc(TILES[i].name)}</button>`;
    const render = () => {
      const tp = modal.querySelector('.trade-partners');
      tp.innerHTML = others.map((o) => `<button data-p="${o.id}" class="${o === partner ? 'on' : ''}" style="--pc:${o.color}"><img src="${this.pimg(o)}" style="background:${o.color}">${esc(o.name)}</button>`).join('');
      const cols = modal.querySelector('.trade-cols');
      const mine = R.ownedBy(state, pid), theirs = R.ownedBy(state, partner.id);
      cols.innerHTML = `
        <div class="trade-col"><h4><img src="${this.pimg(me)}" style="background:${me.color}">אתה נותן</h4>
          <div class="chips" data-side="give">${mine.map((i) => chip(i, sel.give.has(i))).join('') || '<span class="lead">אין נכסים</span>'}</div>
          <div class="cash-in">כסף <input type="range" min="0" max="${me.cash}" step="10" value="${sel.giveCash}" data-c="give"><span class="money">${money(sel.giveCash)}</span></div></div>
        <div class="trade-col"><h4><img src="${this.pimg(partner)}" style="background:${partner.color}">אתה מקבל מ${esc(partner.name)}</h4>
          <div class="chips" data-side="get">${theirs.map((i) => chip(i, sel.get.has(i))).join('') || '<span class="lead">אין נכסים</span>'}</div>
          <div class="cash-in">כסף <input type="range" min="0" max="${partner.cash}" step="10" value="${sel.getCash}" data-c="get"><span class="money">${money(sel.getCash)}</span></div></div>`;
      cols.querySelectorAll('input[type=range]').forEach((inp) => inp.addEventListener('input', () => {
        sel[inp.dataset.c + 'Cash'] = +inp.value;
        inp.nextElementSibling.textContent = money(+inp.value);
        summary();
      }));
      summary();
    };
    const summary = () => {
      const g = [...sel.give].map((i) => TILES[i].name).concat(sel.giveCash ? [money(sel.giveCash)] : []);
      const r = [...sel.get].map((i) => TILES[i].name).concat(sel.getCash ? [money(sel.getCash)] : []);
      modal.querySelector('#tsum').innerHTML = `אתה נותן <b>${g.join(', ') || 'כלום'}</b> · אתה מקבל <b>${r.join(', ') || 'כלום'}</b>`;
      modal.querySelector('[data-a=propose]').disabled = !g.length && !r.length;
    };
    render();
    audio.play('open');
    return new Promise((resolve) => {
      modal.addEventListener('click', async (e) => {
        const pb = e.target.closest('[data-p]');
        if (pb) { partner = state.players[+pb.dataset.p]; sel.get.clear(); sel.getCash = 0; render(); audio.play('click'); return; }
        const c = e.target.closest('.chip');
        if (c) {
          const side = c.parentElement.dataset.side;
          const i = +c.dataset.i;
          sel[side].has(i) ? sel[side].delete(i) : sel[side].add(i);
          c.classList.toggle('on');
          audio.play('pop', { pitch: sel[side].has(i) ? 1.2 : 0.9 });
          summary();
          return;
        }
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (!a) return;
        await ov.close();
        if (a === 'cancel') return resolve(null);
        resolve({ from: pid, to: partner.id, give: { cash: sel.giveCash, tiles: [...sel.give] }, get: { cash: sel.getCash, tiles: [...sel.get] } });
      });
    });
  }

  tradeOfferHTML(offer, state) {
    const a = state.players[offer.from], b = state.players[offer.to];
    const list = (x) => [...x.tiles.map((i) => `<div>▪ ${esc(TILES[i].name)}</div>`), x.cash ? `<div>▪ ${money(x.cash)} מזומן</div>` : ''].join('') || '<div style="color:var(--ink-3)">כלום</div>';
    return `<div class="trade-offer">
      <div class="side"><h5>${esc(a.name)} נותן</h5>${list(offer.give)}</div>
      <div class="arrow">⇄</div>
      <div class="side"><h5>${esc(b.name)} נותן</h5>${list(offer.get)}</div></div>`;
  }

  tradeResponse(offer, state, { auto = null } = {}) {
    const a = state.players[offer.from], b = state.players[offer.to];
    const modal = $(`<div class="modal glass">
      <div class="choice-head"><img src="${this.pimg(a)}" style="background:${a.color}"><div><h2>הצעת עסקה!</h2>
      <p class="lead" style="margin:0">${esc(a.name)} ← ${esc(b.name)}${auto ? '' : ` · <b>${esc(b.name)}</b>, ההחלטה שלך`}</p></div></div>
      ${this.tradeOfferHTML(offer, state)}
      <div class="row" style="justify-content:flex-end" id="tr-actions">
        <button class="btn danger" data-a="no">דחה</button><button class="btn go" data-a="yes">קבל את העסקה</button></div></div>`);
    const ov = this.overlay(modal);
    audio.play('open');
    return new Promise((resolve) => {
      const finish = async (yes) => { await ov.close(); resolve(yes); };
      if (auto) {
        modal.querySelectorAll('button').forEach((x) => { x.style.pointerEvents = 'none'; });
        (async () => {
          let yes = auto.yes;
          if (auto.promise) yes = !!(await auto.promise);
          else await wait(1.3);
          const el = modal.querySelector(`[data-a=${yes ? 'yes' : 'no'}]`);
          el.classList.add('auto', 'chosen');
          audio.play(yes ? 'cash' : 'error');
          await wait(0.7);
          finish(yes);
        })();
        return;
      }
      modal.addEventListener('click', (e) => {
        const a2 = e.target.closest('[data-a]')?.dataset.a;
        if (a2) finish(a2 === 'yes');
      });
    });
  }

  targetPick({ player, candidates, prompt, auto = null }) {
    return this.choice({
      title: prompt, player, auto: auto?.then ? { promise: auto } : auto != null ? { id: auto, delay: 1 } : null,
      options: candidates.map((c) => ({ id: c.id, label: esc(c.name), sub: `${money(c.cash)} מזומן`, icon: `<img src="${this.pimg(c)}" style="width:30px;height:30px;border-radius:9px;background:${c.color}">`, kind: 'ghost' })),
    });
  }

  // ─────────────────────────────────────────── VS + wipe
  vs({ a, b, game, stake, keysA, keysB, reason }) {
    const host = this.layer('vs');
    const cha = rosterById(a.charId), chb = rosterById(b.charId);
    host.className = '';
    host.innerHTML = `
      <div class="vs-half l" style="--pc:${cha.color}">
        <div class="rl">${reason === 'rent' ? 'המתמודד' : 'צד שמאל'}</div>
        <img src="${this.pimg(a)}" alt=""><div class="nm">${esc(a.name)}</div>
        <div class="keys">${keysA}</div></div>
      <div class="vs-half r" style="--pc:${chb.color}">
        <div class="rl">${reason === 'rent' ? 'בעל הבית' : 'צד ימין'}</div>
        <img src="${this.pimg(b)}" alt=""><div class="nm">${esc(b.name)}</div>
        <div class="keys">${keysB}</div></div>
      <div class="vs-mid">VS</div>
      <div class="vs-game glass"><div class="gt">${game.icon} ${game.name}</div><div class="gd">${game.howto}</div>${stake ? `<div class="stake">${stake}</div>` : ''}</div>`;
    return { close: async () => { host.classList.add('vs-out'); await sleep(420); host.innerHTML = ''; } };
  }

  async wipe(colors, dir = 'in') {
    const host = this.layer('wipe');
    if (dir === 'in') {
      host.innerHTML = colors.concat(colors).concat(colors).map((c, i) => `<i style="background:${c};animation-delay:${i * 0.035}s"></i>`).join('');
      host.className = 'in';
      await sleep(420 + colors.length * 3 * 35);
    } else {
      host.className = 'out';
      host.querySelectorAll('i').forEach((el, i) => { el.style.animationDelay = `${i * 0.035}s`; });
      await sleep(460 + host.children.length * 35);
      host.innerHTML = '';
      host.className = '';
    }
  }

  // ─────────────────────────────────────────── title / setup
  title({ hasSave, onPlay, onContinue, onHelp, onOnline, onMap }) {
    const letters = 'בומטאון'.split('');
    const cols = ['#ff5d73', '#ffb31f', '#2fcf85', '#2fa8ff', '#8a63ff', '#ff6fae', '#ff9a3c', '#5763e0'];
    const el = $(`<div id="title">
      <div class="logo-wrap">
        <div class="logo">${letters.map((c, i) => `<span style="--c:${cols[i]};--rot:${(i % 2 ? 1 : -1) * 2}deg;animation-delay:${i * 0.07}s, ${1 + i * 0.18}s">${c}</span>`).join('')}</div>
        <div class="tagline">נכסים <i>✦</i> דו-קרבות <i>✦</i> כאוס מוחלט</div>
        <div class="feature-row">
          <span>⚔️ דו-קרבות שכירות: כפול או כלום</span><span>🌗 כלכלת יום ולילה</span><span>🎯 פרסים על הראש</span>
          <span>🏢 השתלטויות עוינות</span><span>🏦 שוד כספות</span><span>🔨 מכירות פומביות בזק</span><span>📰 מבזקי חדשות</span>
        </div>
      </div>
      <div class="setup glass">
        <h3>משחק חדש <button class="btn sm ghost" data-a="help">❔ איך משחקים</button></h3>
        <div class="opt-label">מפה</div>
        <div class="maps">${MAP_LIST.map((m) => `<button class="map-card ${m.id === 'boomtown' ? 'on' : ''}" data-map="${m.id}" title="${esc(m.tagline)}"><span class="flag">${m.flag}</span><b>${esc(m.name)}</b></button>`).join('')}</div>
        <div class="slots"></div>
        <div class="opts">
          <div class="opt"><label>אורך המשחק</label><div class="seg" data-o="roundLimit"><button data-v="15">15 סיבובים</button><button data-v="25" class="on">25 סיבובים</button><button data-v="0">בלי הגבלה</button></div></div>
          <div class="opt"><label>כסף התחלתי</label><div class="seg" data-o="startingCash"><button data-v="1000">₪1000</button><button data-v="1500" class="on">₪1500</button><button data-v="2000">₪2000</button></div></div>
          <div class="opt"><label>דו-קרבות בין מחשבים</label><div class="seg" data-o="cpuDuels"><button data-v="quick" class="on">מהיר</button><button data-v="watch">לצפות</button></div></div>
          <div class="opt"><label>מהירות המשחק</label><div class="seg" data-o="speed"><button data-v="1" class="on">1×</button><button data-v="1.5">1.5×</button><button data-v="2">2×</button></div></div>
          <div class="opt" title="חוק קלאסי: אף אחד לא בונה עד סיבוב 2"><label>בנייה בסיבוב 1</label><div class="seg" data-o="noBuildFirstRound"><button data-v="0" class="on">מותר</button><button data-v="1">אסור (קלאסי)</button></div></div>
        </div>
        <div class="go-row">
          ${hasSave ? '<button class="btn blue lg" data-a="continue"><span class="ico">↺</span>המשך משחק</button>' : ''}
          <button class="btn primary lg" data-a="play"><span class="ico">🎲</span>שחק!</button>
        </div>
        <button class="btn purple" data-a="online" style="width:100%;margin-top:10px"><span class="ico">🌐</span><span class="lbl">שחק אונליין עם חברים<span class="sub">פתח חדר ושתף את הקישור</span></span></button>
      </div></div>`);
    this.root.appendChild(el);
    const slots = [
      { charId: 'rex', name: '', isAI: false, aiLevel: 'normal' },
      { charId: 'tina', name: '', isAI: true, aiLevel: 'normal' },
      { charId: 'cap', name: '', isAI: true, aiLevel: 'normal' },
    ];
    const opts = { roundLimit: 25, startingCash: 1500, cpuDuels: 'quick', speed: 1, noBuildFirstRound: 0, map: 'boomtown' };
    el.querySelector('.maps').addEventListener('click', (e) => {
      const b = e.target.closest('[data-map]');
      if (!b || b.dataset.map === opts.map) return;
      opts.map = b.dataset.map;
      el.querySelectorAll('.map-card').forEach((x) => x.classList.toggle('on', x === b));
      audio.play('pop', { pitch: 1.2 });
      onMap?.(opts.map);
    });
    const box = el.querySelector('.slots');
    const render = () => {
      box.innerHTML = '';
      slots.forEach((s, k) => {
        const ch = rosterById(s.charId);
        const row = $(`<div class="slot" style="--pc:${ch.color}">
          <div class="arrows"><button data-d="-1">▲</button><button data-d="1">▼</button></div>
          <div class="face" title="החלף דמות"><img src="${this.portrait(s.charId)}" alt=""></div>
          <div><input value="${esc(s.name || ch.name)}" maxlength="14" spellcheck="false"><div class="bio">${esc(ch.bio)}</div></div>
          <div class="kind">
            <div class="seg"><button data-k="human" class="${s.isAI ? '' : 'on'}">שחקן</button><button data-k="cpu" class="${s.isAI ? 'on' : ''}">מחשב</button></div>
            ${s.isAI ? `<div class="seg"><button data-l="easy" class="${s.aiLevel === 'easy' ? 'on' : ''}">קל</button><button data-l="normal" class="${s.aiLevel === 'normal' ? 'on' : ''}">רגיל</button><button data-l="hard" class="${s.aiLevel === 'hard' ? 'on' : ''}">קשה</button></div>` : `<div class="bio" style="text-align:center">מקש מכירה <span class="kbd">${SEAT_KEYS[k].label}</span></div>`}
          </div>
          ${slots.length > 2 ? '<button class="rm" title="הסר">✕</button>' : ''}</div>`);
        const cycle = (d) => {
          const taken = new Set(slots.map((x) => x.charId));
          let idx = ROSTER.findIndex((c) => c.id === s.charId);
          for (let n = 0; n < ROSTER.length; n++) {
            idx = (idx + d + ROSTER.length) % ROSTER.length;
            if (!taken.has(ROSTER[idx].id)) break;
          }
          const wasDefault = !s.name || s.name === ch.name;
          s.charId = ROSTER[idx].id;
          if (wasDefault) s.name = '';
          audio.play('pop', { pitch: 1 + Math.random() * 0.3 });
          render();
        };
        row.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => cycle(+b.dataset.d)));
        row.querySelector('.face').addEventListener('click', () => cycle(1));
        row.querySelector('input').addEventListener('input', (e) => { s.name = e.target.value; });
        row.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { s.isAI = b.dataset.k === 'cpu'; audio.play('click'); render(); }));
        row.querySelectorAll('[data-l]').forEach((b) => b.addEventListener('click', () => { s.aiLevel = b.dataset.l; audio.play('click'); render(); }));
        row.querySelector('.rm')?.addEventListener('click', () => { slots.splice(k, 1); audio.play('close'); render(); });
        box.appendChild(row);
      });
      if (slots.length < 4) {
        const add = $('<button class="add-slot">＋ הוסף שחקן</button>');
        add.addEventListener('click', () => {
          const taken = new Set(slots.map((x) => x.charId));
          const c = ROSTER.find((r) => !taken.has(r.id));
          slots.push({ charId: c.id, name: '', isAI: true, aiLevel: 'normal' });
          audio.play('pop');
          render();
        });
        box.appendChild(add);
      }
      bindSounds(box);
    };
    render();
    el.querySelectorAll('.seg[data-o]').forEach((seg) => seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      const v = b.dataset.v;
      opts[seg.dataset.o] = isNaN(+v) ? v : +v;
      audio.play('click');
    }));
    el.querySelector('[data-a=help]').addEventListener('click', () => onHelp());
    el.querySelector('[data-a=play]').addEventListener('click', () => {
      onPlay({ players: slots.map((s) => ({ ...s, name: (s.name || rosterById(s.charId).name).trim() || rosterById(s.charId).name })), settings: { ...opts } });
    });
    el.querySelector('[data-a=continue]')?.addEventListener('click', () => onContinue());
    el.querySelector('[data-a=online]')?.addEventListener('click', () => onOnline?.());
    bindSounds(el);
    this.titleEl = el;
  }

  async hideTitle() {
    if (!this.titleEl) return;
    this.titleEl.classList.add('out');
    await sleep(600);
    this.titleEl.remove();
    this.titleEl = null;
  }

  howTo() {
    const cards = [
      ['🏗️', 'בנה אימפריה', 'קונים מגרשים ומשדרגים אותם מדוכן קטן ועד אייקון של העיר. מי שמחזיק שכונה שלמה יכול לבנות מגדלים ואייקונים, וגובה שכירות ×1.5.'],
      ['⚔️', 'דו-קרב: כפול או כלום', 'נחתת על עסק של יריב? אפשר לשלם שכירות… או להזמין את הבעלים לדו-קרב במיני-משחק. ניצחת? לא משלמים כלום. הפסדת? משלמים כפול.'],
      ['🌗', 'כלכלת יום ולילה', 'בכל סיבוב השעון מתקדם: בוקר ← צהריים ← שקיעה ← לילה. ☀ עסקי יום גובים ×1.5 כשיש אור, ☾ עסקי לילה אחרי החשכה. מחוץ לשעות השיא: רק ×0.75.'],
      ['🎯', 'פרס על ראש המוביל', 'השארת את כולם מאחור? על הראש שלך יש פרס, והוא גדל בכל סיבוב. מי שמנצח את המוביל בדו-קרב כלשהו מקבל אותו מהבנק.'],
      ['🏢', 'השתלטות עוינת', 'נחתת על מגרש של יריב? שלם פי 2 מהשווי שלו והוא שלך, כולל השדרוגים. מי שמחזיק שכונה שלמה מוגן מזה.'],
      ['🏦', 'שוד הכספת', 'מסים, קנסות וערבויות נערמים בכספת הזכוכית. נוחתים על השוד ופורצים 3 חוגות: שלוש מתוך שלוש = ג׳קפוט. אפס = ישר לכלא.'],
      ['🔨', 'מכירה פומבית בזק', 'ויתרת על מגרש? כולם מתחרים עליו: מחזיקים את המקש (Q · P · Z · M), או בטלפון את הכפתור שעל המסך, בזמן שהמחיר עולה. מי שמחזיק אחרון זוכה.'],
      ['📰', 'מבזקי חדשות', 'פלאש מוב, רעידות אדמה, הפסקות חשמל, רובין הוד, טרנדים ויראליים… החדשות משנות את כל הלוח. המזל משנה רק את שלך.'],
      ['🚓', 'הכלא', 'משלמים ערבות, מנסים להוציא דאבל, או מגישים ערעור: דו-קרב מול השחקן העשיר ביותר על החופש שלך.'],
    ];
    const modal = $(`<div class="modal glass howto"><h2>איך משחקים בומטאון</h2>
      <p class="lead">בבסיס זה משחק נדל״ן קלאסי, רק עם הרבה יותר כאוס. ${IS_TOUCH ? 'שליטה: לוחצים על הכפתורים · גוררים אצבע כדי לסובב את הלוח · צובטים בשתי אצבעות לזום · נוגעים במגרש כדי לראות את הכרטיס שלו · בדו-קרבות מופיעים על המסך כפתור פעולה (ובמשחק הדחיפות גם ג׳ויסטיק). שני שחקנים על אותו טלפון? כל אחד מקבל כפתור בצד שלו.</p>' : `שליטה: <span class="kbd">רווח</span> הטלה/אישור · גרירה לסיבוב המצלמה · גלגלת לזום · בדו-קרבות: השחקן בצד שמאל <span class="kbd">WASD</span>+<span class="kbd">F</span>, השחקן בצד ימין <span class="kbd">חצים</span>+<span class="kbd">ENTER</span>. לבד מול המחשב: גם <span class="kbd">רווח</span> עובד.</p>`}
      <div class="howto-grid">${cards.map(([e, h, p]) => `<div class="howto-card"><div class="e">${e}</div><h4>${h}</h4><p>${p}</p></div>`).join('')}</div>
      <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn primary">יאללה!</button></div></div>`);
    const ov = this.overlay(modal);
    audio.play('open');
    return new Promise((resolve) => {
      modal.querySelector('.btn.primary').addEventListener('click', async () => { await ov.close(); resolve(); });
      ov.addEventListener('click', async (e) => { if (e.target === ov) { await ov.close(); resolve(); } });
    });
  }

  pauseMenu({ settings, onSetting, online = false }) {
    const modal = $(`<div class="modal glass"><h2>המשחק בהפסקה</h2>
      <div class="setting">מוזיקה <div class="seg" data-s="music"><button data-v="1" class="${settings.music ? 'on' : ''}">פועל</button><button data-v="0" class="${settings.music ? '' : 'on'}">כבוי</button></div></div>
      <div class="setting">אפקטים קוליים <div class="seg" data-s="sfx"><button data-v="1" class="${settings.sfx ? 'on' : ''}">פועל</button><button data-v="0" class="${settings.sfx ? '' : 'on'}">כבוי</button></div></div>
      <div class="setting">גרפיקה <div class="seg" data-s="quality"><button data-v="high" class="${settings.quality === 'high' ? 'on' : ''}">גבוהה</button><button data-v="low" class="${settings.quality === 'low' ? 'on' : ''}">ביצועים</button></div></div>
      <div class="setting">מהירות המשחק <div class="seg" data-s="speed">${[1, 1.5, 2].map((v) => `<button data-v="${v}" class="${settings.speed === v ? 'on' : ''}">${v}×</button>`).join('')}</div></div>
      <div class="row" style="margin-top:18px;justify-content:space-between">
        <button class="btn danger" data-a="quit">${online ? 'עזוב את החדר' : 'שמור וצא לתפריט'}</button>
        <div class="row"><button class="btn ghost" data-a="help">איך משחקים</button><button class="btn go" data-a="resume">המשך</button></div></div></div>`);
    const ov = this.overlay(modal);
    audio.play('open');
    return new Promise((resolve) => {
      modal.querySelectorAll('.seg[data-s]').forEach((seg) => seg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        const v = b.dataset.v;
        onSetting(seg.dataset.s, v === '1' ? true : v === '0' ? false : isNaN(+v) ? v : +v);
      }));
      modal.addEventListener('click', async (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (!a) return;
        await ov.close();
        resolve(a);
      });
    });
  }

  gameOver(state, standings, winner) {
    const ch = rosterById(winner.charId);
    const max = Math.max(1, ...standings.map((s) => s.worth));
    const awards = [];
    const best = (key, e, t, fmt) => {
      const top = state.players.slice().sort((a, b) => b.stats[key] - a.stats[key])[0];
      if (top && top.stats[key] > 0) awards.push(`<div class="award"><div class="e">${e}</div>${t}<small>${esc(top.name)} · ${fmt(top.stats[key])}</small></div>`);
    };
    best('duelsWon', '⚔️', 'אלוף הדו-קרבות', (v) => `${v} ניצחונות`);
    best('rentEarned', '🏠', 'בעל הבית העליון', (v) => `${money(v)} שכירות`);
    best('bestHeist', '🦹', 'גנב אמן', (v) => `${money(v)} בשוד`);
    best('takeovers', '🏢', 'כריש תאגידים', (v) => `${v} השתלטויות`);
    best('bounties', '🎯', 'צייד ראשים', (v) => `${v} פרסים`);
    const modal = $(`<div class="modal glass gameover" style="--pc:${ch.color}">
      <div class="crown">👑</div>
      <div class="winner"><img src="${this.pimg(winner)}" alt=""><h1>${esc(winner.name)}</h1><div class="sub">הטייקון של בומטאון</div></div>
      <div class="standings">${standings.map((s, k) => {
        const p = state.players[s.id];
        return `<div class="standing" style="--pc:${p.color}"><div class="rk">#${k + 1}</div><img src="${this.pimg(p)}"><div><b>${esc(p.name)}</b>${p.bankrupt ? ' <span style="color:var(--bad);font-weight:800">· פשט רגל</span>' : ''}<div class="bar" style="width:${Math.max(3, (s.worth / max) * 100)}%;animation-delay:${0.3 + k * 0.12}s"></div></div><div class="nw">${money(s.worth)}</div></div>`;
      }).join('')}</div>
      ${awards.length ? `<div class="awards">${awards.join('')}</div>` : ''}
      <div class="row" style="justify-content:center"><button class="btn ghost lg" data-a="menu">תפריט ראשי</button><button class="btn primary lg" data-a="again">🎲 עוד משחק</button></div></div>`);
    const ov = this.overlay(modal);
    return new Promise((resolve) => {
      modal.addEventListener('click', async (e) => {
        const a = e.target.closest('[data-a]')?.dataset.a;
        if (!a) return;
        await ov.close();
        resolve(a);
      });
    });
  }
}

// ─────────────────────────────────────────────────────────── duel HUD
class DuelHud {
  constructor(ui) { this.ui = ui; this.el = null; }
  open({ a, b, title, keysA, keysB, scoreA = '', scoreB = '', timer = '' }) {
    const host = this.ui.layer('duelhud');
    const ca = rosterById(a.charId), cb = rosterById(b.charId);
    host.innerHTML = `
      <div class="dh-top">
        <div class="dh-plate glass" style="--pc:${ca.color}"><img src="${this.ui.pimg(a)}"><div class="grow"><div class="nm">${esc(a.name)}</div><div class="keys">${keysA}</div></div><div class="sc" data-s="0">${scoreA}</div></div>
        <div class="dh-timer">${timer}</div>
        <div class="dh-plate glass r" style="--pc:${cb.color}"><img src="${this.ui.pimg(b)}"><div class="grow"><div class="nm">${esc(b.name)}</div><div class="keys">${keysB}</div></div><div class="sc" data-s="1">${scoreB}</div></div>
      </div>
      <div class="dh-title">${title}</div>
      <div class="dh-custom"></div>
      <div class="dh-bigwrap"></div>`;
    host.style.display = '';
    this.el = host;
    this.custom = host.querySelector('.dh-custom');
  }
  score(side, v) { const e = this.el?.querySelector(`.sc[data-s="${side}"]`); if (e) { e.textContent = v; e.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.2,1.5,.35,1)' }); } }
  timer(v) { const e = this.el?.querySelector('.dh-timer'); if (e) e.textContent = v; }
  big(text, cls = '', sub = '') {
    const w = this.el?.querySelector('.dh-bigwrap');
    if (!w) return;
    w.innerHTML = text ? `<div class="dh-big pop ${cls}">${text}${sub ? `<small>${sub}</small>` : ''}</div>` : '';
  }
  close() { if (this.el) { this.el.innerHTML = ''; this.el.style.display = 'none'; } this.el = null; }
}

// ─────────────────────────────────────────────────────────── auction
class AuctionUI {
  constructor(ui) { this.ui = ui; }
  open({ idx, bidders, hold = false }) {
    const t = TILES[idx];
    const col = t.district ? DISTRICTS[t.district].color : '#8c93a8';
    const el = $(`<div class="auction glass">
      <div class="lot"><i style="background:${col}"></i>מכירה פומבית · ${esc(t.name)} · מחיר רשמי ${money(t.price)}</div>
      <div class="price money">₪0</div>
      <div class="status">היכונו! מחזיקים את הכפתור כדי להישאר במכירה!</div>
      <div class="bidders">${bidders.map((b) => `<div class="bidder" data-pid="${b.p.id}" style="--pc:${b.p.color}"><img src="${this.ui.pimg(b.p)}"><div class="nm">${esc(b.p.name)}</div><div class="st">${b.key ? (IS_TOUCH ? 'מחזיק ✋' : `החזק <span class="kbd">${b.key}</span>`) : 'מחשב'}</div></div>`).join('')}</div></div>`);
    this.ov = this.ui.overlay(el, { clear: false });
    this.el = el;
    if (hold) this.addHold();
    return el;
  }
  price(n) {
    const p = this.el.querySelector('.price');
    p.textContent = money(n);
    p.classList.remove('tick'); void p.offsetWidth; p.classList.add('tick');
  }
  status(t) { this.el.querySelector('.status').innerHTML = t; }
  set(pid, st, label) {
    const b = this.el.querySelector(`.bidder[data-pid="${pid}"]`);
    if (!b) return;
    b.classList.toggle('holding', st === 'holding');
    b.classList.toggle('out', st === 'out');
    b.classList.toggle('win', st === 'win');
    if (label) b.querySelector('.st').innerHTML = label;
  }
  /** Phones: one big button to hold instead of a keyboard key. */
  addHold() {
    if (!IS_TOUCH || !this.el || this.holdBtn) return;
    this.holdBtn = bigHoldButton('✋ החזיקו כאן כדי להישאר', 'Space');
    this.el.appendChild(this.holdBtn);
  }
  async close() { this.holdBtn?.release(); this.holdBtn = null; await this.ov?.close(); this.ov = null; }
}
