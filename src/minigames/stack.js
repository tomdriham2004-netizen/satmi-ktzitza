// STACK ATTACK — drop sliding gold bars; the overhang gets sliced off.
// Tallest tower when the timer ends wins. Perfect drops keep full size.
import * as THREE from "three";
import { Minigame } from "./minigame.js";
import { Arena } from "./arena.js";
import { every, wait, lerp, tween, Ease } from "../core/tween.js";
import { mat, cyl, box, at, torus } from "../render/kit.js";
import { rand } from "../core/rng.js";
import { input } from "../core/input.js";

const LIMIT = 22;
const BAR_H = 0.26;
const BASE = 1.7;
const PERFECT = 0.07;
const TRAVEL = 2.3;

const goldA = () => mat('#ffbf2e', { metal: 0.8, rough: 0.22, emissive: '#5a3800', ei: 0.3 });
const goldB = () => mat('#ffd86a', { metal: 0.8, rough: 0.25, emissive: '#5a4000', ei: 0.3 });

function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; }

export class Stack extends Minigame {
  static meta = {
    id: 'stack', name: 'מגדל הזהב', icon: '🪙', countdown: true,
    howto: 'לחצו על מקש הפעולה כדי <b>להפיל</b> את מטיל הזהב שזז. מה שבולט נחתך. המגדל הכי גבוה אחרי 22 שניות מנצח!',
  };

  async build() {
    const a = this.arena = new Arena(this.ctx.stage, { top: '#2d2a8f', bottom: '#ffcf7a', ground: '#8a5a20', ambience: 'motes' });
    const s = a.scene;
    const marble = mat('#f4efe6', { rough: 0.35 });
    s.add(at(cyl(7, 7.4, 0.6, mat('#3b2f7a', { rough: 0.5 }), { seg: 48 }), 0, -0.9, 0));
    const ring = torus(7, 0.06, mat('#ffc83d', { metal: 0.8, rough: 0.3 }), { ts: 96 });
    ring.rotation.x = Math.PI / 2; ring.position.y = -0.6;
    s.add(ring);
    // treasury backdrop: columns, vault door, coin piles
    a.scene.environmentIntensity = 0.7;
    for (let k = 0; k < 7; k++) {
      if (k === 3) continue; // keep the vault door clear
      const an = Math.PI + 0.35 + (k / 6) * (Math.PI - 0.7);
      const col = new THREE.Group();
      col.add(at(cyl(0.32, 0.36, 5, marble, { seg: 16 }), 0, 2.2, 0));
      col.add(at(box(0.9, 0.25, 0.9, marble), 0, 4.8, 0));
      col.add(at(box(0.9, 0.25, 0.9, marble), 0, -0.2, 0));
      col.position.set(Math.cos(an) * 8.5, -0.6, Math.sin(an) * 8.5);
      s.add(col);
    }
    const door = new THREE.Group();
    door.add(at(cyl(2.6, 2.6, 0.4, mat('#aab3c2', { metal: 0.85, rough: 0.3 }), { seg: 48 }), 0, 0, 0, 0, Math.PI / 2));
    door.add(at(torus(2.6, 0.15, mat('#7d8696', { metal: 0.9, rough: 0.3 }), { ts: 64 }), 0, 0, 0.2));
    for (let k = 0; k < 3; k++) door.add(at(box(3.2, 0.14, 0.14, mat('#ffc83d', { metal: 0.8, rough: 0.3 })), 0, 0, 0.3, 0, 0, (k * Math.PI) / 3));
    door.add(at(cyl(0.35, 0.35, 0.3, mat('#ffc83d', { metal: 0.8 })), 0, 0, 0.35, 0, Math.PI / 2));
    door.position.set(0, 3.2, -9.5);
    s.add(door);
    a.updaters.push((dt, t) => { door.rotation.z = Math.sin(t * 0.3) * 0.4; });
    const coinM = mat('#ffcf4a', { metal: 0.8, rough: 0.3, emissive: '#6b4a00', ei: 0.3 });
    for (let k = 0; k < 70; k++) {
      const an = rand(0, Math.PI * 2), r = rand(5.2, 6.8);
      const c = cyl(0.2, 0.2, 0.05, coinM, { seg: 14 });
      c.position.set(Math.cos(an) * r, -0.55 + rand(0, 0.25), Math.sin(an) * r);
      c.rotation.set(rand(-0.5, 0.5), 0, rand(-0.5, 0.5));
      s.add(c);
    }
    this.towers = this.players.map((p, i) => {
      const x = i ? 2.6 : -2.6;
      const g = new THREE.Group();
      g.position.x = x;
      g.add(at(cyl(1.35, 1.5, 0.6, marble, { seg: 32 }), 0, -0.3, 0));
      g.add(at(cyl(1.5, 1.5, 0.08, mat(p.color, { rough: 0.4 }), { seg: 32 }), 0, -0.02, 0));
      s.add(g);
      const base = { x: 0, z: 0, w: BASE, d: BASE, y: 0 };
      const baseMesh = box(BASE, BAR_H, BASE, goldA());
      baseMesh.position.set(0, BAR_H / 2, 0);
      g.add(baseMesh);
      return { group: g, layers: [base], mover: null, out: false, perfects: 0, aiErr: 0, aiWait: 0, combo: 0 };
    });
    this.towers.forEach((t, i) => this.spawnMover(i));
    const [pa, pb] = this.players;
    this.pawns = [
      a.spawn(pa, new THREE.Vector3(-4.9, -0.6, 1.4), new THREE.Vector3(-2.6, 0, 0)),
      a.spawn(pb, new THREE.Vector3(4.9, -0.6, 1.4), new THREE.Vector3(2.6, 0, 0)),
    ];
    this.debris = [];
    a.updaters.push((dt) => {
      for (const d of this.debris) {
        d.v.y -= 14 * dt;
        d.m.position.addScaledVector(d.v, dt);
        d.m.rotation.x += d.w.x * dt; d.m.rotation.z += d.w.z * dt;
        d.life -= dt;
        if (d.life < 0.4) d.m.scale.setScalar(Math.max(0.01, d.life / 0.4));
        if (d.life <= 0) { d.m.parent?.remove(d.m); d.m.geometry.dispose(); }
      }
      this.debris = this.debris.filter((d) => d.life > 0);
    });
    a.snap(new THREE.Vector3(0, 6, 15), new THREE.Vector3(0, 1, 0));
  }

  spawnMover(i) {
    const t = this.towers[i];
    const top = t.layers[t.layers.length - 1];
    const axis = t.layers.length % 2 ? 'x' : 'z';
    const m = new THREE.Mesh(new THREE.BoxGeometry(top.w, BAR_H, top.d), t.layers.length % 2 ? goldB() : goldA());
    m.castShadow = true;
    m.receiveShadow = true;
    const y = top.y + BAR_H;
    const start = -TRAVEL;
    m.position.set(axis === 'x' ? top.x + start : top.x, y + BAR_H / 2, axis === 'z' ? top.z + start : top.z);
    t.group.add(m);
    t.mover = { mesh: m, axis, off: start, dir: 1, speed: 2.4 + t.layers.length * 0.16, y, age: 0 };
    t.aiErr = gauss() * lerp(1.0, 0.22, this.skill[i] ?? 0.4);
    t.aiWait = rand(0.6, 1.2) + (1 - (this.skill[i] ?? 0.4)) * 0.9;
  }

  drop(i, offOverride) {
    const t = this.towers[i];
    const mv = t.mover;
    if (!mv || t.out) return;
    const top = t.layers[t.layers.length - 1];
    let off = offOverride ?? mv.off;
    const size = mv.axis === 'x' ? top.w : top.d;
    let perfect = false;
    if (Math.abs(off) < PERFECT) { off = 0; perfect = true; }
    const keep = size - Math.abs(off);
    const m = mv.mesh;
    t.mover = null;
    if (keep <= 0.04) {
      // total miss — the bar tumbles away and this tower is done
      this.debris.push({ m, v: new THREE.Vector3(mv.axis === 'x' ? Math.sign(off) * 2 : 0, 1, mv.axis === 'z' ? Math.sign(off) * 2 : 0), w: new THREE.Vector3(rand(-4, 4), 0, rand(-4, 4)), life: 1.4 });
      t.out = true;
      this.audio.play('error');
      this.ui.duelHud.score(i, `${t.layers.length - 1} ✖`);
      this.pawns[i].sad();
      return;
    }
    const layer = { ...top, y: mv.y };
    if (mv.axis === 'x') { layer.w = keep; layer.x = top.x + off / 2; } else { layer.d = keep; layer.z = top.z + off / 2; }
    m.geometry.dispose();
    m.geometry = new THREE.BoxGeometry(layer.w, BAR_H, layer.d);
    m.position.set(layer.x, layer.y + BAR_H / 2, layer.z);
    t.layers.push(layer);
    // chopped overhang falls
    if (!perfect) {
      const cut = Math.abs(off);
      const cw = mv.axis === 'x' ? cut : layer.w, cd = mv.axis === 'z' ? cut : layer.d;
      const cx = mv.axis === 'x' ? layer.x + Math.sign(off) * (keep / 2 + cut / 2) : layer.x;
      const cz = mv.axis === 'z' ? layer.z + Math.sign(off) * (keep / 2 + cut / 2) : layer.z;
      const chunk = new THREE.Mesh(new THREE.BoxGeometry(cw, BAR_H, cd), m.material);
      chunk.castShadow = true;
      chunk.position.set(cx, layer.y + BAR_H / 2, cz);
      t.group.add(chunk);
      this.debris.push({ m: chunk, v: new THREE.Vector3(mv.axis === 'x' ? Math.sign(off) * 1.5 : 0, 0.5, mv.axis === 'z' ? Math.sign(off) * 1.5 : 0), w: new THREE.Vector3(rand(-5, 5), 0, rand(-5, 5)), life: 1.2 });
      t.combo = 0;
      this.audio.play('thunk', { pitch: 1 + t.layers.length * 0.03 });
    } else {
      t.perfects++;
      t.combo++;
      this.audio.play('coin', { pitch: 1 + t.combo * 0.12 });
      this.audio.play('sparkle', { vol: 0.5 });
      const wp = new THREE.Vector3(); m.getWorldPosition(wp);
      this.arena.fx.sparks(wp, { count: 24, color: '#fff3b0', speed: 3, size: 0.25 });
      this.arena.fx.ring(wp.clone().setY(wp.y), { color: '#ffe27a', radius: 1.6, y: wp.y });
      // perfect streak slightly regrows the bar
      if (t.combo >= 2) {
        if (mv.axis === 'x') layer.w = Math.min(BASE, layer.w + 0.08); else layer.d = Math.min(BASE, layer.d + 0.08);
        m.geometry.dispose();
        m.geometry = new THREE.BoxGeometry(layer.w, BAR_H, layer.d);
      }
    }
    // squash feedback
    tween({ duration: 0.18, real: true, onUpdate: (tt) => { const s = 1 - Math.sin(tt * Math.PI) * 0.25; m.scale.set(1 + (1 - s) * 0.4, s, 1 + (1 - s) * 0.4); } }).then(() => m.scale.set(1, 1, 1));
    this.ui.duelHud.score(i, String(t.layers.length - 1));
    if (perfect) this.pawns[i].shocked();
    this.spawnMover(i);
  }

  async intro() {
    this.arena.look(new THREE.Vector3(0, 3.5, 11), new THREE.Vector3(0, 1.2, 0), 1.4);
    this.ui.duelHud.score(0, '0');
    this.ui.duelHud.score(1, '0');
    await wait(1.3, true);
  }

  moveMovers(dt) {
    for (const tw of this.towers) {
      const mv = tw.mover;
      if (!mv || tw.out) continue;
      mv.age += dt;
      mv.off += mv.dir * mv.speed * dt;
      if (mv.off > TRAVEL) { mv.off = TRAVEL; mv.dir = -1; }
      if (mv.off < -TRAVEL) { mv.off = -TRAVEL; mv.dir = 1; }
      const top = tw.layers[tw.layers.length - 1];
      if (mv.axis === 'x') mv.mesh.position.x = top.x + mv.off; else mv.mesh.position.z = top.z + mv.off;
    }
    const top = Math.max(...this.towers.map((tw) => tw.layers.length - 1)) * BAR_H;
    this.arena.look(new THREE.Vector3(0, 3.5 + top * 0.9, 11 + top * 0.5), new THREE.Vector3(0, 1.2 + top * 0.85, 0), 2);
  }

  async play() {
    const ui = this.ui.duelHud;
    let t = 0;
    let winner = -1;
    await every((dt) => {
      t += dt;
      this.timeLeft = Math.max(0, Math.ceil(LIMIT - t));
      ui.timer(this.timeLeft);
      this.moveMovers(dt);
      for (const i of [0, 1]) {
        const tw = this.towers[i];
        const mv = tw.mover;
        if (!mv || tw.out) continue;
        const reports = this.reports(i);
        if (reports) {
          // remote player: trust the offset they saw on their own screen
          const r = reports.shift();
          if (r && typeof r.off === 'number') this.emit({ e: 'drop', i, off: r.off });
          continue;
        }
        let go = this.pressed(i);
        if (this.isAI(i) && mv.age > tw.aiWait && Math.abs(mv.off - tw.aiErr) < mv.speed * dt * 1.2) go = true;
        if (go) this.emit({ e: 'drop', i, off: mv.off });
      }
      this.tickNet();
      const h = this.towers.map((tw) => tw.layers.length - 1);
      const outs = this.towers.map((tw) => tw.out);
      if (outs[0] && outs[1]) { winner = h[0] === h[1] ? this.tiebreak() : h[0] > h[1] ? 0 : 1; return true; }
      if (outs[0] && h[1] > h[0]) { winner = 1; return true; }
      if (outs[1] && h[0] > h[1]) { winner = 0; return true; }
      if (t >= LIMIT) { winner = h[0] === h[1] ? this.tiebreak() : h[0] > h[1] ? 0 : 1; return true; }
      return false;
    }, true);
    ui.timer('');
    return winner;
  }

  onEvent(ev) {
    if (ev.e !== 'drop') return;
    this.predicted = this.predicted || [0, 0];
    if (this.isPuppet && ev.i === this.net.localSide && this.predicted[ev.i] > 0) { this.predicted[ev.i]--; return; }
    this.drop(ev.i, ev.off);
  }

  netSnap() { return { t: this.timeLeft }; }
  netApply(n) { this.ui.duelHud.timer(n.t); }
  netTick(dt) {
    this.moveMovers(dt);
    // our own tower responds instantly; the host is told what we saw
    const side = this.net.localSide;
    if (side >= 0 && this.net.localControls && input.anyPressed(this.net.localControls.action)) {
      const mv = this.towers[side].mover;
      if (mv && !this.towers[side].out) {
        const off = mv.off;
        this.predicted = this.predicted || [0, 0];
        this.predicted[side]++;
        this.drop(side, off);
        this.net.report({ off });
      }
    }
  }

  async finish() {
    this.ui.duelHud.timer('');
    for (const tw of this.towers) if (tw.mover) { tw.mover.mesh.visible = false; tw.mover = null; }
  }

  tiebreak() {
    const [a, b] = this.towers;
    if (a.perfects !== b.perfects) return a.perfects > b.perfects ? 0 : 1;
    return Math.random() < 0.5 ? 0 : 1;
  }

  async outro(winner) {
    const W = this.pawns[winner], L = this.pawns[1 - winner];
    const tw = this.towers[winner];
    const h = (tw.layers.length - 1) * BAR_H;
    const wp = new THREE.Vector3(); tw.group.getWorldPosition(wp);
    this.arena.fx.confetti(wp.clone().setY(h + 1), { count: 90 });
    this.arena.look(new THREE.Vector3(wp.x * 0.7, 2.5 + h * 0.5, 8), new THREE.Vector3(wp.x, 1 + h * 0.5, 0), 2);
    L.sad();
    await W.celebrate();
  }
}
