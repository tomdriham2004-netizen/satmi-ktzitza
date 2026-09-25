// TUG OF CASH — mash to haul your rival into the shark pool.
import * as THREE from "three";
import { Minigame } from "./minigame.js";
import { Arena } from "./arena.js";
import { every, wait, lerp, tween, Ease } from "../core/tween.js";
import { mat, cyl, sphere, cone, box, rbox, at, canvasTex, torus, stripeMat } from "../render/kit.js";
import { rand } from "../core/rng.js";

const WIN = 1.1;       // flag distance at which the loser hits the edge
const LIMIT = 13;      // seconds

export class Tug extends Minigame {
  static meta = {
    id: 'tug', name: 'משיכת כסף', icon: '🪢', countdown: true,
    howto: '<b>לחצו מהר</b> על כפתור הפעולה כדי למשוך את החבל. גררו את היריב לבריכת הכרישים, או תהיו בהובלה כשהזמן נגמר.',
  };

  async build() {
    const a = this.arena = new Arena(this.ctx.stage, { top: '#243a9e', bottom: '#5fd0f0', ground: '#2b6fa0', ambience: 'motes' });
    const s = a.scene;
    const deck = mat('#d9b98a', { rough: 0.75 });
    const trim = mat('#ffc83d', { metal: 0.5, rough: 0.35 });
    for (const side of [-1, 1]) {
      s.add(at(rbox(5.2, 1.2, 4.2, 0.2, deck), side * 3.8, -0.6, 0));
      s.add(at(box(0.15, 0.1, 4.2, trim), side * 1.25, 0.02, 0));
      // stripes
      for (let k = 0; k < 5; k++) s.add(at(box(0.08, 0.02, 4.0, mat('#e8d2a8')), side * (1.8 + k * 0.7), 0.005, 0));
    }
    // pool
    const water = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.2, 4.2), new THREE.MeshPhysicalMaterial({ color: '#1a8fc4', roughness: 0.08, clearcoat: 1, transparent: true, opacity: 0.9, emissive: '#06405c', emissiveIntensity: 0.3 }));
    water.position.set(0, -0.85, 0);
    s.add(water);
    s.add(at(box(2.5, 0.2, 4.2, mat('#1e6fa0')), 0, -1.5, 0));
    // shark fin
    const fin = new THREE.Group();
    const finMesh = cone(0.25, 0.55, mat('#6b7a8f', { rough: 0.4 }), { seg: 3 });
    finMesh.scale.set(0.35, 1, 1);
    fin.add(finMesh);
    fin.position.set(0, -0.05, 0);
    s.add(fin);
    this.fin = fin;
    a.updaters.push((dt, t) => {
      if (this.finTarget) {
        fin.position.lerp(this.finTarget, 1 - Math.exp(-dt * 3));
      } else {
        fin.position.set(Math.sin(t * 0.9) * 0.7, -0.05 + Math.sin(t * 3) * 0.03, Math.cos(t * 0.9) * 1.4);
        fin.rotation.y = -t * 0.9 + Math.PI / 2;
      }
    });
    // sea far below the decks
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: '#1f9fd6', roughness: 0.15, metalness: 0.1 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -6;
    s.add(sea);
    s.fog = new THREE.Fog('#5fd0f0', 30, 120);
    // pool ring float
    const ring = torus(0.35, 0.12, stripeMat('#ff5d73', '#ffffff', 8), { ts: 24 });
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0.5, -0.22, -1.2);
    s.add(ring);
    a.updaters.push((dt, t) => { ring.position.y = -0.22 + Math.sin(t * 2) * 0.03; ring.rotation.z += dt * 0.3; });
    // bunting between two poles
    const poleM = mat('#ffffff');
    for (const x of [-5.8, 5.8]) s.add(at(cyl(0.05, 0.05, 3.2, poleM), x, 1.6, -1.9));
    const cols = ['#ff5d73', '#ffd166', '#4cc9f0', '#7bd389', '#c77dff'];
    for (let k = 0; k < 17; k++) {
      const x = -5.6 + k * 0.7;
      const y = 3.0 - Math.sin((k / 16) * Math.PI) * 0.7;
      const flag = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 3), mat(cols[k % cols.length], { side: THREE.DoubleSide }));
      flag.rotation.set(Math.PI, 0, 0);
      flag.scale.z = 0.15;
      flag.position.set(x, y - 0.17, -1.9);
      s.add(flag);
    }
    // beach umbrellas + lifeguard chair
    [[-5.3, 1.3, '#ff5d73'], [5.4, -1.2, '#4cc9f0']].forEach(([x, z, c]) => {
      s.add(at(cyl(0.03, 0.03, 1.8, poleM), x, 0.9, z));
      s.add(at(cone(1.0, 0.4, stripeMat(c, '#ffffff', 8), { seg: 8 }), x, 1.85, z));
    });
    const chair = new THREE.Group();
    for (const [x, z] of [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.2], [0.25, 0.2]]) chair.add(at(box(0.06, 1.6, 0.06, poleM), x, 0.8, z));
    chair.add(at(box(0.6, 0.06, 0.5, mat('#ff5d73')), 0, 1.6, 0));
    chair.add(at(box(0.6, 0.5, 0.06, mat('#ff5d73')), 0, 1.85, -0.25));
    chair.position.set(4.6, 0, 1.4);
    s.add(chair);
    // money bags on the decks
    const bagM = mat('#c9a15a', { rough: 0.8 });
    for (const [x, z] of [[-5.3, -1.4], [5.3, 1.3], [-5.6, 1.1]]) {
      s.add(at(sphere(0.35, bagM), x, 0.3, z));
      s.add(at(cone(0.15, 0.25, bagM), x, 0.7, z));
    }
    // pawns + rope
    const [pa, pb] = this.players;
    this.pawns = [
      a.spawn(pa, new THREE.Vector3(-2.3, 0, 0), new THREE.Vector3(3, 0, 0)),
      a.spawn(pb, new THREE.Vector3(2.3, 0, 0), new THREE.Vector3(-3, 0, 0)),
    ];
    this.pawns.forEach((p) => { p.armPose = true; });
    this.rope = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 8), mat('#d9b37a', { rough: 0.9 }));
    this.rope.rotation.z = Math.PI / 2;
    this.rope.castShadow = true;
    s.add(this.rope);
    const flagTex = canvasTex(64, 64, (ctx) => { ctx.fillStyle = '#ff4d5e'; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = '#fff'; ctx.font = '800 40px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('₪', 32, 46); });
    this.flag = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide }));
    s.add(this.flag);
    this.pos = 0;
    this.vel = 0;
    this.effort = [0, 0];
    this.layout(0);
    a.snap(new THREE.Vector3(0, 10, 14), new THREE.Vector3(0, 0, 0));
  }

  layout(dt) {
    const [A, B] = this.pawns;
    A.root.position.x = this.pos - 2.3;
    B.root.position.x = this.pos + 2.3;
    const y = 0.72;
    const x0 = A.root.position.x + 0.4, x1 = B.root.position.x - 0.4;
    this.rope.position.set((x0 + x1) / 2, y + Math.sin(performance.now() * 0.02) * 0.01, 0.1);
    this.rope.scale.y = x1 - x0;
    this.flag.position.set(this.pos, y - 0.25, 0.1);
    // lean back with effort
    A.body.rotation.z = lerp(A.body.rotation.z, 0.25 + (this.effort?.[0] || 0) * 0.25, 1 - Math.exp(-dt * 10));
    B.body.rotation.z = lerp(B.body.rotation.z, -0.25 - (this.effort?.[1] || 0) * 0.25, 1 - Math.exp(-dt * 10));
    A.arms.forEach((arm) => { arm.rotation.set(-1.3, 0, 0); });
    B.arms.forEach((arm) => { arm.rotation.set(-1.3, 0, 0); });
  }

  async intro() {
    this.arena.look(new THREE.Vector3(0.8, 3.4, 8.6), new THREE.Vector3(0, 0.7, 0), 1.5);
    this.ui.duelHud.big('לחצו!', '', 'תמשכו אותו לבריכה');
    await wait(1.4, true);
    this.ui.duelHud.big('');
  }

  async play() {
    const ui = this.ui.duelHud;
    const nextAI = [0, 0];
    const rate = [0, 1].map((s) => (this.isAI(s) ? lerp(3.8, 8.2, this.skill[s]) : 0));
    this.effort = [0, 0];
    let t = 0, winner = -1;
    const counts = [0, 0];
    await every((dt) => {
      t += dt;
      this.timeLeft = Math.max(0, Math.ceil(LIMIT - t));
      ui.timer(this.timeLeft);
      const press = [0, 0];
      for (const s of [0, 1]) {
        press[s] += this.pressCount(s);
        if (this.isAI(s)) {
          nextAI[s] -= dt;
          if (nextAI[s] <= 0) {
            press[s]++;
            const burst = Math.sin(t * 1.3 + s * 2) > 0.7 ? 1.25 : 1;
            nextAI[s] = (1 / (rate[s] * burst)) * rand(0.7, 1.3);
          }
        }
        if (press[s]) { counts[s] += press[s]; this.emit({ e: 'press', s }); }
        this.effort[s] *= Math.exp(-dt * 3);
      }
      this.vel += (press[1] - press[0]) * 0.95;
      this.vel *= Math.exp(-dt * 5);
      this.pos += this.vel * dt;
      this.layout(dt);
      this.tickNet();
      if (this.pos <= -WIN) { winner = 0; return true; }
      if (this.pos >= WIN) { winner = 1; return true; }
      if (t >= LIMIT) { winner = this.pos < 0 ? 0 : this.pos > 0 ? 1 : (counts[0] >= counts[1] ? 0 : 1); return true; }
      return false;
    }, true);
    ui.timer('');
    return winner;
  }

  onEvent(ev) {
    if (ev.e !== 'press') return;
    const s = ev.s;
    this.effort[s] = Math.min(1, (this.effort[s] || 0) + 0.25);
    this.pawns[s].squash(0.12, 0.08);
    this.audio.play('tick', { pitch: s ? 0.8 : 1.1, minGap: 0.01 });
    if (Math.random() < 0.35) this.arena.fx.dust(this.pawns[s].root.position.clone(), 2, 0.35);
  }

  netSnap() { return { p: +this.pos.toFixed(3), t: this.timeLeft }; }
  netApply(s) { this.netPos = s.p; this.ui.duelHud.timer(s.t); }
  netTick(dt) {
    this.effort = this.effort || [0, 0];
    if (this.netPos != null) this.pos += (this.netPos - this.pos) * (1 - Math.exp(-dt * 14));
    for (const s of [0, 1]) this.effort[s] *= Math.exp(-dt * 3);
    this.layout(dt);
  }

  // the loser gets yanked into the pool (plays on every screen)
  async finish(winner) {
    this.ui.duelHud.timer('');
    const L = this.pawns[1 - winner];
    const dir = winner === 0 ? -1 : 1;
    const from = L.root.position.clone();
    this.rope.visible = false;
    this.flag.visible = false;
    L.setExpression('shock');
    this.audio.play('whoosh');
    await tween({
      duration: 0.7, ease: Ease.linear, real: true,
      onUpdate: (tt) => {
        L.root.position.x = from.x + dir * 1.6 * tt;
        L.root.position.y = from.y + 4 * 0.9 * tt * (1 - tt) - tt * tt * 1.4;
        L.body.rotation.z = dir * tt * 2.5;
      },
    });
    this.audio.play('splash');
    this.arena.fx.sparks(L.root.position.clone().setY(-0.2), { count: 40, color: '#bff3ff', speed: 4, size: 0.25, up: 2, g: -9 });
    this.arena.shake(0.3);
    this.finTarget = L.root.position.clone().setY(-0.05);
    await tween({ duration: 0.6, ease: Ease.inQuad, real: true, onUpdate: (tt) => { L.root.position.y = from.y - 1.2 - tt * 0.4; } });
  }

  async outro(winner) {
    const W = this.pawns[winner];
    W.body.rotation.z = 0;
    W.arms.forEach((arm, i) => arm.rotation.set(0, 0, (i ? 1 : -1) * 0.35));
    this.arena.look(new THREE.Vector3(W.root.position.x * 0.5, 2.2, 6.5), W.root.position.clone().setY(1), 2);
    await W.celebrate();
  }
}
