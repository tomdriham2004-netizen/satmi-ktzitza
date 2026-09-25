// BUMPER BRAWL — slide, dash and shove your rival off a shrinking sky platform.
import * as THREE from "three";
import { Minigame } from "./minigame.js";
import { Arena } from "./arena.js";
import { every, wait, lerp, clamp, tween, Ease } from "../core/tween.js";
import { mat, neon, cyl, sphere, cone, torus, box, at, canvasTex } from "../render/kit.js";
import { rand } from "../core/rng.js";

const R0 = 4.3;
const RMIN = 2.2;
const BODY_R = 0.6;
const LIMIT = 30;

export class Sumo extends Minigame {
  static meta = {
    id: 'sumo', name: 'Bumper Brawl', icon: '🥊', countdown: true,
    howto: '<b>Move</b> to slide around, <b>action</b> to DASH. Shove your rival off the edge. The platform shrinks!',
  };

  async build() {
    const a = this.arena = new Arena(this.ctx.stage, { top: '#07051c', bottom: '#5a1a8a', ground: '#3a1060', ambience: 'stars' });
    const s = a.scene;
    // synthwave grid ocean far below + striped sun on the horizon
    const gridTex = canvasTex(256, 256, (ctx, W) => {
      ctx.fillStyle = '#12082e'; ctx.fillRect(0, 0, W, W);
      ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = 3;
      ctx.strokeRect(0, 0, W, W);
    }, { repeat: true });
    gridTex.repeat.set(40, 40);
    const gridM = new THREE.MeshBasicMaterial({ map: gridTex, fog: true });
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), gridM);
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = -9;
    s.add(grid);
    s.fog = new THREE.Fog('#2a0d52', 20, 110);
    a.updaters.push((dt) => { gridTex.offset.y = (gridTex.offset.y + dt * 0.4) % 1; });
    const sunTex = canvasTex(256, 256, (ctx, W) => {
      const g = ctx.createLinearGradient(0, 0, 0, W);
      g.addColorStop(0, '#ffe36e'); g.addColorStop(0.55, '#ff7a59'); g.addColorStop(1, '#ff2f9a');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < 7; k++) ctx.fillRect(0, W * 0.55 + k * 16, W, 4 + k * 1.5);
    });
    const sun = new THREE.Mesh(new THREE.CircleGeometry(26, 48), new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, fog: false }));
    sun.position.set(0, 8, -120);
    s.add(sun);
    // neon pylons around the ring
    for (let k = 0; k < 6; k++) {
      const an = (k / 6) * Math.PI * 2 + Math.PI / 6;
      const col = k % 2 ? '#43e8ff' : '#ff4fd8';
      const py = new THREE.Group();
      py.add(at(cyl(0.12, 0.18, 3.2, mat('#1b1450')), 0, -0.6, 0));
      py.add(at(sphere(0.28, neon(col, 3, 3)), 0, 1.15, 0));
      py.position.set(Math.cos(an) * 6.2, 0, Math.sin(an) * 6.2);
      s.add(py);
      a.updaters.push((dt, t) => { py.position.y = Math.sin(t * 1.5 + k) * 0.25; });
    }
    const tex = canvasTex(512, 512, (ctx, W) => {
      const c = W / 2;
      const g = ctx.createRadialGradient(c, c, 10, c, c, c);
      g.addColorStop(0, '#3b2a8f'); g.addColorStop(1, '#221a5c');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, W);
      ctx.strokeStyle = 'rgba(255,120,220,0.5)'; ctx.lineWidth = 4;
      for (let r = 40; r < c; r += 44) { ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(120,230,255,0.35)'; ctx.lineWidth = 3;
      for (let k = 0; k < 12; k++) { const an = (k / 12) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(c + Math.cos(an) * c, c + Math.sin(an) * c); ctx.stroke(); }
      ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(c, c, 26, 0, Math.PI * 2); ctx.fill();
    });
    this.plat = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(R0, R0, 0.5, 64), [
      mat('#2b1f6e', { rough: 0.4 }), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.1 }), mat('#2b1f6e'),
    ]);
    top.position.y = -0.25;
    top.receiveShadow = true;
    this.plat.add(top);
    const rim = torus(R0, 0.08, neon('#ff4fd8', 2.5, 2.5), { ts: 96, rs: 8 });
    rim.rotation.x = Math.PI / 2;
    this.plat.add(rim);
    this.plat.add(at(cone(R0 * 0.95, 3.5, mat('#1b1450', { flat: true }), { seg: 12 }), 0, -2.3, 0, 0, Math.PI));
    s.add(this.plat);
    // floating decor
    for (let k = 0; k < 8; k++) {
      const an = (k / 8) * Math.PI * 2;
      const rock = new THREE.Mesh(new THREE.OctahedronGeometry(rand(0.4, 0.9)), mat(k % 2 ? '#ff4fd8' : '#43e8ff', { emissive: k % 2 ? '#ff4fd8' : '#43e8ff', ei: 0.6 }));
      rock.position.set(Math.cos(an) * rand(10, 15), rand(-4, 3), Math.sin(an) * rand(10, 15) - 3);
      s.add(rock);
      const sp = rand(0.3, 0.8);
      a.updaters.push((dt, t) => { rock.rotation.x += dt * sp; rock.rotation.y += dt * sp; rock.position.y += Math.sin(t + k) * dt * 0.3; });
    }
    const [pa, pb] = this.players;
    this.pawns = [
      a.spawn(pa, new THREE.Vector3(-2, 0, 0), new THREE.Vector3(2, 0, 0)),
      a.spawn(pb, new THREE.Vector3(2, 0, 0), new THREE.Vector3(-2, 0, 0)),
    ];
    this.st = this.pawns.map((p, i) => ({
      pos: new THREE.Vector2(i ? 2 : -2, 0), vel: new THREE.Vector2(), face: new THREE.Vector2(i ? -1 : 1, 0),
      cd: 0, dash: 0, alive: true, y: 0, vy: 0, aiT: 0, aiDir: new THREE.Vector2(),
    }));
    this.R = R0;
    a.snap(new THREE.Vector3(0, 14, 10), new THREE.Vector3(0, 0, 0));
  }

  async intro() {
    this.arena.look(new THREE.Vector3(0, 8.5, 9), new THREE.Vector3(0, 0, 0.5), 1.4);
    await wait(1.4, true);
  }

  aiInput(i, dt) {
    const me = this.st[i], op = this.st[1 - i];
    const sk = this.skill[i];
    me.aiT -= dt;
    if (me.aiT > 0) return { dir: me.aiDir, dash: false };
    me.aiT = lerp(0.55, 0.1, sk) * rand(0.7, 1.3);
    const dir = new THREE.Vector2();
    let dash = false;
    const myR = me.pos.length();
    if (myR > this.R * lerp(0.9, 0.72, sk)) { // weak CPUs notice the edge late
      dir.copy(me.pos).multiplyScalar(-1).normalize();
    } else {
      const outward = op.pos.lengthSq() > 0.01 ? op.pos.clone().normalize() : new THREE.Vector2(1, 0);
      const behind = op.pos.clone().addScaledVector(outward, -1.3);
      const toBehind = behind.clone().sub(me.pos);
      const toOp = op.pos.clone().sub(me.pos);
      if (toBehind.length() > 0.7 && toOp.length() > 1.4) dir.copy(toBehind).normalize();
      else dir.copy(toOp).normalize();
      const aligned = me.face.dot(toOp.clone().normalize()) > lerp(0.6, 0.9, sk);
      if (me.cd <= 0 && toOp.length() < lerp(1.8, 2.8, sk) && aligned && Math.random() < lerp(0.2, 0.85, sk)) dash = true;
      if (me.cd <= 0 && sk < 0.3 && Math.random() < 0.05) dash = true; // reckless lunges
    }
    const jitter = (1 - sk) * 1.1;
    dir.rotateAround(new THREE.Vector2(), rand(-jitter, jitter));
    me.aiDir.copy(dir);
    return { dir, dash };
  }

  async play() {
    const ui = this.ui.duelHud;
    let t = 0, winner = -1;
    await every((dt) => {
      t += dt;
      this.timeLeft = Math.max(0, Math.ceil(LIMIT - t));
      ui.timer(this.timeLeft);
      // shrink after 8s
      this.setRadius(t < 8 ? R0 : Math.max(RMIN, R0 - (t - 8) * 0.14));
      for (const i of [0, 1]) {
        const s = this.st[i];
        if (!s.alive) continue;
        let dir, dash;
        if (this.isAI(i)) ({ dir, dash } = this.aiInput(i, dt));
        else {
          const ax = this.axis(i);
          dir = new THREE.Vector2(ax.x, ax.y);
          if (dir.lengthSq() > 0) dir.normalize();
          dash = this.pressCount(i) > 0;
        }
        const accel = this.isAI(i) ? lerp(9, 16, this.skill[i]) : 17;
        s.vel.addScaledVector(dir, accel * dt);
        s.cd -= dt;
        s.dash -= dt;
        if (dash && s.cd <= 0) {
          const d = dir.lengthSq() > 0 ? dir.clone() : s.face.clone();
          s.vel.addScaledVector(d, 9.5);
          s.cd = 1.1;
          s.dash = 0.28;
          this.emit({ e: 'dash', i });
        }
        const max = s.dash > 0 ? 12 : 5.2;
        if (s.vel.length() > max) s.vel.setLength(max);
        s.vel.multiplyScalar(Math.exp(-dt * (s.dash > 0 ? 0.6 : 1.9)));
        s.pos.addScaledVector(s.vel, dt);
        if (s.vel.lengthSq() > 0.05) s.face.lerp(s.vel.clone().normalize(), 1 - Math.exp(-dt * 12)).normalize();
      }
      // collision
      const A = this.st[0], B = this.st[1];
      if (A.alive && B.alive) {
        const d = A.pos.clone().sub(B.pos);
        const dist = d.length();
        if (dist < BODY_R * 2 && dist > 1e-4) {
          const n = d.divideScalar(dist);
          const vr = A.vel.clone().sub(B.vel).dot(n);
          if (vr < 0) {
            const j = -(1 + 0.9) * vr / 2;
            A.vel.addScaledVector(n, j);
            B.vel.addScaledVector(n, -j);
            if (A.dash > 0) B.vel.addScaledVector(n, -6);
            if (B.dash > 0) A.vel.addScaledVector(n, 6);
            const power = Math.abs(vr) + (A.dash > 0 || B.dash > 0 ? 5 : 0);
            this.emit({ e: 'bump', x: (A.pos.x + B.pos.x) / 2, z: (A.pos.y + B.pos.y) / 2, p: power });
          }
          const push = (BODY_R * 2 - dist) / 2;
          A.pos.addScaledVector(n, push);
          B.pos.addScaledVector(n, -push);
        }
      }
      // falling
      for (const i of [0, 1]) {
        const s = this.st[i];
        if (s.alive && s.pos.length() > this.R + 0.1) {
          s.alive = false;
          s.vy = 2;
          this.emit({ e: 'fall', i });
        }
        if (!s.alive) {
          s.vy -= 20 * dt;
          s.y += s.vy * dt;
          s.pos.addScaledVector(s.vel, dt * 0.5);
        }
      }
      this.render(dt);
      this.tickNet();
      const dead = this.st.map((q) => !q.alive);
      if (dead[0] || dead[1]) {
        if (this.st[0].y < -1.5 || this.st[1].y < -1.5) {
          if (dead[0] && dead[1]) winner = this.st[0].y > this.st[1].y ? 0 : 1;
          else winner = dead[0] ? 1 : 0;
          return true;
        }
      }
      if (t >= LIMIT) { winner = this.st[0].pos.length() <= this.st[1].pos.length() ? 0 : 1; return true; }
      return false;
    }, true);
    ui.timer('');
    return winner;
  }

  setRadius(R) {
    if (Math.abs(R - this.R) > 0.001) { this.R = R; this.plat.scale.set(R / R0, 1, R / R0); }
  }

  /** Pawns + camera from the current sim state (host) or mirrored state (spectators). */
  render(dt) {
    const [A, B] = this.st;
    for (const i of [0, 1]) {
      const s = this.st[i];
      const p = this.pawns[i];
      p.root.position.set(s.pos.x, s.y, s.pos.y);
      p.targetFacing = Math.atan2(s.face.x, s.face.y);
      if (!s.alive) p.root.rotation.x += dt * 6;
      else p.body.rotation.z = clamp(-s.vel.x * 0.04, -0.3, 0.3);
      if (s.dash > 0) this.arena.fx.sparks(new THREE.Vector3(s.pos.x, 0.5, s.pos.y), { count: 2, color: this.players[i].color, speed: 0.5, size: 0.25, life: 0.4, g: 0 });
    }
    const c = new THREE.Vector3((A.pos.x + B.pos.x) / 2, 0, (A.pos.y + B.pos.y) / 2);
    this.arena.look(new THREE.Vector3(c.x * 0.4, 8 + A.pos.distanceTo(B.pos) * 0.3, 8.5 + c.z * 0.4), c.multiplyScalar(0.5), 2.5);
  }

  onEvent(ev) {
    if (ev.e === 'dash') {
      this.audio.play('whoosh', { vol: 0.6, len: 0.5 });
      this.pawns[ev.i].squash(0.25, 0.12);
      if (this.isPuppet) this.st[ev.i].dash = 0.28;
    } else if (ev.e === 'bump') {
      const power = ev.p;
      this.audio.play('bump', { vol: Math.min(1, power / 8), pitch: rand(0.8, 1.2) });
      this.arena.fx.sparks(new THREE.Vector3(ev.x, 0.7, ev.z), { count: Math.round(6 + power * 3), colors: ['#ffffff', '#ffd166', '#ff4fd8'], speed: 3 + power * 0.4, size: 0.22 });
      this.arena.shake(Math.min(0.5, power * 0.05));
      if (power > 7) this.pawns.forEach((p) => p.shocked());
    } else if (ev.e === 'fall') {
      this.audio.play('boing', { pitch: 0.7 });
      this.pawns[ev.i].setExpression('shock');
      if (this.isPuppet) this.st[ev.i].alive = false;
    }
  }

  netSnap() {
    const q = (v) => Math.round(v * 100) / 100;
    return { R: q(this.R), t: this.timeLeft, s: this.st.map((s) => [q(s.pos.x), q(s.pos.y), q(s.vel.x), q(s.vel.y), q(s.face.x), q(s.face.y), q(s.y), s.alive ? 1 : 0]) };
  }
  netApply(n) {
    this.target = n;
    this.setRadius(n.R);
    this.ui.duelHud.timer(n.t);
  }
  netTick(dt) {
    const n = this.target;
    if (n) {
      const k = 1 - Math.exp(-dt * 16);
      n.s.forEach((v, i) => {
        const s = this.st[i];
        // extrapolate a little with velocity, then ease toward the host's position
        s.pos.x += (v[0] - s.pos.x) * k + v[2] * dt * 0.5;
        s.pos.y += (v[1] - s.pos.y) * k + v[3] * dt * 0.5;
        s.vel.set(v[2], v[3]);
        s.face.set(v[4], v[5]);
        s.y += (v[6] - s.y) * k;
        if (!v[7]) s.alive = false;
      });
    }
    for (const s of this.st) s.dash -= dt;
    this.render(dt);
  }

  async finish(winner) {
    this.ui.duelHud.timer('');
    this.arena.shake(0.4);
    this.audio.play('impact', { vol: 0.5 });
    this.pawns[1 - winner].root.visible = false;
  }

  async outro(winner) {
    const W = this.pawns[winner];
    W.body.rotation.z = 0;
    this.arena.look(new THREE.Vector3(W.root.position.x * 0.6, 3.2, W.root.position.z + 6), W.root.position.clone().setY(1), 2);
    await W.celebrate();
  }
}
