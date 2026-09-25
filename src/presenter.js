// The Presenter turns engine beats into cinematic moments. The engine awaits
// every method, so pacing lives here: camera moves, hops, coin streams,
// construction, duels, jail, bankruptcies and the day/night cycle.
import * as THREE from "three";
import { TILES, DISTRICTS, BOARD_SIZE, JAIL_INDEX, isOwnable, districtTiles } from "./game/board.js";
import { CONFIG, TIME_PHASES, LEVEL_NAMES } from "./game/config.js";
import { rosterById } from "./game/roster.js";
import * as R from "./game/rules.js";
import { aiSkill } from "./game/controllers.js";
import { tween, Ease, wait, every, clock } from "./core/tween.js";
import { DUEL_KEYS, input } from "./core/input.js";
import { audio } from "./audio/audio.js";
import { Pawn } from "./render/characters.js";
import { pawnSpot, tileSide, sideYaw, tileLocal, tileCenter, isCorner, BAND, HALF } from "./render/layout.js";
import { money, $ } from "./ui/ui.js";
import { MINIGAMES } from "./minigames/index.js";
import { runHeist } from "./minigames/heist.js";
import { runAuction } from "./minigames/auction.js";
import { rand } from "./core/rng.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Presenter {
  constructor(world) {
    Object.assign(this, world); // stage, env, board, buildings, fx, cam, dice, labels, ui
    this.pawns = new Map();
    this.state = null;
    this.tilePick = null;
    this.mode = null;
    this.posters = new Map();
    this.envTime = 0;
    this.statue = null;
    this.statueId = null;
    this.marker = this.makeMarker();
    this.bindPointer();
  }

  // ───────────────────────────────────────────── setup
  attach(state, { me = null, localPids = null } = {}) {
    this.state = state;
    this.me = me;
    this.localPids = localPids ? new Set(localPids) : null;
    // city map: rename the board before anything is drawn from it
    const mapId = state.settings.map || 'boomtown';
    if (this.board.mapId !== mapId) { this.board.setMap(mapId); this.buildings.refreshAll(); }
    clock.scale = state.settings.speed || 1;
    for (const p of state.players) {
      const pawn = new Pawn(p.charId);
      this.stage.scene.add(pawn.root);
      this.pawns.set(p.id, pawn);
      if (p.bankrupt) pawn.root.visible = false;
    }
    for (const p of state.players) this.pawnOf(p).root.position.copy(this.restSpot(p));
    for (const p of state.players) this.pawnOf(p).faceTowards(V(0, 0, 0), true);
    for (const i of Object.keys(state.tiles)) this.syncTile(+i);
    this.envTime = state.timePhase;
    this.env.setTime(this.envTime, true);
    this.ui.buildHUD(state, { me });
    this.ui.setClock(state.round, state.timePhase);
    this.syncPlayers();
    this.updateStatue(true);
  }

  detach() {
    for (const pawn of this.pawns.values()) { this.stage.scene.remove(pawn.root); pawn.dispose(); }
    this.pawns.clear();
    for (const l of this.posters.values()) l.remove();
    this.posters.clear();
    this.labels.clear();
    this.marker.visible = false;
    if (this.statue) { this.board.statueSlot.remove(this.statue.root); this.statue = null; this.statueId = null; }
    this.board.setMarked([]);
    this.ui.clearHUD();
    this.state = null;
  }

  makeMarker() {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff', emissiveIntensity: 0.6, roughness: 0.3 });
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), m);
    gem.scale.y = 1.5;
    g.add(gem);
    g.visible = false;
    g.userData.mat = m;
    this.stage.scene.add(g);
    return g;
  }

  // ───────────────────────────────────────────── per-frame
  update(dt, t) {
    const cp = this.stage.camera.position;
    for (const pawn of this.pawns.values()) {
      // idle pawns turn to face the camera — they always "look at you"
      if (!pawn.anim && pawn.idle && pawn.faceCamera !== false) {
        const p = pawn.root.position;
        pawn.targetFacing = Math.atan2(cp.x - p.x, cp.z - p.z);
      }
      pawn.update(dt, t, this.stage.camera);
    }
    if (this.statue) this.statue.update(dt, t, this.stage.camera);
    const s = this.state;
    if (s && this.marker.visible) {
      const p = s.players[s.turn];
      const pawn = this.pawnOf(p);
      if (pawn) {
        this.marker.position.copy(pawn.root.position).add(V(0, 1.55 + Math.sin(t * 3) * 0.1, 0));
        this.marker.rotation.y += dt * 2.5;
      }
    }
  }

  // ───────────────────────────────────────────── helpers
  pawnOf(p) { return this.pawns.get(typeof p === 'number' ? p : p.id); }
  /** Is this player controlled on this screen? (offline: every human) */
  isLocal(p) { return this.localPids ? this.localPids.has(p.id) : !p.isAI; }
  autoOf(auto, delay) {
    if (auto == null || auto === '') return null;
    if (auto.then) return { promise: auto };
    return { id: auto, delay };
  }
  /** Online spectators: show that someone else is deciding until they answer. */
  async spectateMenu(ctx, promise) {
    this.ui.thinking(ctx.player);
    const r = await promise;
    this.ui.hideDock();
    return r;
  }
  headPos(p) { return this.pawnOf(p).root.position.clone().add(V(0, 1.1, 0)); }
  color(p) { return rosterById(p.charId).color; }
  name(p) { return `<b style="color:${this.color(p)}">${p.name}</b>`; }

  restSpot(p) {
    const s = this.state;
    if (p.inJail) {
      const v = new THREE.Vector3();
      this.board.jailCell.getWorldPosition(v);
      const inmates = s.players.filter((o) => o.inJail && !o.bankrupt);
      const k = inmates.indexOf(p);
      return v.add(V((k - (inmates.length - 1) / 2) * 0.45, 0.1, 0));
    }
    const here = s.players.filter((o) => !o.bankrupt && !o.inJail && o.pos === p.pos);
    const slot = here.length <= 1 ? 0 : here.indexOf(p) + 1;
    return pawnSpot(p.pos, slot).setY(0.1);
  }

  async arrange(idx, except = null) {
    const s = this.state;
    const jobs = s.players.filter((o) => !o.bankrupt && o.pos === idx && o !== except && !o.inJail).map((o) => {
      const to = this.restSpot(o);
      const pawn = this.pawnOf(o);
      if (pawn.root.position.distanceTo(to) < 0.05) return null;
      return pawn.hopTo(to, { height: 0.25, duration: 0.2 });
    });
    await Promise.all(jobs);
  }

  /** Hop every idle pawn to its proper slot (after swaps, mobs, jail, moves). */
  async settleAll() {
    const s = this.state;
    if (!s) return;
    const jobs = [];
    for (const o of s.players) {
      if (o.bankrupt) continue;
      const pawn = this.pawnOf(o);
      if (!pawn || pawn.anim) continue;
      const to = this.restSpot(o);
      if (pawn.root.position.distanceTo(to) > 0.05) jobs.push(pawn.hopTo(to, { height: 0.25, duration: 0.22 }));
    }
    await Promise.all(jobs);
  }

  /** Settle after the engine commits a state change that follows this beat. */
  settleSoon() { wait(0.05).then(() => this.settleAll()); }

  syncTile(i) {
    const ts = this.state.tiles[i];
    if (!ts) return;
    const owner = ts.owner !== null ? this.state.players[ts.owner] : null;
    this.buildings.sync(i, ts, owner ? this.color(owner) : null);
  }

  tileFocus(i) {
    const c = isCorner(i) ? tileCenter(i) : tileLocal(i, 0, 0, -0.1);
    return c.setY(0.6);
  }

  tileShot(i, { dist = 9, pitch = 0.52, yawOff = 0.42, dur = 0.9, lambda = null } = {}) {
    const side = tileSide(i);
    const shot = { target: this.tileFocus(i), yaw: sideYaw(side) + yawOff, pitch, dist, fov: 34 };
    this.cam.unfollow();
    if (lambda) { this.cam.shot(shot, lambda); return Promise.resolve(); }
    return this.cam.move(shot, dur, Ease.inOutCubic);
  }

  followShot(p, { dist = 13, pitch = 0.6, lambda = 2.4 } = {}) {
    const pawn = this.pawnOf(p);
    this.cam.follow(pawn.root, V(0, 0.4, 0));
    this.cam.shot({ yaw: sideYaw(tileSide(p.pos)) + 0.38, pitch, dist, fov: 34 }, lambda);
  }

  overview(dur = 1.4, yaw = null) {
    this.cam.unfollow();
    const s = this.state;
    const y = yaw ?? (s ? sideYaw(tileSide(s.players[s.turn].pos)) + Math.PI / 4 : Math.PI / 4);
    return this.cam.move({ target: V(0, 0, 0), yaw: y, pitch: 0.92, dist: 44, fov: 34 }, dur, Ease.inOutCubic);
  }

  entityPos(x) {
    if (x === 'bank') return V(0, 7, 0);
    if (x === 'vault') return this.board.vaultTop.clone();
    return this.headPos(x);
  }

  // ───────────────────────────────────────────── pointer (hover / pick)
  bindPointer() {
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let tip = null, tipIdx = -1, lastMove = 0;
    const dom = this.stage.renderer.domElement;
    const pick = (e) => {
      ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, this.stage.camera);
      const hit = ray.intersectObjects(this.board.pickables, false)[0];
      return hit ? hit.object.userData.tile : -1;
    };
    dom.addEventListener('pointermove', (e) => {
      if (!this.state || this.stage.activeScene !== this.stage.scene) return;
      const now = performance.now();
      if (now - lastMove < 40) return;
      lastMove = now;
      const i = pick(e);
      if (i === tipIdx) return;
      tipIdx = i;
      tip?.remove(); tip = null;
      if (i < 0) { this.board.hover.visible = false; dom.style.cursor = ''; return; }
      this.board.placeHighlight(this.board.hover, i, this.tilePick?.allowed.includes(i) ? 0.95 : 0.35);
      dom.style.cursor = this.tilePick?.allowed.includes(i) ? 'pointer' : isOwnable(TILES[i]) ? 'help' : '';
      const t = TILES[i];
      const ts = this.state.tiles[i];
      let sub = '';
      if (isOwnable(t)) {
        if (ts.owner === null) sub = `למכירה · ${money(t.price)}`;
        else {
          const o = this.state.players[ts.owner];
          sub = `של ${o.name}${t.type === 'property' ? ` · ${LEVEL_NAMES[ts.level]}` : ''}${ts.mortgaged ? ' · ממושכן' : ` · שכירות ${money(R.rentFor(this.state, i, 7).amount)}`}`;
        }
        if (this.tilePick?.allowed.includes(i)) sub = `לחץ לשדרוג · ${money(R.buildCost(i))}`;
      } else sub = { go: 'בכל מעבר כאן מקבלים ₪200', jail: 'הכלא', heist: `פרוץ את הכספת · ${money(this.state.vault)}`, gotojail: 'ישר לכלא', news: 'קלף מבזק חדשות', fortune: 'קלף מזל', tax: `שלם ₪${t.amount} לכספת` }[t.type] || '';
      const el = $(`<div class="tile-tip" style="--tc:${t.district ? DISTRICTS[t.district].color : '#8c93a8'}">${t.name}<small>${sub}</small></div>`);
      tip = this.labels.add(el, tileCenter(i).setY(0.6), { offsetY: -10 });
    });
    dom.addEventListener('click', (e) => {
      if (this.stage.activeScene !== this.stage.scene) return;
      if (!this.state || this.cam.dragging) { this.cam.dragging = false; return; }
      const i = pick(e);
      if (i < 0) return;
      if (this.tilePick && this.tilePick.allowed.includes(i)) { this.tilePick.resolve(i); return; }
      if (isOwnable(TILES[i]) && !this.busyCard) {
        this.ui.propCard(i, this.state);
        clearTimeout(this.infoTimer);
        this.infoTimer = setTimeout(() => { if (!this.busyCard) this.ui.hidePropCard(); }, 3500);
      }
    });
  }

  // ───────────────────────────────────────────── HUD sync
  syncPlayers() {
    const s = this.state;
    if (!s) return;
    this.ui.syncPlayers(s);
    this.ui.setVault(s.vault);
    this.board.setVault(s.vault);
    this.ui.setHype(s.hype);
    // bounty posters
    const wantedId = s.bounty?.playerId ?? null;
    for (const [pid, l] of this.posters) if (pid !== wantedId) { l.remove(); this.posters.delete(pid); }
    if (wantedId !== null && !this.posters.has(wantedId)) {
      const p = s.players[wantedId];
      const el = $(`<div class="wanted"><small>מבוקש</small><img src="${this.ui.pimg(p)}"><div class="amt">${money(s.bounty.amount)}</div><small>פרס</small></div>`);
      this.posters.set(wantedId, this.labels.add(el, () => this.pawnOf(p).root.position.clone().add(V(0, 2.25, 0)), { scaleWithDistance: true }));
    } else if (wantedId !== null) {
      this.posters.get(wantedId).el.querySelector('.amt').textContent = money(s.bounty.amount);
    }
  }

  updateStatue(instant = false) {
    const s = this.state;
    if (!s) return;
    const top = R.standings(s)[0];
    if (!top || top.id === this.statueId) return;
    const p = s.players[top.id];
    if (this.statue) this.board.statueSlot.remove(this.statue.root);
    this.statue = new Pawn(p.charId, { gold: true, scale: 1.6 });
    this.statue.root.rotation.y = Math.PI / 4;
    this.statue.lookTarget = null;
    this.board.statueSlot.add(this.statue.root);
    this.statueId = top.id;
    if (!instant) {
      const wp = new THREE.Vector3(); this.board.statueSlot.getWorldPosition(wp);
      this.fx.sparks(wp.add(V(0, 1, 0)), { count: 30, color: '#ffe38a', speed: 3 });
      this.statue.root.scale.setScalar(0.01);
      tween({ duration: 0.6, ease: Ease.outBack, onUpdate: (t, e) => this.statue?.root.scale.setScalar(1.6 * Math.max(0.01, e)) });
    }
  }

  // ═════════════════════════════════════════════ ENGINE BEATS
  async gameStart(state) {
    audio.setMood(state.timePhase === 3 ? 'night' : 'board');
    this.ui.setHUDVisible(true);
    const first = state.players[state.turn];
    this.cam.move({ target: V(0, 0, 0), yaw: Math.PI / 4 - 0.6, pitch: 1.05, dist: 52 }, 0.01);
    await this.cam.move({ target: V(0, 0, 0), yaw: Math.PI / 4, pitch: 0.9, dist: 42 }, 2.2, Ease.inOutCubic);
    await this.ui.banner({ title: state.round === 1 ? 'יאללה!' : 'ברוכים השבים!', subtitle: `${state.players.length} טייקונים · ${state.settings.roundLimit ? `${state.settings.roundLimit} סיבובים` : 'האחרון שנשאר מנצח'}`, icon: '🎲', color: this.color(first), duration: 1.4 });
  }

  async turnStart(p) {
    const s = this.state;
    this.ui.syncPlayers(s);
    this.ui.setClock(s.round, s.timePhase);
    this.ui.hidePropCard();
    this.mode = null;
    this.marker.visible = true;
    this.marker.userData.mat.color.set(this.color(p));
    this.marker.userData.mat.emissive.set(this.color(p));
    this.cam.resetUser();
    const pawn = this.pawnOf(p);
    this.cam.follow(pawn.root, V(0, 0.4, 0));
    this.cam.move({ target: pawn.root.position.clone().add(V(0, 0.4, 0)), yaw: sideYaw(tileSide(p.pos)) + 0.38, pitch: 0.6, dist: 13, fov: 34 }, 1.0, Ease.inOutCubic);
    this.ui.pulsePlayer(p.id);
    pawn.wave();
    audio.play('whoosh', { vol: 0.35 });
    await this.ui.banner({ title: this.isLocal(p) ? `${p.name}, תורך!` : `התור של ${p.name}`, subtitle: p.inJail ? '🔒 בכלא' : s.bounty?.playerId === p.id ? `🎯 מבוקש · פרס של ${money(s.bounty.amount)}` : '', kind: 'turn', color: this.color(p), avatar: this.ui.pimg(p), duration: p.isAI ? 0.75 : 0.95 });
    this.ui.feed(`התור של ${this.name(p)}`, this.color(p));
  }

  async rollDice(p, dice, { jail = false } = {}) {
    this.ui.hideDock();
    const pawn = this.pawnOf(p);
    const dir = pawn.root.position.clone().setY(0);
    if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
    dir.normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    this.cam.unfollow();
    this.cam.move({ target: V(0, 0.3, 0), yaw, pitch: 1.0, dist: 12.5, fov: 34 }, 0.7, Ease.inOutCubic);
    this.dice.setColor(this.color(p));
    audio.play('shake');
    await wait(0.35);
    audio.play('whoosh', { vol: 0.5, len: 0.6 });
    const pts = await this.dice.roll(dice, dir, (v) => {
      audio.play('dice', { vol: Math.min(1, v / 12) });
      if (v > 6) this.cam.shake(0.02 * Math.min(v, 12) / 6);
    });
    const total = dice[0] + dice[1];
    const c = this.dice.center().add(V(0, 0.6, 0));
    this.fx.sparks(c, { count: 18, color: this.color(p), speed: 2.5, size: 0.2 });
    this.labels.float(`${total}`, c, 'dice-total', { life: 1.5, rise: 60 });
    audio.play('pop', { pitch: 0.8 + total * 0.05 });
    if (dice[0] === dice[1]) {
      this.fx.confetti(c, { count: 40, speed: 3 });
      this.labels.float('דאבל!', c.clone().add(V(0, 0.8, 0)), 'float-money gold', { life: 1.6, rise: 70 });
      audio.play('sparkle');
    }
    void pts;
    await wait(0.9);
    this.ui.feed(`${this.name(p)} הטיל <b>${dice[0]} + ${dice[1]}</b>${dice[0] === dice[1] ? ' · דאבל!' : ''}${jail ? ' בכלא' : ''}`, this.color(p));
  }

  async doublesAgain(p) {
    await this.ui.banner({ title: 'דאבל!', subtitle: 'הטל שוב', icon: '🎲', color: this.color(p), duration: 0.8 });
  }

  async movePawn(p, from, steps, { salary = 0 } = {}) {
    const pawn = this.pawnOf(p);
    const n = Math.abs(steps);
    const dirn = Math.sign(steps) || 1;
    const dur = n > 8 ? 0.2 : n > 4 ? 0.24 : 0.28;
    pawn.idle = false;
    this.cam.follow(pawn.root, V(0, 0.4, 0));
    let side = tileSide(from);
    this.cam.shot({ yaw: sideYaw(side) + 0.38, pitch: 0.62, dist: 12.5, fov: 34 }, 2.6);
    // leave the jail cell first if needed
    let idx = from;
    for (let k = 1; k <= n; k++) {
      idx = (idx + dirn + BOARD_SIZE) % BOARD_SIZE;
      const last = k === n;
      const to = last ? this.restSpotAt(p, idx) : pawnSpot(idx, 0).setY(0.1);
      audio.play('hop', { pitch: 0.9 + k * (0.5 / Math.max(4, n)) });
      await pawn.hopTo(to, { height: last ? 0.8 : 0.45, duration: last ? dur * 1.5 : dur, spin: last && n >= 10 ? Math.PI * 2 : 0 });
      this.board.dipTile(idx, last ? 0.14 : 0.05);
      if (tileSide(idx) !== side && !isCorner(idx)) {
        side = tileSide(idx);
        this.cam.shot({ yaw: sideYaw(side) + 0.38 }, 2.2);
      }
      if (idx === 0 && salary && dirn > 0) {
        const gp = pawn.root.position.clone().add(V(0, 1.2, 0));
        this.fx.coinFountain(gp, 16);
        this.labels.float(`+${money(salary)} משכורת`, gp, 'float-money up', { life: 1.8, rise: 80 });
        audio.play('cash');
        this.ui.syncPlayers(this.state);
        this.ui.feed(`${this.name(p)} קיבל משכורת: <b>+${money(salary)}</b>`, '#1fcf86');
      }
      if (!last) this.fx.dust(pawn.root.position.clone(), 3, 0.35);
    }
    audio.play('land');
    this.fx.dust(pawn.root.position.clone(), 10, 0.6);
    this.fx.ring(pawn.root.position.clone(), { color: this.color(p), radius: 1.4 });
    this.cam.punch(-1.5);
    pawn.idle = true;
    await this.settleAll();
  }

  restSpotAt(p, idx) {
    const saved = p.pos;
    p.pos = idx;
    const v = this.restSpot(p);
    p.pos = saved;
    return v;
  }

  async landed(p, pos) {
    const t = TILES[pos];
    if (isOwnable(t)) await this.tileShot(pos, { dist: 9.5, dur: 0.8 });
    else if (!isCorner(pos)) await this.tileShot(pos, { dist: 8.5, dur: 0.7 });
  }

  async homeTurf(p, idx) {
    const pawn = this.pawnOf(p);
    this.labels.float('אצלי בבית!', this.headPos(p), 'float-text', { life: 1.4 });
    pawn.celebrate();
    audio.play('sparkle', { vol: 0.5 });
    await wait(0.9);
  }

  async toast(text, kind = '') {
    this.ui.toast(text, kind);
    this.ui.feed(text, kind === 'bad' ? '#ff4d5e' : '#7b5cff');
    await wait(0.9);
  }

  // ───────────────────────────────────────────── money
  async money(from, to, amount, reason, opts = {}) {
    const s = this.state;
    const isP = (x) => x && typeof x === 'object';
    const a = this.entityPos(from), b = this.entityPos(to);
    const count = Math.max(3, Math.min(26, Math.round(amount / 18)));
    if (isP(from)) this.labels.float(`−${money(amount)}`, a, 'float-money down', { life: 1.6 });
    const vaultTouched = from === 'vault' || to === 'vault';
    if (!opts.quiet) {
      if (opts.big) { this.cam.shake(0.25); audio.play('impact', { vol: 0.5 }); }
      const far = a.distanceTo(b);
      if (isP(from) && isP(to) && far > 12) {
        const mid = a.clone().add(b).multiplyScalar(0.5).setY(0);
        this.cam.unfollow();
        this.cam.move({ target: mid, dist: Math.min(40, 14 + far * 0.8), pitch: 0.85 }, 0.6);
      }
      if (isP(from) && amount >= 100) this.pawnOf(from).sad();
      await this.fx.coinStream(a, b, count, { duration: opts.fast ? 0.5 : 0.75, stagger: opts.quick ? 0.02 : 0.04 });
    }
    if (isP(to)) {
      this.labels.float(`+${money(amount)}`, b, 'float-money up', { life: 1.6 });
      if (!opts.quiet) this.pawnOf(to).squash(0.2, 0.15);
    }
    if (amount >= 150 || opts.big) audio.play('cash');
    this.syncPlayers();
    if (vaultTouched) this.ui.setVault(s.vault, true);
    const nm = (x) => (x === 'bank' ? 'הבנק' : x === 'vault' ? 'הכספת' : this.name(x));
    this.ui.feed(`${nm(from)} → ${nm(to)} <b>${money(amount)}</b> <span style="opacity:.7">${reason || ''}</span>`, isP(from) ? this.color(from) : isP(to) ? this.color(to) : '#ffc83d');
    if (opts.big && isP(from)) await this.ui.banner({ title: reason?.toUpperCase() || 'אאוץ׳!', subtitle: `${from.name} משלם ${money(amount)}`, color: '#ff4d5e', icon: '💸', duration: 0.9 });
    await wait(opts.quick ? 0.1 : 0.35);
  }

  async cannotPay(p, amount, reason) {
    this.ui.toast(`${p.name} לא יכול לכסות ${money(amount)}!`, 'bad');
    await wait(0.6);
  }

  // ───────────────────────────────────────────── property
  async purchased(p, idx, { price, auction } = {}) {
    this.busyCard = true;
    const pawn = this.pawnOf(p);
    await this.tileShot(idx, { dist: 8.5, dur: 0.6 });
    const plot = this.buildings.plotWorld(idx).add(V(0, 0.4, 0));
    const stream = this.fx.coinStream(this.headPos(p), plot, 12, { duration: 0.6, stagger: 0.03 });
    this.ui.propCard(idx, this.state, { stamp: { text: 'נמכר!', good: true } });
    audio.play('buy');
    await stream;
    this.fx.pillar(plot.clone().setY(0), this.color(p), 7, 1.3);
    this.fx.confetti(plot.clone().add(V(0, 1, 0)), { count: 70, colors: [this.color(p), '#ffffff', '#ffd166'] });
    await this.buildings.construct(idx, TILES[idx].type === 'property' ? 0 : -1, this.color(p));
    this.syncPlayers();
    pawn.celebrate();
    this.labels.float(auction ? 'זכייה במכירה!' : 'נמכר!', plot.clone().add(V(0, 1, 0)), 'float-text', { life: 1.5 });
    this.ui.feed(`${this.name(p)} קנה את <b>${TILES[idx].name}</b> ב-${money(price ?? TILES[idx].price)}`, this.color(p));
    await wait(0.8);
    this.ui.hidePropCard();
    this.busyCard = false;
  }

  async build(idx, p, { free = false } = {}) {
    const ts = this.state.tiles[idx];
    await this.tileShot(idx, { dist: 7.5 + ts.level * 0.6, pitch: 0.42, dur: 0.6 });
    const plot = this.buildings.plotWorld(idx).add(V(0, 0.5, 0));
    if (!free) this.fx.coinStream(this.headPos(p), plot, 8, { duration: 0.55, sound: false });
    audio.play('hammer'); audio.play('hammer', { delay: 0.12, pitch: 1.2 });
    await this.buildings.construct(idx, ts.level, this.color(p));
    const top = this.buildings.topOf(idx);
    this.fx.sparks(top, { count: 30, colors: [this.color(p), '#ffd166', '#ffffff'], speed: 3 });
    audio.play('sparkle');
    this.labels.float(`${LEVEL_NAMES[ts.level].toUpperCase()}!`, top, 'float-text', { life: 1.5 });
    this.syncPlayers();
    this.ui.feed(`${this.name(p)} שדרג את <b>${TILES[idx].name}</b> ל${LEVEL_NAMES[ts.level]}${free ? ' (בחינם!)' : ''}`, this.color(p));
    if (ts.level === CONFIG.maxLevel) {
      this.fx.firework(top.clone());
      this.fx.firework(top.clone().add(V(1, 0, 1)));
      this.cam.shake(0.2);
      await this.ui.banner({ title: 'אייקון!', subtitle: `${TILES[idx].name} הוא עכשיו אייקון של העיר`, icon: '🏆', color: this.color(p), duration: 1.3 });
    } else await wait(0.35);
  }

  async demolish(idx, p, refund) {
    await this.tileShot(idx, { dist: 8.5, dur: 0.5 });
    await this.buildings.crumble(idx, this.state.tiles[idx].level);
    this.labels.float(`+${money(refund)}`, this.buildings.topOf(idx), 'float-money up', { life: 1.4 });
    audio.play('coin');
    this.syncPlayers();
    this.ui.feed(`${this.name(p)} מכר שדרוג ב<b>${TILES[idx].name}</b> (+${money(refund)})`, this.color(p));
  }

  async mortgage(idx, p, on, value) {
    await this.tileShot(idx, { dist: 8.5, dur: 0.5 });
    this.syncTile(idx);
    audio.play(on ? 'hammer' : 'unlock');
    this.fx.dust(this.buildings.plotWorld(idx), 10, 0.6);
    this.labels.float(`${on ? '+' : '−'}${money(value)}`, this.buildings.topOf(idx), `float-money ${on ? 'up' : 'down'}`, { life: 1.4 });
    this.syncPlayers();
    this.ui.feed(`${this.name(p)} ${on ? 'לקח משכנתא על' : 'פדה את'} <b>${TILES[idx].name}</b>`, this.color(p));
    await wait(0.4);
  }

  async refreshTiles(indices) {
    for (const i of indices) this.syncTile(i);
    this.syncPlayers();
  }

  async takeover(p, owner, idx, price) {
    await this.tileShot(idx, { dist: 8, dur: 0.6 });
    audio.play('duel', { vol: 0.6 });
    const plot = this.buildings.plotWorld(idx).add(V(0, 0.5, 0));
    await this.fx.coinStream(this.headPos(p), this.headPos(owner), 20, { duration: 0.8 });
    this.syncTile(idx);
    this.fx.confetti(plot.clone().add(V(0, 1.2, 0)), { count: 80, colors: [this.color(p), '#ffffff'] });
    this.fx.pillar(plot.clone().setY(0), this.color(p), 7, 1.2);
    this.cam.shake(0.3);
    this.pawnOf(owner).angry();
    this.pawnOf(p).celebrate();
    this.syncPlayers();
    this.ui.feed(`${this.name(p)} ביצע <b>השתלטות עוינת</b> על ${TILES[idx].name} מידי ${this.name(owner)}!`, '#7b5cff');
    await this.ui.banner({ title: 'השתלטות עוינת!', subtitle: `${p.name} חוטף את ${TILES[idx].name} ב-${money(price)}`, icon: '🏢', color: '#7b5cff', duration: 1.4 });
  }

  async rentDodged(p, owner, idx, amount) {
    this.labels.float('חמק!', this.headPos(p), 'float-money up', { life: 1.8 });
    this.fx.confetti(this.headPos(p), { count: 50, colors: [this.color(p), '#fff'] });
    this.pawnOf(p).celebrate();
    this.pawnOf(owner).angry();
    audio.play('win', { vol: 0.6 });
    this.ui.feed(`${this.name(p)} ניצח בדו-קרב וחסך שכירות של ${money(amount)}!`, this.color(p));
    await wait(1.2);
  }

  // ───────────────────────────────────────────── choices (human & AI)
  buyChoice(ctx, auto) {
    const { player: p, tile: t, canAfford, state: s } = ctx;
    this.busyCard = true;
    const d = t.district ? DISTRICTS[t.district] : null;
    const note = d ? `${d.shift === 'day' ? '☀ עסק יום' : '☾ עסק לילה'}: שכירות ×${CONFIG.primeTimeMultiplier} ${d.shift === 'day' ? 'באור יום' : 'אחרי החשכה'}. יש לך ${R.districtOwnedCount(s, p.id, t.district)} מתוך ${districtTiles(t.district).length} ב${d.name}.` : '';
    return this.ui.propCard(t.index, s, {
      note,
      auto: this.autoOf(auto, 1.0),
      buttons: [
        { id: 'buy', label: 'קנה', sub: canAfford ? `יישאר לך ${money(p.cash - t.price)}` : `יש לך רק ${money(p.cash)}`, icon: '🏷️', kind: 'primary', cost: money(t.price), disabled: !canAfford, hotkey: 'Space' },
        { id: 'auction', label: 'מכירה פומבית', sub: 'כולם מתחרים: החזיקו את המקש!', icon: '🔨', kind: 'ghost', hotkey: 'KeyA' },
      ],
    }).then((r) => { this.busyCard = false; if (r !== 'buy') this.ui.hidePropCard(); return r; });
  }

  rentChoice(ctx, auto) {
    const { player: p, owner, tile: t, rent, state: s, takeover, takeoverReason, takeoverPrice, duel, duelLoss } = ctx;
    this.busyCard = true;
    const buttons = [
      { id: 'pay', label: 'שלם שכירות', sub: `ל${owner.name}`, icon: '💸', kind: 'ghost', cost: money(rent.amount), hotkey: 'KeyP' },
    ];
    if (duel) buttons.unshift({ id: 'duel', label: 'בוא לדו-קרב!', sub: `ניצחון: משלמים ₪0 · הפסד: משלמים ${money(duelLoss)}`, icon: '⚔️', kind: 'duel', hotkey: 'KeyD' });
    buttons.push({
      id: 'takeover', label: 'השתלטות עוינת', icon: '🏢', kind: 'purple',
      sub: takeover ? `לקחת את המגרש מ${owner.name}` : takeoverReason === 'השכונה מוגנת' ? '🔒 שכונה מלאה מוגנת' : takeoverReason === 'ממושכן' ? 'לא כשהנכס ממושכן' : `צריך ${money(takeoverPrice || 0)}`,
      cost: takeover ? money(takeover) : null, disabled: !takeover,
    });
    let note = '';
    if (s.bounty?.playerId === owner.id) note = `🎯 על הראש של <b>${owner.name}</b> יש פרס של <b>${money(s.bounty.amount)}</b>. נצח אותו בדו-קרב והפרס שלך!`;
    this.pawnOf(owner).lookAt(this.pawnOf(p).root.position);
    return this.ui.propCard(t.index, s, { buttons, rent, note, auto: this.autoOf(auto, 1.2) })
      .then((r) => { this.busyCard = false; this.ui.hidePropCard(); this.pawnOf(owner).lookAt(null); return r; });
  }

  jailChoice(ctx, auto) {
    const { player: p, options: o } = ctx;
    const opts = [
      { id: 'roll', label: 'לנסות להוציא דאבל', sub: `ניסיון ${o.turn} מתוך ${o.maxTurns}`, icon: '🎲', kind: 'primary' },
      { id: 'pay', label: 'שלם ערבות', sub: 'לכספת, ואז מטילים כרגיל', icon: '💰', kind: 'ghost', cost: money(o.bail), disabled: !o.canPay },
    ];
    if (o.card) opts.push({ id: 'card', label: 'התקשר לעורך הדין', sub: 'השתמש בקלף היציאה בחינם', icon: '⚖️', kind: 'blue' });
    if (o.appeal) opts.push({ id: 'appeal', label: 'ערעור!', sub: 'דו-קרב מול השחקן הכי עשיר: תנצח ותצא חופשי', icon: '⚔️', kind: 'duel' });
    return this.ui.choice({ title: 'בכלא', text: `${p.name}, איך אתה רוצה לצאת?`, player: p, options: opts, auto: this.autoOf(auto, 1.1), clear: true });
  }

  targetChoice(ctx, auto) {
    return this.ui.targetPick({ player: ctx.player, candidates: ctx.candidates, prompt: ctx.prompt, auto });
  }

  async tradeProposed(offer) {
    const s = this.state;
    this.ui.feed(`${this.name(s.players[offer.from])} מציע עסקה ל${this.name(s.players[offer.to])}`, '#2fa8ff');
  }

  tradeResponse(ctx, auto) {
    return this.ui.tradeResponse(ctx.offer, ctx.state, { auto: auto?.then ? { promise: auto } : auto != null ? { yes: auto } : null });
  }

  async tradeResult(offer, ok) {
    const s = this.state;
    const a = s.players[offer.from], b = s.players[offer.to];
    if (!ok) {
      this.ui.toast(`${b.name} דחה את העסקה`, 'bad');
      this.pawnOf(a).sad();
      await wait(0.5);
      return;
    }
    for (const i of [...offer.give.tiles, ...offer.get.tiles]) this.syncTile(i);
    audio.play('cash');
    this.fx.confetti(this.headPos(a), { count: 40 });
    this.fx.confetti(this.headPos(b), { count: 40 });
    this.pawnOf(a).celebrate();
    this.pawnOf(b).celebrate();
    this.syncPlayers();
    this.ui.feed(`🤝 עסקה נסגרה: ${this.name(a)} × ${this.name(b)}`, '#1fcf86');
    await this.ui.banner({ title: 'עסקה!', subtitle: `${a.name} × ${b.name}`, icon: '🤝', color: '#1fcf86', duration: 1.0 });
  }

  // ───────────────────────────────────────────── human menus
  async humanTurnMenu(ctx) {
    const { phase, player: p, state: s } = ctx;
    if (this.mode === 'build') return this.buildMode(p, s);
    if (this.mode === 'deeds') {
      const act = await this.ui.portfolio(s, p.id);
      if (act.type === 'close') { this.mode = null; return null; }
      return act;
    }
    this.followShot(p, { lambda: 2 });
    const buildable = R.ownedBy(s, p.id).filter((i) => R.canBuild(s, p.id, i).ok);
    const others = s.players.filter((o) => !o.bankrupt && o !== p);
    const id = await this.ui.dock(p, [
      { id: 'build', label: 'בנייה', icon: '🔨', kind: 'ghost', disabled: !buildable.length, title: buildable.length ? 'שדרג את המגרשים שלך' : 'אין מה לשדרג כרגע' },
      { id: 'trade', label: 'עסקה', icon: '🤝', kind: 'ghost', disabled: !others.length },
      { id: 'deeds', label: 'נכסים', icon: '📜', kind: 'ghost' },
      phase === 'pre'
        ? { id: 'roll', label: 'הטל!', icon: '🎲', kind: 'primary', primary: true, key: 'רווח', hotkey: 'Space' }
        : { id: 'end', label: 'סיום תור', icon: '✔', kind: 'go', primary: true, key: 'רווח', hotkey: 'Space' },
    ]);
    switch (id) {
      case 'roll': return { type: 'roll' };
      case 'end': this.marker.visible = false; return { type: 'end' };
      case 'build': return this.buildMode(p, s);
      case 'deeds': {
        const act = await this.ui.portfolio(s, p.id);
        if (act.type === 'close') return null;
        this.mode = 'deeds';
        return act;
      }
      case 'trade': {
        const offer = await this.ui.tradeBuilder(s, p.id);
        return offer ? { type: 'trade', offer } : null;
      }
      default: return null;
    }
  }

  async buildMode(p, s) {
    const allowed = R.ownedBy(s, p.id).filter((i) => R.canBuild(s, p.id, i).ok);
    if (!allowed.length) { this.mode = null; this.board.setMarked([]); return null; }
    this.mode = 'build';
    this.board.setMarked(allowed, this.color(p));
    const pins = allowed.map((i) => {
      const el = $(`<div class="build-pin"><b>＋</b>${money(R.buildCost(i))}</div>`);
      return this.labels.add(el, this.buildings.topOf(i).add(V(0, 0.3, 0)));
    });
    this.overview(0.9);
    const pickP = new Promise((resolve) => { this.tilePick = { allowed, resolve }; });
    const dockP = this.ui.dock(p, [{ id: 'done', label: 'סיימתי לבנות', icon: '✔', kind: 'go', primary: true, key: 'ESC', hotkey: 'Escape' }], `<span style="font-size:18px">🔨</span> לחץ על מגרש זוהר כדי לשדרג אותו · כסף: <b>${money(p.cash)}</b>`);
    const r = await Promise.race([pickP.then((i) => ({ i })), dockP.then(() => ({ done: true }))]);
    this.tilePick = null;
    this.board.setMarked([]);
    pins.forEach((l) => l.remove());
    if (r.done) { this.mode = null; return null; }
    this.ui.cancelDock?.();
    return { type: 'build', idx: r.i };
  }

  async raiseFundsMenu(ctx) {
    const { player: p, amount, reason, state: s } = ctx;
    return this.ui.portfolio(s, p.id, { mode: 'raise', owed: amount, reason });
  }

  async aiAction(ctx, act) {
    const p = ctx.player;
    this.ui.thinking(p);
    await wait(act.type === 'roll' || act.type === 'end' ? 0.45 : 0.7);
    if (act.type === 'end') this.marker.visible = false;
    if (act.type === 'bankrupt') this.ui.toast(`${p.name} מרים ידיים…`, 'bad');
    this.ui.hideDock();
    return act;
  }

  // ───────────────────────────────────────────── jail
  async toJail(p, reason) {
    const pawn = this.pawnOf(p);
    this.cam.unfollow();
    audio.play('siren');
    this.cam.move({ target: pawn.root.position.clone().add(V(0, 0.5, 0)), dist: 9, pitch: 0.5 }, 0.5);
    pawn.shocked();
    this.fx.sparks(this.headPos(p), { count: 20, colors: ['#ff2a3d', '#2a6bff'], speed: 2 });
    const bannerP = this.ui.banner({ title: 'נתפסת!', subtitle: reason, icon: '🚓', color: '#2f4b8f', duration: 1.2 });
    await wait(0.6);
    // yanked up and dropped into the cell
    const from = pawn.root.position.clone();
    const to = this.restSpot(p);
    const cellFocus = to.clone().add(V(0, 0.5, 0));
    this.cam.move({ target: cellFocus, yaw: sideYaw(1) + 0.6, dist: 8, pitch: 0.45 }, 1.3, Ease.inOutCubic);
    audio.play('whoosh', { len: 1.2 });
    pawn.anim = 'fly';
    await tween({
      duration: 1.2, ease: Ease.inOutCubic,
      onUpdate: (t, e) => {
        pawn.root.position.lerpVectors(from, to, e);
        pawn.root.position.y = from.y + Math.sin(t * Math.PI) * 6;
        pawn.body.rotation.y = t * Math.PI * 6;
      },
    });
    pawn.body.rotation.y = 0;
    pawn.anim = null;
    pawn.root.position.copy(to);
    audio.play('jail');
    this.cam.shake(0.3);
    this.fx.dust(to, 14, 0.7);
    pawn.sad();
    this.settleAll();
    await bannerP;
    this.syncPlayers();
    this.ui.feed(`${this.name(p)} נזרק לכלא 🔒`, '#ff4d5e');
    await wait(0.4);
  }

  async release(p, how) {
    const pawn = this.pawnOf(p);
    const txt = { card: 'עורך הדין הציל את המצב! ⚖️', bail: 'הערבות שולמה.', appeal: 'הערעור התקבל!', doubles: 'דאבל: חופשי!', served: 'סיים לשבת את העונש.' }[how] || 'חופשי!';
    this.ui.toast(`${p.name}: ${txt}`, 'good');
    audio.play('unlock');
    await pawn.hopTo(this.restSpot(p), { height: 0.9, duration: 0.45 });
    this.settleAll();
    pawn.celebrate();
    this.syncPlayers();
    await wait(0.3);
  }

  // ───────────────────────────────────────────── cards & events
  async showCard(p, deck, card, ctx) {
    await this.ui.cardReveal({ deck, card, text: ctx.text || card.text, player: p, waitClick: this.isLocal(p) });
    this.ui.feed(`${deck === 'news' ? '📰' : '🔮'} ${this.name(p)}: <b>${card.title}</b>`, deck === 'news' ? '#ff4d5e' : '#7b5cff');
  }

  async flashMob(p, movers) {
    const target = this.pawnOf(p);
    this.overview(1.0);
    await this.ui.banner({ title: 'פלאש מוב!', icon: '🕺', color: '#ff6fae', duration: 0.9 });
    const saved = movers.map((m) => m.pos);
    movers.forEach((m) => { m.pos = p.pos; });
    const jobs = movers.map(async (m, k) => {
      await wait(k * 0.25);
      const pawn = this.pawnOf(m);
      audio.play('boing', { pitch: 1 + k * 0.1 });
      await pawn.hopTo(this.restSpot(m), { height: 4, duration: 1.1, spin: Math.PI * 4 });
      this.fx.dust(pawn.root.position.clone(), 8, 0.6);
    });
    await Promise.all(jobs);
    movers.forEach((m, k) => { m.pos = saved[k]; });
    await this.tileShot(p.pos, { dist: 9, dur: 0.6 });
    this.fx.confetti(target.root.position.clone().add(V(0, 1.5, 0)), { count: 100 });
    audio.play('crowd');
    await Promise.all([target, ...movers.map((m) => this.pawnOf(m))].map((pw) => pw.celebrate()));
    this.settleSoon();
  }

  async earthquake(hits) {
    this.overview(0.8);
    await wait(0.8);
    audio.play('impact');
    await this.ui.banner({ title: 'רעידת אדמה!', icon: '🌋', color: '#c2410c', duration: 0.8 });
    for (let k = 0; k < 6; k++) { this.cam.shake(0.6); audio.play('impact', { vol: 0.5, delay: 0 }); await wait(0.25); }
    for (const pawn of this.pawns.values()) pawn.shocked();
    await Promise.all(hits.map((i) => this.buildings.crumble(i, this.state.tiles[i].level - 1)));
    if (!hits.length) this.ui.toast('פיו! אף בניין לא היה גבוה מספיק כדי ליפול.', 'good');
    await wait(0.4);
  }

  async swap(p, target) {
    const a = this.pawnOf(p), b = this.pawnOf(target);
    this.overview(0.8);
    await wait(0.6);
    // Work out where each will stand after the swap (the engine commits it after we return).
    const P0 = p.pos, T0 = target.pos;
    p.pos = T0; target.pos = P0;
    const ta = this.restSpot(p), tb = this.restSpot(target);
    p.pos = P0; target.pos = T0;
    audio.play('whoosh', { len: 1 });
    await Promise.all([a.hopTo(ta, { height: 5, duration: 1.1, spin: Math.PI * 2 }), b.hopTo(tb, { height: 5, duration: 1.1, spin: -Math.PI * 2 })]);
    audio.play('land');
    this.fx.dust(ta, 8, 0.6);
    this.fx.dust(tb, 8, 0.6);
    this.settleSoon();
  }

  async hype(d, mult) {
    const idxs = districtTiles(d);
    const c = idxs.reduce((acc, i) => acc.add(tileCenter(i)), V(0, 0, 0)).multiplyScalar(1 / idxs.length);
    this.cam.unfollow();
    await this.cam.move({ target: c.setY(0.5), dist: 16, pitch: 0.7, yaw: sideYaw(tileSide(idxs[0])) + 0.3 }, 1.0);
    for (const i of idxs) {
      const top = this.buildings.topOf(i);
      if (mult > 1) {
        this.fx.sparks(top, { count: 40, colors: ['#ff9a3c', '#ffd166', '#ff4d5e'], speed: 3, up: 2 });
        this.labels.float('🔥 בטרנד', top, 'float-text', { life: 1.8 });
      } else {
        this.fx.dust(top, 16, 1, '#8a8a99');
        this.labels.float('📉 שערורייה', top, 'float-text', { life: 1.8 });
      }
    }
    audio.play(mult > 1 ? 'crowd' : 'lose');
    this.ui.setHype(this.state.hype);
    await wait(1.6);
  }

  async hypeEnded(d) {
    this.ui.setHype(this.state.hype);
    this.ui.toast(`${DISTRICTS[d].name} חזרה לשגרה`);
  }

  async timeChanged(phase, why) {
    const cur = this.envTime;
    let next = Math.floor(cur) - (Math.floor(cur) % 4) + phase;
    while (next <= cur - 0.001) next += 4;
    this.envTime = next;
    await this.overview(1.1);
    this.env.setTime(next);
    audio.setMood(phase === 3 ? 'night' : 'board');
    this.ui.setClock(this.state.round, phase);
    const info = [
      { t: 'בוקר טוב', s: '☀ עסקי היום גובים עכשיו שכירות ×1.5', i: '🌅', c: '#ff9a5a' },
      { t: 'צהריים טובים', s: '☀ עסקי היום עדיין גובים ×1.5', i: '☀️', c: '#2fa8ff' },
      { t: 'השמש שוקעת', s: '☾ עסקי הלילה גובים עכשיו שכירות ×1.5', i: '🌇', c: '#ff6f61' },
      { t: 'לילה טוב', s: '☾ עסקי הלילה ב-×1.5, הניאונים דולקים', i: '🌙', c: '#3b3fa6' },
    ][phase];
    if (phase === 3) {
      // nightfall fireworks over the plaza
      for (let k = 0; k < 3; k++) setTimeout(() => this.fx.firework(V(rand(-5, 5), 1, rand(-5, 5))), 500 + k * 450);
    }
    await this.ui.banner({ title: why === 'card' ? `${info.t}?!` : info.t, subtitle: info.s, icon: info.i, color: info.c, duration: 1.6 });
    this.ui.feed(`${info.i} ${TIME_PHASES[phase].name} — ${info.s}`, info.c);
  }

  /** Online reactions: a big emoji pops over the player's pawn. */
  emote(pid, e) {
    const p = this.state?.players[pid];
    if (!p || p.bankrupt || !this.pawnOf(p)) return;
    this.labels.float(e, this.headPos(p).add(V(0, 0.4, 0)), 'emote-pop', { life: 2.2, rise: 90 });
    const pawn = this.pawnOf(p);
    if (!pawn.anim) (e === '😡' ? pawn.angry() : e === '😭' ? pawn.sad() : pawn.shocked());
    audio.play('pop', { pitch: 1.3 });
  }

  async newRound(round) {
    this.ui.setClock(round, this.state.timePhase);
    this.ui.feed(`— סיבוב ${round} —`, '#1d1838');
    this.updateStatue();
  }

  async bountyUpdate(bounty, isNew) {
    this.syncPlayers();
    if (!bounty) { this.ui.toast('הפרס בוטל: המרוץ שוב צמוד'); return; }
    const p = this.state.players[bounty.playerId];
    if (isNew) {
      const pawn = this.pawnOf(p);
      this.cam.unfollow();
      await this.cam.move({ target: pawn.root.position.clone().add(V(0, 1, 0)), dist: 9, pitch: 0.4, yaw: sideYaw(tileSide(p.pos)) + 0.4 }, 1.0);
      audio.play('duel', { vol: 0.5 });
      await this.ui.banner({ title: 'מבוקש!', subtitle: `${p.name} השאיר את כולם מאחור · ${money(bounty.amount)} למי שינצח אותו בדו-קרב!`, icon: '🎯', color: '#a0141e', duration: 1.8 });
    } else {
      this.ui.toast(`🎯 הפרס על ${p.name} עלה ל-${money(bounty.amount)}`);
    }
  }

  async bountyClaimed(winner, loser, amt) {
    this.syncPlayers();
    audio.play('win');
    await this.ui.banner({ title: 'הפרס נגבה!', subtitle: `${winner.name} הפיל את ${loser.name} · +${money(amt)}`, icon: '🎯', color: this.color(winner), duration: 1.5 });
  }

  // ───────────────────────────────────────────── bankruptcy & end
  async bankrupt(p, creditor, props) {
    const pawn = this.pawnOf(p);
    this.cam.unfollow();
    await this.cam.move({ target: pawn.root.position.clone().add(V(0, 0.6, 0)), dist: 8, pitch: 0.45 }, 0.7);
    audio.play('bankrupt');
    await pawn.flop();
    pawn.setGray(true);
    this.cam.shake(0.4);
    await this.ui.banner({ title: 'פשיטת רגל!', subtitle: creditor ? `הכול עובר ל${creditor.name}` : 'הכול חוזר לבנק', icon: '💥', color: '#ff4d5e', duration: 1.5 });
    if (!creditor) {
      await this.overview(0.8);
      for (const i of props) { this.buildings.crumble(i, -1); await wait(0.12); }
      await wait(0.8);
    }
    await tween({ duration: 0.8, ease: Ease.inBack, onUpdate: (t, e) => { pawn.root.scale.setScalar(Math.max(0.01, 1 - e)); } });
    pawn.root.visible = false;
    this.ui.feed(`💥 ${this.name(p)} פשט רגל`, '#ff4d5e');
  }

  async gameOver(winner, standings) {
    this.marker.visible = false;
    this.ui.hideDock();
    this.ui.hidePropCard();
    const pawn = this.pawnOf(winner);
    this.updateStatue();
    this.cam.unfollow();
    audio.setMood('board');
    await this.cam.move({ target: pawn.root.position.clone().add(V(0, 0.8, 0)), dist: 7, pitch: 0.35, yaw: sideYaw(tileSide(winner.pos)) + 0.4 }, 1.4);
    audio.play('win');
    let running = true;
    (async () => {
      while (running) {
        this.fx.firework(pawn.root.position.clone().add(V(rand(-4, 4), 0, rand(-4, 4))));
        pawn.celebrate();
        await wait(1.2);
      }
    })();
    this.fx.confetti(pawn.root.position.clone().add(V(0, 3, 0)), { count: 200, speed: 6 });
    await wait(1.2);
    this.cam.move({ target: V(0, 0, 0), dist: 38, pitch: 0.8, yaw: this.cam.cur.yaw + 1.2 }, 6, Ease.inOutCubic);
    const choice = await this.ui.gameOver(this.state, standings, winner);
    running = false;
    this.onGameOverChoice?.(choice);
  }

  // ───────────────────────────────────────────── auctions & heists
  async runAuction({ idx, bidders, aiValues }, net = null) {
    this.busyCard = true;
    this.ui.hideDock();
    await this.tileShot(idx, { dist: 11, dur: 0.6 });
    const res = await runAuction({ ui: net?.ui || this.ui, audio: net?.audio || audio, idx, bidders, aiValues, holdFn: net?.holdFn, keyLabel: net?.keyLabel });
    this.busyCard = false;
    return res;
  }

  async runHeist(p, pot, net = null) {
    const pawn = this.pawnOf(p);
    this.cam.unfollow();
    await this.ui.banner({ title: 'השוד', subtitle: `${money(pot)} בכספת`, icon: '🦹', color: '#20588f', duration: 1.1 });
    const vp = this.board.vaultTop.clone();
    await this.cam.move({ target: vp.clone().add(V(0, -1.6, 0)), dist: 8.5, pitch: 0.35, yaw: Math.PI * 0.2 }, 1.2, Ease.inOutCubic);
    const cracked = await runHeist({
      ui: this.ui, audio, player: p, pot,
      skill: net?.skill ?? (p.isAI && net?.mode !== 'spectate' ? aiSkill(p) : null),
      mode: net?.mode || 'play', emit: net?.emit, feed: net?.feed, local: net ? !!net.local : true,
      onDial: (k, ok) => {
        if (ok) { this.fx.sparks(vp.clone().add(V(0, -1.2, 0)), { count: 30, color: '#ffe38a', speed: 3 }); this.cam.shake(0.1); }
        else this.cam.shake(0.2);
      },
    });
    if (cracked === 3) {
      this.fx.coinFountain(vp.clone(), 40);
      this.fx.firework(vp.clone());
      audio.play('win');
      await this.ui.banner({ title: 'ג׳קפוט!', subtitle: `${p.name} מרוקן את הכספת`, icon: '💰', color: '#ffb31f', duration: 1.3 });
    } else if (cracked === 0) {
      audio.play('alarm');
      this.cam.shake(0.3);
      await this.ui.banner({ title: 'אזעקה!', subtitle: 'השוטרים חיכו…', icon: '🚨', color: '#ff2a3d', duration: 1.2 });
    }
    this.cam.follow(pawn.root, V(0, 0.4, 0));
    return cracked;
  }

  // ───────────────────────────────────────────── duels
  async runDuel({ a, b, game, ctx }, net = null) {
    const s = this.state;
    const G = MINIGAMES[game];
    const skill = [a.isAI ? aiSkill(a) : null, b.isAI ? aiSkill(b) : null];
    this.ui.hideDock();
    this.ui.hidePropCard();
    if (!net && a.isAI && b.isAI && s.settings.cpuDuels !== 'watch') return this.quickDuel(a, b, G, ctx, skill);

    // ── board-side build-up
    const pa = this.pawnOf(a), pb = this.pawnOf(b);
    pa.lookAt(pb.root.position); pb.lookAt(pa.root.position);
    this.cam.unfollow();
    this.cam.move({ target: pa.root.position.clone().add(V(0, 0.7, 0)), dist: 5.5, pitch: 0.28, yaw: this.cam.cur.yaw + 0.3, fov: 30 }, 0.8, Ease.inOutCubic);
    audio.setMood('duel');
    audio.play('duel');
    this.stage.grade.uniforms.uDesat.value = 0.35;
    await this.ui.banner({ title: 'דו-קרב!', icon: '⚔️', color: '#e8203a', duration: 0.8 });
    this.stage.grade.uniforms.uDesat.value = 0;
    pa.lookAt(null); pb.lookAt(null);

    const humans = [a, b].filter((x) => !x.isAI).length;
    const controls = net ? net.controls : humans === 2 ? [DUEL_KEYS.left, DUEL_KEYS.right] : [a.isAI ? null : DUEL_KEYS.solo, b.isAI ? null : DUEL_KEYS.solo];
    const keyHTML = (c, i) => {
      if (!c) return '<span class="kbd">מחשב</span>';
      const move = G.meta.id === 'sumo' ? `<span class="kbd">${c.label.move}</span> תזוזה · ` : '';
      return `${move}<span class="kbd">${c.label.action}</span> פעולה`;
    };
    let stake = '';
    if (ctx.reason === 'rent') stake = `ניצחון: משלמים ₪0 · הפסד: משלמים ${money(ctx.stake * CONFIG.duelLossMultiplier)}`;
    else if (ctx.reason === 'appeal') stake = 'תנצח ותצא מהכלא';
    else if (ctx.stake) stake = `${money(ctx.stake)} על הכף`;
    if (s.bounty && (s.bounty.playerId === a.id || s.bounty.playerId === b.id)) stake += ` · 🎯 פרס של ${money(s.bounty.amount)}!`;
    const vs = this.ui.vs({ a, b, game: G.meta, stake, keysA: keyHTML(controls[0]), keysB: keyHTML(controls[1]), reason: ctx.reason });
    audio.play('impact', { delay: 0.35 });
    await wait(3.4, true);

    // ── into the arena
    await this.ui.wipe([this.color(a), '#1d1838', this.color(b)], 'in');
    await vs.close();
    const g = new G({ stage: this.stage, ui: this.ui, audio, players: [a, b], controls, skill: net?.puppet ? [null, null] : skill, net: net?.game });
    await g.build();
    this.ui.setHUDVisible(false);
    document.getElementById('labels').style.display = 'none';
    this.board.hover.visible = false;
    this.stage.setView(g.arena.scene, g.arena.camera);
    this.arena = g.arena;
    const tilt = this.stage.grade.uniforms.uTilt.value;
    this.stage.grade.uniforms.uTilt.value = 0.35;
    this.ui.duelHud.open({ a, b, title: `${G.meta.icon} ${G.meta.name.toUpperCase()}`, keysA: keyHTML(controls[0]), keysB: keyHTML(controls[1]) });
    await this.ui.wipe([], 'out');
    await g.intro();
    if (net) await net.ready();
    if (G.meta.countdown) {
      for (const n of ['3', '2', '1']) { this.ui.duelHud.big(n); audio.play('beep'); await wait(0.62, true); }
      this.ui.duelHud.big('יאללה!');
      audio.play('go');
      setTimeout(() => this.ui.duelHud.big(''), 450);
    }
    const w = net?.puppet ? await g.netPlay() : await g.play();
    if (net?.host) net.end(w);
    await g.finish(w);
    const winner = w === 0 ? a : b;
    clock.slowmo = 0.35;
    this.ui.duelHud.big(`${winner.name} מנצח!`, '', ctx.reason === 'rent' ? (winner === a ? 'פטור משכירות!' : `${a.name} משלם כפול!`) : '');
    audio.play('win');
    await wait(0.7, true);
    clock.slowmo = 1;
    await g.outro(w);
    await wait(0.5, true);

    // ── back to the board
    await this.ui.wipe([this.color(winner), '#1d1838', this.color(winner)], 'in');
    this.ui.duelHud.close();
    this.stage.setView(this.stage.scene, this.stage.camera);
    document.getElementById('labels').style.display = '';
    this.arena = null;
    g.dispose();
    this.stage.grade.uniforms.uTilt.value = tilt;
    this.ui.setHUDVisible(true);
    audio.setMood(s.timePhase === 3 ? 'night' : 'board');
    const wp = this.pawnOf(winner);
    this.cam.move({ target: wp.root.position.clone().add(V(0, 0.6, 0)), dist: 8, pitch: 0.45 }, 0.01);
    await this.ui.wipe([], 'out');
    this.ui.feed(`⚔️ ${this.name(winner)} ניצח בדו-קרב ${G.meta.name}`, this.color(winner));
    return winner.id;
  }

  quickDuelById(a, b, game, ctx, skill, forced) {
    this.ui.hideDock();
    this.ui.hidePropCard();
    return this.quickDuel(a, b, MINIGAMES[game], ctx, skill, forced);
  }

  /** Online guests: frame the lot while the host runs the auction. */
  async spectateAuction(idx) {
    this.busyCard = true;
    this.ui.hideDock();
    await this.tileShot(idx, { dist: 11, dur: 0.6 });
  }

  async quickDuel(a, b, G, ctx, skill, forced = null) {
    const pA = Math.min(0.85, Math.max(0.15, 0.5 + (skill[0] - skill[1]) * 0.7));
    const aWins = forced != null ? forced === a.id : Math.random() < pA;
    const winner = aWins ? a : b;
    const pa = this.pawnOf(a), pb = this.pawnOf(b);
    this.cam.unfollow();
    const mid = pa.root.position.clone().add(pb.root.position).multiplyScalar(0.5);
    const far = pa.root.position.distanceTo(pb.root.position);
    this.cam.move({ target: mid.setY(0.5), dist: Math.max(9, far * 1.1), pitch: 0.6 }, 0.7);
    audio.play('duel', { vol: 0.5 });
    const el = $(`<div class="modal glass" style="width:min(520px,92vw);text-align:center">
      <div style="font:800 12px var(--font);color:var(--ink-3)">דו-קרב מחשבים · ${G.meta.icon} ${G.meta.name}</div>
      <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;margin:12px 0;direction:ltr">
        <div><img src="${this.ui.pimg(a)}" style="width:84px;height:84px;border-radius:22px;background:${a.color}"><div style="font:800 14px var(--font)">${a.name}</div></div>
        <div style="font:400 44px var(--display)">VS</div>
        <div><img src="${this.ui.pimg(b)}" style="width:84px;height:84px;border-radius:22px;background:${b.color}"><div style="font:800 14px var(--font)">${b.name}</div></div>
      </div>
      <div style="position:relative;height:18px;border-radius:12px;background:${b.color};overflow:hidden;direction:ltr"><i class="qbar" style="position:absolute;left:0;top:0;bottom:0;width:50%;background:${a.color};transition:width .25s cubic-bezier(.2,1.4,.4,1)"></i></div>
      <div class="qres" style="font:400 30px var(--display);margin-top:12px;min-height:36px"></div></div>`);
    const ov = this.ui.overlay(el, { clear: true });
    const bar = el.querySelector('.qbar');
    for (let k = 0; k < 9; k++) {
      const v = 50 + (Math.random() - 0.5) * 70 * (1 - k / 12);
      bar.style.width = `${v}%`;
      audio.play('tick', { pitch: 0.8 + k * 0.08 });
      await wait(0.2);
    }
    bar.style.width = aWins ? '100%' : '0%';
    el.querySelector('.qres').textContent = `${winner.name} מנצח!`;
    audio.play('win', { vol: 0.6 });
    (aWins ? pa : pb).celebrate();
    (aWins ? pb : pa).sad();
    await wait(1.3);
    await ov.close();
    this.ui.feed(`⚔️ ${this.name(winner)} ניצח בדו-קרב מחשבים (${G.meta.name})`, this.color(winner));
    return winner.id;
  }
}
