// Physical dice. The engine decides the roll (seeded RNG); we run a real
// rigid-body simulation ahead of time, see which face ends up on top, then
// re-orient the die model by a cube symmetry so the physics lands exactly on
// the engine's numbers. Looks 100% physical, stays deterministic.
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { tween, Ease, every } from "../core/tween.js";

const SIZE = 0.62;
const FACES = {
  1: new THREE.Vector3(0, 1, 0), 6: new THREE.Vector3(0, -1, 0),
  2: new THREE.Vector3(0, 0, 1), 5: new THREE.Vector3(0, 0, -1),
  3: new THREE.Vector3(1, 0, 0), 4: new THREE.Vector3(-1, 0, 0),
};
const PIPS = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
};

function pipGeometry() {
  const geos = [];
  const base = new THREE.SphereGeometry(0.058, 12, 8);
  const off = 0.165;
  for (const [v, n] of Object.entries(FACES)) {
    for (const [a, b] of PIPS[v]) {
      const g = base.clone();
      g.scale(1, 1, 0.42);
      // orient pip disc along face normal
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      g.applyQuaternion(q);
      // tangent axes
      const t1 = Math.abs(n.y) > 0.5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const t2 = new THREE.Vector3().crossVectors(n, t1);
      const p = n.clone().multiplyScalar(SIZE / 2 - 0.004).addScaledVector(t1, a * off).addScaledVector(t2, b * off);
      g.translate(p.x, p.y, p.z);
      geos.push(g);
    }
  }
  return mergeGeometries(geos);
}

export class Dice {
  constructor(scene, bowl, fx, audio) {
    this.scene = scene;
    this.bowl = bowl;
    this.fx = fx;
    this.audio = audio;
    const bodyGeo = new RoundedBoxGeometry(SIZE, SIZE, SIZE, 5, 0.11);
    const pipGeo = pipGeometry();
    this.pipMat = new THREE.MeshPhysicalMaterial({ color: '#1d1a2e', roughness: 0.3, clearcoat: 1 });
    this.dice = [0, 1].map(() => {
      const g = new THREE.Group();
      const bodyMat = new THREE.MeshPhysicalMaterial({ color: '#fffaf0', roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.1, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.castShadow = true;
      body.receiveShadow = true;
      const pips = new THREE.Mesh(pipGeo, this.pipMat);
      pips.castShadow = false;
      g.add(body, pips);
      g.visible = false;
      g.userData.bodyMat = bodyMat;
      scene.add(g);
      return g;
    });
    this.fixRot = [new THREE.Quaternion(), new THREE.Quaternion()];
  }

  setColor(color) {
    this.pipMat.color.set(color).multiplyScalar(0.85);
  }

  simulate(dir) {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -48, 0) });
    world.allowSleep = true;
    const R = this.bowl.radius;
    const fy = this.bowl.floorY;
    const matDie = new CANNON.Material('die');
    const matFloor = new CANNON.Material('floor');
    world.addContactMaterial(new CANNON.ContactMaterial(matDie, matFloor, { friction: 0.35, restitution: 0.34 }));
    world.addContactMaterial(new CANNON.ContactMaterial(matDie, matDie, { friction: 0.2, restitution: 0.5 }));
    const floor = new CANNON.Body({ mass: 0, material: matFloor });
    floor.addShape(new CANNON.Plane());
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    floor.position.set(0, fy, 0);
    world.addBody(floor);
    const N = 28;
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const wall = new CANNON.Body({ mass: 0, material: matFloor });
      wall.addShape(new CANNON.Box(new CANNON.Vec3(0.2, 2, (Math.PI * R) / N + 0.05)));
      wall.position.set(Math.cos(a) * (R + 0.2), fy + 2, Math.sin(a) * (R + 0.2));
      wall.quaternion.setFromEuler(0, -a, 0);
      world.addBody(wall);
    }
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);
    const bodies = [0, 1].map((i) => {
      const b = new CANNON.Body({ mass: 1, material: matDie, allowSleep: true, sleepSpeedLimit: 0.35, sleepTimeLimit: 0.12 });
      b.addShape(new CANNON.Box(new CANNON.Vec3(SIZE / 2, SIZE / 2, SIZE / 2)));
      const start = dir.clone().multiplyScalar(R * 0.78).addScaledVector(perp, (i ? 0.45 : -0.45) + (Math.random() - 0.5) * 0.3);
      b.position.set(start.x, fy + 1.8 + i * 0.2, start.z);
      const vel = dir.clone().multiplyScalar(-(7 + Math.random() * 3)).addScaledVector(perp, (Math.random() - 0.5) * 4);
      b.velocity.set(vel.x, 1 + Math.random() * 2.5, vel.z);
      b.angularVelocity.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
      b.quaternion.setFromEuler(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      b.linearDamping = 0.22;
      b.angularDamping = 0.28;
      world.addBody(b);
      return b;
    });
    const frames = [];
    const hits = [];
    let frame = 0;
    bodies.forEach((b) => b.addEventListener('collide', (e) => {
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (v > 1.2) hits.push({ frame, v });
    }));
    const dt = 1 / 120;
    for (let step = 0; step < 120 * 3.2; step++) {
      world.step(dt);
      if (step % 2 === 0) {
        frames.push(bodies.map((b) => ({ p: new THREE.Vector3(b.position.x, b.position.y, b.position.z), q: new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w) })));
        frame++;
      }
      if (step > 60 && bodies.every((b) => b.sleepState === CANNON.Body.SLEEPING)) break;
    }
    return { frames, hits };
  }

  topFace(q) {
    let best = 1, bestY = -2;
    for (const [v, n] of Object.entries(FACES)) {
      const y = n.clone().applyQuaternion(q).y;
      if (y > bestY) { bestY = y; best = +v; }
    }
    return best;
  }

  /** Rotation R with R·n_want = n_have (both local face normals). */
  remap(want, have) {
    const a = FACES[want], b = FACES[have];
    if (want === have) return new THREE.Quaternion();
    if (a.dot(b) < -0.5) {
      const axis = Math.abs(a.y) > 0.5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      return new THREE.Quaternion().setFromAxisAngle(axis, Math.PI);
    }
    return new THREE.Quaternion().setFromUnitVectors(a, b);
  }

  async hide() {
    if (!this.dice[0].visible) return;
    await tween({ duration: 0.2, ease: Ease.inBack, onUpdate: (t, e) => this.dice.forEach((d) => d.scale.setScalar(Math.max(0.001, 1 - e))) });
    this.dice.forEach((d) => { d.visible = false; d.scale.setScalar(1); });
  }

  /** Throw the dice so they land on `values`. dir = unit vector from bowl centre toward the thrower. */
  async roll(values, dir, onHit) {
    await this.hide();
    const { frames, hits } = this.simulate(dir);
    const last = frames[frames.length - 1];
    for (let i = 0; i < 2; i++) {
      const have = this.topFace(last[i].q);
      this.fixRot[i] = this.remap(values[i], have);
      this.dice[i].visible = true;
      this.dice[i].userData.bodyMat.emissiveIntensity = 0;
    }
    const q = new THREE.Quaternion();
    let hitIdx = 0;
    await every((dt, t) => {
      const f = Math.min(frames.length - 1, t * 60 * 1.15);
      const i0 = Math.floor(f), i1 = Math.min(frames.length - 1, i0 + 1), a = f - i0;
      for (let d = 0; d < 2; d++) {
        const A = frames[i0][d], B = frames[i1][d];
        this.dice[d].position.lerpVectors(A.p, B.p, a);
        q.copy(A.q).slerp(B.q, a).multiply(this.fixRot[d]);
        this.dice[d].quaternion.copy(q);
      }
      while (hitIdx < hits.length && hits[hitIdx].frame <= f) {
        onHit?.(hits[hitIdx].v, this.dice[0].position);
        hitIdx++;
      }
      return f >= frames.length - 1;
    });
    // glow pulse on settle
    tween({ duration: 0.9, ease: Ease.outCubic, onUpdate: (t) => this.dice.forEach((d) => { d.userData.bodyMat.emissiveIntensity = Math.sin(t * Math.PI) * 0.25; }) });
    return this.dice.map((d) => d.position.clone());
  }

  center() {
    return this.dice[0].position.clone().add(this.dice[1].position).multiplyScalar(0.5);
  }
}
