// Online play flow: create/join a room, the lobby, and starting/resuming
// networked games for both the host and guests.
import { NetClient } from "./client.js";
import { HostSession, GuestSession, RemoteController, EMOTES } from "./session.js";
import { $ } from "../ui/ui.js";
import { ROSTER, rosterById } from "../game/roster.js";
import { MAP_LIST } from "../game/maps.js";
import { createGame } from "../game/state.js";
import { GameEngine } from "../game/engine.js";
import { HumanController, AIController } from "../game/controllers.js";
import { audio } from "../audio/audio.js";
import { clock } from "../core/tween.js";

const NAME_KEY = 'boomtown.name';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// The Clipboard API only exists on https:// or localhost — fall back to the
// old execCommand trick so "Copy link" also works on a plain http:// server.
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}
const storedName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };
const LEVEL_HE = { easy: 'קל', normal: 'רגיל', hard: 'קשה' };
const storeName = (n) => { try { localStorage.setItem(NAME_KEY, n); } catch { /* ignore */ } };

export class OnlineFlow {
  /**
   * hooks: { beforeGame(): Promise, afterLeave(), onGameOver(choice) }
   */
  constructor({ ui, presenter, hooks }) {
    this.ui = ui;
    this.P = presenter;
    this.hooks = hooks;
    this.net = null;
    this.phase = 'idle';   // idle | lobby | game
    this.lobby = null;
    this.modal = null;
    this.session = null;
    this.engine = null;
  }

  get active() { return this.phase !== 'idle'; }

  // ─────────────────────────────────────────── entry points
  openMenu() {
    const el = $(`<div class="modal glass" style="width:min(480px,94vw)">
      <h2>משחק אונליין 🌐</h2>
      <p class="lead">פותחים חדר, שולחים את הקישור לחברים, ומשחקים ביחד מכל מקום.</p>
      <div class="opt" style="margin-bottom:12px"><label style="display:block;font:800 11px var(--font);letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);margin-bottom:5px">השם שלך</label>
        <input class="nm" maxlength="14" value="${esc(storedName())}" placeholder="טייקון" style="width:100%;padding:12px 14px;border-radius:14px;border:2px solid rgba(40,30,80,.12);font:800 16px var(--font);outline:none"></div>
      <div class="choices">
        <button class="btn primary" data-a="create"><span class="ico">🏠</span><span class="lbl">פתח חדר<span class="sub">אתה המארח: שתף את הקישור</span></span></button>
        <div class="row" style="align-items:stretch">
          <input class="code" maxlength="5" placeholder="קוד חדר" style="direction:ltr;flex:1;min-width:0;padding:12px 14px;border-radius:14px;border:2px solid rgba(40,30,80,.12);font:400 22px var(--display);letter-spacing:.15em;text-transform:uppercase;outline:none">
          <button class="btn blue" data-a="join"><span class="ico">🚪</span>הצטרף</button>
        </div>
      </div>
      <div class="err lead" style="color:var(--bad);margin:10px 0 0;min-height:18px"></div>
      <div class="row" style="justify-content:flex-end;margin-top:6px"><button class="btn ghost sm" data-a="close">חזרה</button></div></div>`);
    const ov = this.ui.overlay(el);
    const nameIn = el.querySelector('.nm');
    const codeIn = el.querySelector('.code');
    const err = el.querySelector('.err');
    setTimeout(() => (nameIn.value ? codeIn : nameIn).focus(), 50);
    el.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      if (a === 'close') { ov.close(); return; }
      const name = nameIn.value.trim() || 'טייקון';
      storeName(name);
      err.textContent = '';
      try {
        if (a === 'create') { el.querySelectorAll('button').forEach((b) => { b.disabled = true; }); await this.host(name); ov.close(); }
        if (a === 'join') {
          const code = codeIn.value.trim().toUpperCase();
          if (code.length < 4) { err.textContent = 'הקלד את קוד החדר שהחבר שלך שלח.'; return; }
          el.querySelectorAll('button').forEach((b) => { b.disabled = true; });
          await this.join(code, name);
          ov.close();
        }
      } catch (ex) {
        err.textContent = ex.message;
        el.querySelectorAll('button').forEach((b) => { b.disabled = false; });
        this.net?.close();
        this.net = null;
      }
    });
  }

  /** Opened via a shared link (?room=CODE). */
  joinFromLink(code) {
    const el = $(`<div class="modal glass" style="width:min(440px,94vw)">
      <h2>הצטרפות לחדר <span style="color:#b37800;letter-spacing:.1em">${esc(code)}</span></h2>
      <p class="lead">בחר שם: החברים שלך יראו אותו על הלוח.</p>
      <input class="nm" maxlength="14" value="${esc(storedName())}" placeholder="טייקון" style="width:100%;padding:12px 14px;border-radius:14px;border:2px solid rgba(40,30,80,.12);font:800 18px var(--font);outline:none">
      <div class="err lead" style="color:var(--bad);margin:10px 0 0;min-height:18px"></div>
      <div class="row" style="justify-content:flex-end;margin-top:8px"><button class="btn ghost" data-a="back">לא עכשיו</button><button class="btn primary" data-a="join"><span class="ico">🚪</span>הצטרף למשחק</button></div></div>`);
    const ov = this.ui.overlay(el);
    const nameIn = el.querySelector('.nm');
    setTimeout(() => nameIn.focus(), 50);
    const go = async () => {
      const name = nameIn.value.trim() || 'טייקון';
      storeName(name);
      audio.init();
      el.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      try {
        await this.join(code, name);
        ov.close();
      } catch (ex) {
        el.querySelector('.err').textContent = ex.message;
        el.querySelectorAll('button').forEach((b) => { b.disabled = false; });
        this.net?.close();
        this.net = null;
      }
    };
    nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'join') go();
      if (a === 'back') { ov.close(); history.replaceState(null, '', location.pathname); }
    });
  }

  // ─────────────────────────────────────────── host
  async host(name) {
    this.net = new NetClient();
    await this.net.create(name);
    this.bindCommon();
    const used = new Set();
    const first = ROSTER[0].id;
    used.add(first);
    this.lobby = {
      seats: [{ kind: 'host', clientId: this.net.id, name, charId: first }],
      settings: { roundLimit: 25, startingCash: 1500, cpuDuels: 'quick', speed: 1, map: 'boomtown', noBuildFirstRound: 0 },
    };
    this.phase = 'lobby';
    this.net.on('msg', (m) => this.hostLobbyMsg(m));
    this.net.on('peer-leave', (m) => {
      if (this.phase !== 'lobby') return;
      this.lobby.seats = this.lobby.seats.filter((s) => s.clientId !== m.id);
      this.pushLobby();
    });
    history.replaceState(null, '', `?room=${this.net.room}`);
    this.pushLobby();
  }

  freeChar(pref) {
    const taken = new Set(this.lobby.seats.map((s) => s.charId));
    if (pref && !taken.has(pref) && ROSTER.some((r) => r.id === pref)) return pref;
    return ROSTER.find((r) => !taken.has(r.id))?.id || ROSTER[0].id;
  }

  hostLobbyMsg({ from, data }) {
    if (!data || this.phase !== 'lobby') return;
    const seat = this.lobby.seats.find((s) => s.clientId === from);
    if (data.k === 'hello') {
      if (seat) { seat.name = String(data.name || seat.name).slice(0, 14); }
      else if (this.lobby.seats.length < 4) {
        this.lobby.seats.push({ kind: 'guest', clientId: from, name: String(data.name || 'שחקן').slice(0, 14), charId: this.freeChar(data.charId) });
        audio.play('pop');
        this.ui.toast(`${esc(data.name || 'חבר')} הצטרף לחדר`, 'good');
      } else {
        this.net.send(from, { k: 'full' });
        return;
      }
      this.pushLobby();
    } else if (data.k === 'pick' && seat) {
      if (!this.lobby.seats.some((s) => s !== seat && s.charId === data.charId) && ROSTER.some((r) => r.id === data.charId)) seat.charId = data.charId;
      this.pushLobby();
    } else if (data.k === 'rename' && seat) {
      seat.name = String(data.name || seat.name).slice(0, 14) || seat.name;
      this.pushLobby();
    }
  }

  pushLobby() {
    this.net.send('all', { k: 'lobby', lobby: this.lobby });
    this.renderLobby();
  }

  // ─────────────────────────────────────────── guest
  async join(code, name) {
    this.net = new NetClient();
    await this.net.join(code, name);
    if (this.net.isHost) {
      // we were this room's host and reloaded — the game lived in that tab
      this.net.close();
      throw new Error('אתה אירחת את החדר הזה, והמשחק נגמר כשהלשונית נסגרה. פתח חדר חדש!');
    }
    this.bindCommon();
    this.phase = 'lobby';
    history.replaceState(null, '', `?room=${this.net.room}`);
    this.net.on('msg', (m) => this.guestMsg(m));
    this.net.on('reconnected', () => this.net.send('host', { k: 'hello', name: this.net.name }));
    this.net.send('host', { k: 'hello', name, charId: null });
    this.waitingCard();
  }

  guestMsg({ from, data }) {
    if (from !== this.net.hostId || !data) return;
    switch (data.k) {
      case 'lobby':
        if (this.phase === 'game') this.leaveGame();
        this.phase = 'lobby';
        this.lobby = data.lobby;
        this.renderLobby();
        break;
      case 'start':
      case 'sync':
        this.startGuestGame(data);
        break;
      case 'full':
        this.fatal('החדר מלא (עד 4 שחקנים).');
        break;
      default:
    }
  }

  bindCommon() {
    const net = this.net;
    net.on('host-left', () => { if (!net.isHost) this.fatal('המארח עזב את המשחק.'); });
    net.on('server-error', (e) => { if (this.phase !== 'idle' && e.code === 'kicked') this.fatal(e.msg); });
    net.on('reconnecting', () => this.banner('החיבור נפל, מתחבר מחדש…'));
    net.on('reconnected', () => this.banner(null));
    net.on('lost', () => this.fatal('החיבור לשרת המשחק אבד.'));
  }

  banner(text) {
    document.querySelector('.net-banner')?.remove();
    if (text) document.getElementById('ui').appendChild($(`<div class="net-banner">${esc(text)}</div>`));
  }

  // ─────────────────────────────────────────── lobby UI
  closeModal() { this.modal?.close(); this.modal = null; }
  titleMode(on) { document.getElementById('title')?.classList.toggle('online-mode', on); }

  waitingCard() {
    this.closeModal();
    this.titleMode(true);
    const el = $(`<div class="modal glass lobby"><h2>מצטרף…</h2><p class="lead waiting"><span class="dots"><i></i><i></i><i></i></span> אומר שלום למארח</p></div>`);
    this.modal = this.ui.overlay(el);
  }

  renderLobby() {
    if (this.phase !== 'lobby') return;
    this.titleMode(true);
    this.hooks.onMap?.(this.lobby.settings.map || 'boomtown');
    const isHost = this.net.isHost;
    const L = this.lobby;
    const link = this.net.shareLink();
    const mine = L.seats.find((s) => s.clientId === this.net.id);
    const html = `
      <h2>לובי החדר</h2>
      <div class="code"><span class="big">${this.net.room}</span><span class="link">${esc(link)}</span><button class="btn sm primary" data-a="copy">📋 העתק קישור</button></div>
      <div class="seats">${L.seats.map((s, i) => {
        const ch = rosterById(s.charId);
        const me = s === mine;
        const peer = s.clientId ? this.net.peers.get(s.clientId) : null;
        const online = s.kind === 'cpu' || s.clientId === this.net.id || peer?.connected !== false;
        return `<div class="seat ${me ? 'me' : ''}" style="--pc:${ch.color}">
          <div class="face ${me ? 'pick' : ''}" data-a="${me ? 'cycle' : ''}" title="${me ? 'החלף דמות' : ''}"><img src="${this.ui.portrait(s.charId)}" alt=""></div>
          <div><div class="nm">${me ? `<input data-f="name" maxlength="14" value="${esc(s.name)}">` : esc(s.name)} ${s.kind === 'host' ? '<span class="tag" style="background:#b37800">מארח</span>' : ''}${s.kind === 'cpu' ? '<span class="tag">מחשב</span>' : ''}</div>
            <div class="sub">${s.kind === 'cpu' ? `מחשב · ${LEVEL_HE[s.aiLevel]}` : `<span class="dot ${online ? '' : 'off'}"></span> ${online ? (me ? 'אתה' : 'מחובר') : 'מתחבר מחדש…'}`} · ${esc(ch.name)}</div></div>
          <div class="row">${isHost && s.kind === 'cpu' ? `<button class="btn sm ghost" data-a="lvl" data-i="${i}">${LEVEL_HE[s.aiLevel]}</button>` : ''}${isHost && s.kind !== 'host' ? `<button class="btn sm ghost" data-a="rm" data-i="${i}" title="הסר">✕</button>` : ''}</div>
        </div>`;
      }).join('')}
      ${L.seats.length < 4 ? `<div class="seat empty"><span>מחכים לחברים… שלחו להם את הקישור!</span>${isHost ? '<button class="btn sm ghost" data-a="cpu">＋ הוסף מחשב</button>' : ''}</div>` : ''}
      </div>
      <div class="maps">${MAP_LIST.map((m) => `<button class="map-card ${m.id === (L.settings.map || 'boomtown') ? 'on' : ''}" data-map="${m.id}" ${isHost ? '' : 'disabled'} title="${esc(m.tagline)}"><span class="flag">${m.flag}</span><b>${esc(m.name)}</b></button>`).join('')}</div>
      ${isHost ? `<div class="opts">
        <div class="opt"><label>אורך המשחק</label><div class="seg" data-o="roundLimit">${[[15, '15 סיבובים'], [25, '25 סיבובים'], [0, 'בלי הגבלה']].map(([v, l]) => `<button data-v="${v}" class="${L.settings.roundLimit === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <div class="opt"><label>כסף התחלתי</label><div class="seg" data-o="startingCash">${[1000, 1500, 2000].map((v) => `<button data-v="${v}" class="${L.settings.startingCash === v ? 'on' : ''}">₪${v}</button>`).join('')}</div></div>
        <div class="opt"><label>בנייה בסיבוב 1</label><div class="seg" data-o="noBuildFirstRound">${[[0, 'מותר'], [1, 'אסור (קלאסי)']].map(([v, l]) => `<button data-v="${v}" class="${(+L.settings.noBuildFirstRound || 0) === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      </div>` : `<p class="lead" style="margin:6px 0 0">${L.settings.roundLimit ? `${L.settings.roundLimit} סיבובים` : 'משחק בלי הגבלה'} · ₪${L.settings.startingCash} לכל אחד${+L.settings.noBuildFirstRound ? ' · אין בנייה בסיבוב 1' : ''}</p>`}
      <div class="row" style="justify-content:space-between;margin-top:14px;align-items:center">
        <button class="btn ghost" data-a="leave">עזוב</button>
        ${isHost
          ? `<button class="btn primary lg" data-a="start" ${L.seats.length < 2 ? 'disabled title="צריך לפחות 2 שחקנים"' : ''}><span class="ico">🎲</span>התחל משחק</button>`
          : '<span class="waiting"><span class="dots"><i></i><i></i><i></i></span> מחכים שהמארח יתחיל</span>'}
      </div>`;
    if (!this.modal || !this.modal.isConnected || !this.modal.querySelector('.lobby')) {
      this.closeModal();
      const el = $('<div class="modal glass lobby"></div>');
      this.modal = this.ui.overlay(el);
      el.addEventListener('click', (e) => this.lobbyClick(e));
      el.addEventListener('change', (e) => {
        if (e.target.dataset.f !== 'name') return;
        const name = e.target.value.trim().slice(0, 14);
        if (!name) return;
        storeName(name);
        if (this.net.isHost) { const s = this.lobby.seats.find((x) => x.clientId === this.net.id); s.name = name; this.pushLobby(); } else this.net.send('host', { k: 'rename', name });
      });
    }
    const box = this.modal.querySelector('.lobby');
    const focused = document.activeElement?.dataset?.f === 'name' && box.contains(document.activeElement);
    if (focused) return; // don't clobber an input being typed in
    box.innerHTML = html;
  }

  lobbyClick(e) {
    const mapBtn = e.target.closest('[data-map]');
    if (mapBtn && this.net.isHost) {
      this.lobby.settings.map = mapBtn.dataset.map;
      audio.play('pop', { pitch: 1.2 });
      this.pushLobby();
      return;
    }
    const b = e.target.closest('[data-a]');
    const seg = e.target.closest('.seg[data-o]');
    if (seg && this.net.isHost) {
      const v = +e.target.closest('button')?.dataset.v;
      if (Number.isNaN(v)) return;
      this.lobby.settings[seg.dataset.o] = v;
      audio.play('click');
      this.pushLobby();
      return;
    }
    if (!b || !b.dataset.a) return;
    const a = b.dataset.a;
    const L = this.lobby;
    audio.play('click');
    if (a === 'copy') {
      const link = this.net.shareLink();
      copyText(link).then((ok) => this.ui.toast(ok ? 'הקישור הועתק! שלחו אותו לחברים' : `העתיקו את הקישור: ${esc(link)}`, ok ? 'good' : ''));
    } else if (a === 'cycle') {
      const mine = L.seats.find((s) => s.clientId === this.net.id);
      const taken = new Set(L.seats.filter((s) => s !== mine).map((s) => s.charId));
      let idx = ROSTER.findIndex((r) => r.id === mine.charId);
      for (let n = 0; n < ROSTER.length; n++) { idx = (idx + 1) % ROSTER.length; if (!taken.has(ROSTER[idx].id)) break; }
      if (this.net.isHost) { mine.charId = ROSTER[idx].id; this.pushLobby(); } else this.net.send('host', { k: 'pick', charId: ROSTER[idx].id });
      audio.play('pop');
    } else if (a === 'cpu' && this.net.isHost && L.seats.length < 4) {
      const charId = this.freeChar();
      L.seats.push({ kind: 'cpu', clientId: null, name: rosterById(charId).name, charId, aiLevel: 'normal' });
      this.pushLobby();
    } else if (a === 'lvl' && this.net.isHost) {
      const s = L.seats[+b.dataset.i];
      s.aiLevel = { easy: 'normal', normal: 'hard', hard: 'easy' }[s.aiLevel];
      this.pushLobby();
    } else if (a === 'rm' && this.net.isHost) {
      const s = L.seats[+b.dataset.i];
      if (s.kind === 'guest') this.net.kick(s.clientId);
      L.seats.splice(+b.dataset.i, 1);
      this.pushLobby();
    } else if (a === 'leave') {
      this.leave();
    } else if (a === 'start' && this.net.isHost && L.seats.length >= 2) {
      this.startHostGame();
    }
  }

  // ─────────────────────────────────────────── game start
  async startHostGame() {
    const L = this.lobby;
    const state = createGame({
      players: L.seats.map((s) => ({ charId: s.charId, name: s.name, isAI: s.kind === 'cpu', aiLevel: s.aiLevel || 'normal' })),
      settings: { ...L.settings },
    });
    state.online = true;
    const seats = L.seats.map((s) => ({ kind: s.kind, clientId: s.clientId || null }));
    this.phase = 'game';
    this.closeModal();
    this.net.send('all', { k: 'start', state, seats });
    await this.hooks.beforeGame();
    this.P.attach(state, { me: 0, localPids: [0] });
    const host = new HostSession({ net: this.net, presenter: this.P, ui: this.ui, state, seats });
    this.session = host;
    const controllers = seats.map((s, pid) => (s.kind === 'host' ? new HumanController(host.proxy)
      : s.kind === 'guest' ? new RemoteController(host, pid) : new AIController(host.proxy)));
    this.engine = new GameEngine(state, { presenter: host.proxy, controllers });
    window.__game = { engine: this.engine, presenter: this.P, state, session: host };
    this.P.onGameOverChoice = (c) => this.gameOver(c);
    this.emoteBar(0);
    this.engine.run().catch((err) => { console.error(err); this.ui.toast(`משהו נשבר: ${err.message}`, 'bad'); });
  }

  async startGuestGame({ state, seats, me }) {
    const mePid = me ?? seats.findIndex((s) => s?.clientId === this.net.id);
    if (this.phase === 'game') this.leaveGame();
    this.phase = 'game';
    this.closeModal();
    await this.hooks.beforeGame();
    clock.scale = state.settings.speed || 1;
    this.P.attach(state, { me: mePid >= 0 ? mePid : null, localPids: mePid >= 0 ? [mePid] : [] });
    this.session = new GuestSession({ net: this.net, presenter: this.P, ui: this.ui, state, me: mePid >= 0 ? mePid : null });
    window.__game = { presenter: this.P, state, session: this.session };
    this.P.onGameOverChoice = (c) => this.gameOver(c);
    this.emoteBar(mePid);
    if (mePid < 0) this.ui.toast('הצטרפת באמצע משחק: אתה צופה מהצד', 'good');
  }

  emoteBar(mePid) {
    document.getElementById('emotes')?.remove();
    if (mePid == null || mePid < 0) return;
    const bar = $(`<div id="emotes" class="glass">${EMOTES.map((e) => `<button data-e="${e}" title="תגובה">${e}</button>`).join('')}</div>`);
    let last = 0;
    bar.addEventListener('click', (ev) => {
      const e = ev.target.closest('[data-e]')?.dataset.e;
      if (!e || performance.now() - last < 1200) return;
      last = performance.now();
      if (this.net.isHost) { this.P.emote(mePid, e); this.net.send('all', { k: 'emote', pid: mePid, e }); } else this.net.send('host', { k: 'emote', e });
    });
    document.getElementById('ui').appendChild(bar);
  }

  leaveGame() {
    document.getElementById('emotes')?.remove();
    this.session?.dispose();
    this.session = null;
    if (this.engine) this.engine.stopped = true;
    this.engine = null;
    this.P.detach();
    document.querySelectorAll('.overlay').forEach((o) => o.remove());
  }

  gameOver(choice) {
    if (choice === 'menu') { this.leave(); return; }
    if (this.net.isHost) {
      this.leaveGame();
      this.hooks.resetBoard?.();
      this.phase = 'lobby';
      this.pushLobby();
    } else {
      this.ui.toast('מחכים שהמארח יתחיל משחק נוסף…');
    }
  }

  fatal(msg) {
    this.banner(null);
    const wasGame = this.phase === 'game';
    if (wasGame) this.leaveGame();
    this.closeModal();
    this.phase = 'idle';
    const el = $(`<div class="modal glass" style="width:min(420px,92vw);text-align:center"><div style="font-size:54px">📡</div><h2>${esc(msg)}</h2>
      <div class="row" style="justify-content:center;margin-top:12px"><button class="btn primary">חזרה לתפריט הראשי</button></div></div>`);
    const ov = this.ui.overlay(el);
    el.querySelector('button').addEventListener('click', () => { ov.close(); this.leave(); });
  }

  leave() {
    this.net?.close();
    this.net = null;
    this.phase = 'idle';
    location.href = location.pathname; // clean slate
  }
}
