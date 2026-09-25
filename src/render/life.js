// Ambient life: tiny townsfolk strolling the plaza and fish leaping in the lagoon.
import * as THREE from "three";
import { mat, sphere, cone, at, bakeChildren } from "./kit.js";
import { rand, pick } from "../core/rng.js";
import { HALF } from "./layout.js";

const OBSTACLES = [
  { x: 0, z: 0, r: 3.9 },          // dice bowl
  { x: 4.9, z: -4.9, r: 2.0 },     // vault
  { x: -4.9, z: -4.9, r: 1.8 },    // ferris wheel
  { x: -4.9, z: 4.9, r: 1.8 },     // fountain
  { x: 4.9, z: 4.9, r: 1.5 },      // statue
];

function segClear(a, b) {
  const ab = new THREE.Vector2(b.x - a.x, b.z - a.z);
  const len2 = ab.lengthSq() || 1;
  for (const o of OBSTACLES) {
    const t = Math.max(0, Math.min(1, ((o.x - a.x) * ab.x + (o.z - a.z) * ab.y) / len2));
    const px = a.x + ab.x * t, pz = a.z + ab.y * t;
    if (Math.hypot(px - o.x, pz - o.z) < o.r) return false;
  }
  return true;
}

function makeFolk(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.12, 4, 10), mat(color, { rough: 0.45 }));
  body.position.y = 0.19;
  body.castShadow = true;
  g.add(body);
  const white = mat('#ffffff', { rough: 0.3 });
  const black = mat('#16161f', { rough: 0.3 });
  for (const x of [-0.04, 0.04]) {
    g.add(at(sphere(0.03, white, { ws: 8, hs: 6 }), x, 0.26, 0.095));
    g.add(at(sphere(0.016, black, { ws: 6, hs: 4 }), x, 0.26, 0.12));
  }
  if (Math.random() < 0.5) g.add(at(cone(0.09, 0.12, mat(pick(['#ff6f91', '#ffd166', '#4cc9f0', '#ffffff'])), { seg: 8 }), 0, 0.42, 0));
  return bakeChildren(g);
}

export class TownLife {
  constructor(scene, fx) {
    this.scene = scene;
    this.fx = fx;
    // waypoints on paved areas
    this.points = [];
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      this.points.push(new THREE.Vector3(Math.cos(a) * 4.15, 0, Math.sin(a) * 4.15));
    }
    for (const [qx, qz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        this.points.push(new THREE.Vector3(qx * 4.9 + Math.cos(a) * 2.15, 0, qz * 4.9 + Math.sin(a) * 2.15));
      }
    }
    const cols = ['#ff9eb5', '#9ed8ff', '#ffe08a', '#b8f2c8', '#d6b8ff', '#ffc79e', '#f4f4f4', '#ff8a8a', '#8ad0c9'];
    this.folk = cols.map((c) => {
      const m = makeFolk(c);
      const start = pick(this.points).clone();
      m.position.copy(start);
      scene.add(m);
      return { m, target: start.clone(), wait: rand(0, 3), speed: rand(0.45, 0.75), phase: rand(0, 6) };
    });
    // fish
    const fish = new THREE.Group();
    const bodyF = sphere(0.18, mat('#ff8a3c', { rough: 0.35 }), { ws: 12, hs: 8 });
    bodyF.scale.set(1.6, 0.8, 0.6);
    fish.add(bodyF);
    const tail = cone(0.12, 0.2, mat('#ff6a2c'), { seg: 3 });
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -0.32;
    tail.scale.z = 0.3;
    fish.add(tail);
    fish.visible = false;
    scene.add(fish);
    this.fish = { m: fish, t: 0, next: rand(3, 6), active: false };
  }

  update(dt) {
    for (const f of this.folk) {
      const p = f.m.position;
      if (f.wait > 0) {
        f.wait -= dt;
        f.m.position.y = 0;
        if (f.wait <= 0) {
          for (let k = 0; k < 12; k++) {
            const c = pick(this.points);
            if (c.distanceTo(p) > 0.5 && segClear(p, c)) { f.target.copy(c); break; }
          }
        }
        continue;
      }
      const dx = f.target.x - p.x, dz = f.target.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) { f.wait = rand(1, 4); continue; }
      const step = Math.min(d, f.speed * dt);
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
      f.phase += dt * 10;
      p.y = Math.abs(Math.sin(f.phase)) * 0.05;
      const yaw = Math.atan2(dx, dz);
      let diff = yaw - f.m.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      f.m.rotation.y += diff * Math.min(1, dt * 8);
    }
    // leaping fish
    const F = this.fish;
    if (!F.active) {
      F.next -= dt;
      if (F.next <= 0) {
        const a = rand(0, Math.PI * 2);
        const r = HALF + rand(6, 13);
        F.from = new THREE.Vector3(Math.cos(a) * r, -0.62, Math.sin(a) * r);
        const dir = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(rand(1.3, 2.2));
        F.to = F.from.clone().add(dir);
        F.t = 0;
        F.active = true;
        F.m.visible = true;
        F.m.rotation.y = Math.atan2(-dir.z, dir.x);
        this.fx?.sparks(F.from.clone().setY(-0.5), { count: 10, color: '#d9f7ff', speed: 1.6, size: 0.14, up: 2, g: -8 });
      }
    } else {
      F.t += dt / 0.85;
      const t = Math.min(1, F.t);
      F.m.position.lerpVectors(F.from, F.to, t);
      F.m.position.y = -0.62 + 4 * 1.1 * t * (1 - t);
      F.m.rotation.z = (0.5 - t) * 1.6;
      if (t >= 1) {
        F.active = false;
        F.m.visible = false;
        F.next = rand(3, 8);
        this.fx?.sparks(F.to.clone().setY(-0.5), { count: 14, color: '#d9f7ff', speed: 1.8, size: 0.16, up: 2, g: -8 });
      }
    }
  }
}
