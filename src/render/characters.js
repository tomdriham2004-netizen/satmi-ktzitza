// Vinyl-toy "bean" characters: googly eyes that track the camera, blinking,
// expressions, squash & stretch hops, arm gestures and signature hats.
import * as THREE from "three";
import { mat, sphere, cyl, cone, torus, box, at, stripeMat, shade } from "./kit.js";
import { tween, Ease, wait, clamp } from "../core/tween.js";
import { rosterById, ROSTER } from "../game/roster.js";

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

function bodyMat(color, gold = false) {
  if (gold) return new THREE.MeshPhysicalMaterial({ color: '#ffcc44', metalness: 0.9, roughness: 0.22, clearcoat: 0.6 });
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 0.9, clearcoatRoughness: 0.18, sheen: 0.3, sheenColor: new THREE.Color('#ffffff') });
}

function buildHat(kind, accent, gold) {
  const g = new THREE.Group();
  const G = (c, o) => (gold ? bodyMat(null, true) : mat(c, o));
  switch (kind) {
    case 'crown': {
      const gm = G('#ffc83d', { metal: 0.85, rough: 0.22 });
      g.add(at(cyl(0.15, 0.14, 0.09, gm, { seg: 18, open: true }), 0, 0.04, 0));
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        g.add(at(cone(0.035, 0.09, gm, { seg: 6 }), Math.cos(a) * 0.145, 0.12, Math.sin(a) * 0.145));
        g.add(at(sphere(0.018, G(k % 2 ? '#ff3b5c' : '#3ba4ff', { rough: 0.1 }), { ws: 8, hs: 6 }), Math.cos(a) * 0.15, 0.04, Math.sin(a) * 0.15));
      }
      g.position.y = 0.02;
      g.rotation.z = 0.12;
      break;
    }
    case 'goggles': {
      g.add(at(torus(0.235, 0.022, G('#2b2b36'), { ts: 32 }), 0, 0, 0, 0, Math.PI / 2));
      for (const x of [-0.08, 0.08]) {
        const lens = new THREE.Group();
        lens.add(at(cyl(0.055, 0.055, 0.04, G('#ffc83d', { metal: 0.7, rough: 0.3 }), { seg: 16 }), 0, 0, 0, 0, Math.PI / 2));
        lens.add(at(cyl(0.042, 0.042, 0.045, G('#7fe0ff', { rough: 0.05, metal: 0.2 }), { seg: 16 }), 0, 0, 0.004, 0, Math.PI / 2));
        lens.position.set(x, 0.02, 0.215);
        g.add(lens);
      }
      g.position.y = -0.06;
      break;
    }
    case 'sailor': {
      g.add(at(cyl(0.2, 0.17, 0.08, G('#ffffff'), { seg: 24 }), 0, 0.07, 0));
      g.add(at(cyl(0.175, 0.175, 0.05, G('#1e2a50'), { seg: 24 }), 0, 0.01, 0));
      const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.015, 24, 1, false, -Math.PI / 2.4, Math.PI / 1.2), G('#1e2a50'));
      visor.position.set(0, -0.01, 0.05);
      g.add(visor);
      g.add(at(sphere(0.025, G('#ffc83d', { metal: 0.8 }), { ws: 8, hs: 6 }), 0, 0.03, 0.18));
      g.rotation.x = -0.12;
      break;
    }
    case 'chef': {
      const w = G('#ffffff', { rough: 0.9 });
      g.add(at(cyl(0.15, 0.14, 0.13, w, { seg: 20 }), 0, 0.06, 0));
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        g.add(at(sphere(0.1, w, { ws: 12, hs: 10 }), Math.cos(a) * 0.08, 0.18, Math.sin(a) * 0.08));
      }
      g.add(at(sphere(0.11, w, { ws: 12, hs: 10 }), 0, 0.22, 0));
      g.rotation.z = -0.1;
      break;
    }
    case 'tophat': {
      const blk = G('#1e2230', { rough: 0.35 });
      g.add(at(cyl(0.21, 0.21, 0.015, blk, { seg: 24 }), 0, 0, 0));
      g.add(at(cyl(0.13, 0.13, 0.24, blk, { seg: 24 }), 0, 0.12, 0));
      g.add(at(cyl(0.132, 0.132, 0.04, G('#22c98b'), { seg: 24 }), 0, 0.03, 0));
      g.rotation.z = 0.1;
      break;
    }
    case 'propeller': {
      const cap = sphere(0.16, gold ? bodyMat(null, true) : stripeMat('#ffcc1f', '#3b8bff', 6), { thetaLen: Math.PI / 2, ws: 18 });
      g.add(cap);
      g.add(at(cyl(0.012, 0.012, 0.08, G('#555'), { seg: 6 }), 0, 0.19, 0));
      const prop = new THREE.Group();
      for (const s of [-1, 1]) {
        const blade = box(0.16, 0.012, 0.045, G(s > 0 ? '#ff4d5e' : '#3b8bff'));
        blade.position.x = s * 0.08;
        blade.rotation.x = s * 0.25;
        prop.add(blade);
      }
      prop.add(sphere(0.02, G('#ffc83d')));
      prop.position.y = 0.23;
      g.add(prop);
      g.userData.propeller = prop;
      g.position.y = -0.04;
      break;
    }
    default:
  }
  return g;
}

export class Pawn {
  constructor(charId, { gold = false, scale = 1 } = {}) {
    const def = rosterById(charId);
    this.def = def;
    this.root = new THREE.Group();
    this.body = new THREE.Group();     // squash/stretch pivot at the feet
    this.root.add(this.body);
    this.root.scale.setScalar(scale);
    this.gold = gold;
    const bm = bodyMat(def.color, gold);
    this.bodyMat = bm;

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.28, 10, 24), bm);
    torso.position.y = 0.4;
    torso.castShadow = true;
    torso.receiveShadow = true;
    this.body.add(torso);
    this.torso = torso;

    // belly patch
    const belly = sphere(0.19, gold ? bm : mat(shade(def.color, 0.14), { rough: 0.5 }), { ws: 20, hs: 14 });
    belly.scale.set(1, 1.05, 0.45);
    belly.position.set(0, 0.3, 0.155);
    this.body.add(belly);

    // face
    this.face = new THREE.Group();
    this.face.position.set(0, 0.56, 0);
    this.body.add(this.face);
    const white = gold ? bm : mat('#ffffff', { rough: 0.25 });
    const pupilM = gold ? mat('#8a6a10', { metal: 0.9, rough: 0.3 }) : mat('#16161f', { rough: 0.2 });
    this.eyes = [];
    for (const x of [-0.085, 0.085]) {
      const eye = new THREE.Group();
      const ball = sphere(0.07, white, { ws: 16, hs: 12 });
      ball.scale.z = 0.7;
      eye.add(ball);
      const pupil = sphere(0.036, pupilM, { ws: 12, hs: 10 });
      pupil.position.z = 0.05;
      pupil.scale.z = 0.5;
      eye.add(pupil);
      if (!gold) {
        const hl = sphere(0.011, mat('#ffffff', { emissive: '#ffffff', ei: 0.6 }), { ws: 6, hs: 4 });
        hl.position.set(0.012, 0.014, 0.065);
        eye.add(hl);
      }
      eye.position.set(x, 0, 0.205);
      eye.userData.pupil = pupil;
      this.face.add(eye);
      this.eyes.push(eye);
    }
    // brows (used for angry/sad)
    this.brows = [];
    for (const s of [-1, 1]) {
      const brow = box(0.07, 0.016, 0.02, gold ? pupilM : mat(shade(def.color, -0.35)));
      brow.position.set(s * 0.085, 0.085, 0.215);
      brow.visible = false;
      this.face.add(brow);
      this.brows.push(brow);
    }
    // blush
    if (!gold) {
      const blushM = new THREE.MeshStandardMaterial({ color: '#ff7aa2', transparent: true, opacity: 0.55, roughness: 1 });
      for (const x of [-0.15, 0.15]) {
        const b = sphere(0.035, blushM, { ws: 10, hs: 8 });
        b.scale.set(1.2, 0.7, 0.3);
        b.position.set(x, -0.07, 0.19);
        this.face.add(b);
      }
    }
    // mouths
    const mouthM = gold ? pupilM : mat('#3a1b24', { rough: 0.4 });
    this.mouths = {
      happy: at(torus(0.045, 0.012, mouthM, { arc: Math.PI, ts: 12, rs: 6 }), 0, -0.07, 0.215, 0, 0, Math.PI),
      sad: at(torus(0.04, 0.012, mouthM, { arc: Math.PI, ts: 12, rs: 6 }), 0, -0.11, 0.212),
      shock: at(sphere(0.03, mouthM, { ws: 10, hs: 8 }), 0, -0.09, 0.205),
      grin: at(sphere(0.05, mouthM, { ws: 14, hs: 10, thetaLen: Math.PI / 2 }), 0, -0.065, 0.19, 0, Math.PI, 0),
    };
    this.mouths.shock.scale.set(1, 1.2, 0.5);
    this.mouths.grin.scale.set(1, 0.9, 0.5);
    Object.values(this.mouths).forEach((m) => { m.visible = false; this.face.add(m); });
    this.mouths.happy.visible = true;

    // arms
    this.arms = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.245, 0.4, 0);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.1, 4, 10), bm);
      arm.position.y = -0.08;
      arm.castShadow = true;
      pivot.add(arm);
      pivot.rotation.z = s * 0.35;
      this.body.add(pivot);
      this.arms.push(pivot);
    }
    // feet
    const footM = gold ? bm : mat(shade(def.color, -0.18), { rough: 0.5 });
    for (const x of [-0.1, 0.1]) {
      const f = sphere(0.075, footM, { ws: 12, hs: 8 });
      f.scale.set(1, 0.55, 1.3);
      f.position.set(x, 0.03, 0.03);
      f.castShadow = true;
      this.body.add(f);
    }
    // hat
    this.hat = buildHat(def.hat, def.accent, gold);
    this.hat.position.y += 0.78;
    this.body.add(this.hat);

    this.expression = 'happy';
    this.blinkT = 1 + Math.random() * 3;
    this.lookTarget = null;
    this.idle = true;
    this.phase = Math.random() * 10;
    this.facing = 0;
    this.targetFacing = null;
    this.armPose = null;
    this.anim = null;
    this.gray = false;
  }

  setExpression(e) {
    this.expression = e;
    const map = { happy: 'happy', neutral: 'happy', sad: 'sad', angry: 'sad', shock: 'shock', grin: 'grin' };
    const key = map[e] || 'happy';
    for (const [k, m] of Object.entries(this.mouths)) m.visible = k === key;
    const angry = e === 'angry', sad = e === 'sad';
    this.brows.forEach((b, i) => {
      b.visible = angry || sad;
      const s = i === 0 ? -1 : 1;
      b.rotation.z = angry ? s * -0.45 : s * 0.4;
    });
  }

  lookAt(v) { this.lookTarget = v; }

  faceTowards(target, instant = false) {
    const p = this.root.position;
    const a = Math.atan2(target.x - p.x, target.z - p.z);
    this.targetFacing = a;
    if (instant) { this.facing = a; this.root.rotation.y = a; }
  }

  setGray(on) {
    this.gray = on;
    const c = new THREE.Color(this.def.color);
    if (on) { const l = c.getHSL({}).l; c.setHSL(0, 0, l * 0.8); }
    this.bodyMat.color.copy(c);
  }

  update(dt, t, camera) {
    this.phase += dt;
    // turn smoothly
    if (this.targetFacing !== null) {
      let d = this.targetFacing - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * (1 - Math.exp(-dt * (this.anim ? 12 : 5)));
      this.root.rotation.y = this.facing;
    }
    // idle breathing
    if (this.idle && !this.anim) {
      const b = Math.sin(this.phase * 2.4) * 0.025;
      this.body.scale.set(1 - b * 0.5, 1 + b, 1 - b * 0.5);
      this.body.position.y = 0;
      if (!this.armPose) this.arms.forEach((a, i) => { a.rotation.x = Math.sin(this.phase * 2.4 + i) * 0.08; });
    }
    // blinking
    this.blinkT -= dt;
    let lid = 1;
    if (this.blinkT < 0.12 && this.blinkT > 0) lid = 0.1;
    if (this.blinkT <= 0) this.blinkT = 1.5 + Math.random() * 3.5;
    if (this.expression === 'angry') lid = Math.min(lid, 0.65);
    this.eyes.forEach((e) => { e.scale.y = lid; });
    // eye tracking
    const target = this.lookTarget || camera?.position;
    if (target) {
      this.face.updateWorldMatrix(true, false);
      _v.copy(target);
      this.face.worldToLocal(_v);
      _v.normalize();
      for (const e of this.eyes) {
        const p = e.userData.pupil;
        p.position.x = clamp(_v.x, -0.7, 0.7) * 0.026;
        p.position.y = clamp(_v.y, -0.7, 0.7) * 0.024;
      }
    }
    if (this.hat.userData.propeller) this.hat.userData.propeller.rotation.y += dt * (this.anim ? 30 : 8);
  }

  // ───────────────────────── animations
  async squash(amount = 0.25, dur = 0.12) {
    const prev = this.anim;
    if (!prev) this.anim = 'squash';
    await tween({ duration: dur, ease: Ease.outQuad, onUpdate: (t) => { const s = 1 - Math.sin(t * Math.PI) * amount; this.body.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s)); } });
    this.body.scale.set(1, 1, 1);
    if (!prev && this.anim === 'squash') this.anim = null;
  }

  /** Hop from current position to `to` in an arc. */
  async hopTo(to, { height = 0.55, duration = 0.3, face = true, spin = 0 } = {}) {
    this.anim = 'hop';
    const from = this.root.position.clone();
    if (face) this.faceTowards(to);
    // anticipation
    await tween({ duration: duration * 0.18, ease: Ease.outQuad, onUpdate: (t, e) => { const s = 1 - e * 0.22; this.body.scale.set(1 + e * 0.12, s, 1 + e * 0.12); } });
    const startRot = this.body.rotation.y;
    await tween({
      duration, ease: Ease.linear,
      onUpdate: (t) => {
        const e = Ease.inOutQuad(t);
        this.root.position.lerpVectors(from, to, e);
        this.root.position.y = from.y + (to.y - from.y) * e + 4 * height * t * (1 - t);
        const st = 1 + Math.sin(t * Math.PI) * 0.16;
        this.body.scale.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st));
        this.arms.forEach((a, i) => { a.rotation.z = (i ? 1 : -1) * (0.35 + Math.sin(t * Math.PI) * 0.9); });
        if (spin) this.body.rotation.y = startRot + spin * e;
      },
    });
    this.body.rotation.y = 0;
    this.arms.forEach((a, i) => { a.rotation.z = (i ? 1 : -1) * 0.35; });
    this.root.position.copy(to);
    await tween({ duration: 0.1, ease: Ease.outQuad, onUpdate: (t) => { const s = 1 - Math.sin(t * Math.PI) * 0.22; this.body.scale.set(1 + (1 - s) * 0.6, s, 1 + (1 - s) * 0.6); } });
    this.body.scale.set(1, 1, 1);
    this.anim = null;
  }

  async celebrate() {
    this.anim = 'celebrate';
    this.setExpression('grin');
    const base = this.root.position.y;
    for (let k = 0; k < 2; k++) {
      await tween({
        duration: 0.42, ease: Ease.linear,
        onUpdate: (t) => {
          this.root.position.y = base + 4 * 0.45 * t * (1 - t);
          this.body.rotation.y = t * Math.PI * 2 * (k % 2 ? -1 : 1);
          this.arms.forEach((a, i) => { a.rotation.z = (i ? 1 : -1) * (2.6 + Math.sin(t * 20) * 0.2); });
          const st = 1 + Math.sin(t * Math.PI) * 0.12;
          this.body.scale.set(1 / Math.sqrt(st), st, 1 / Math.sqrt(st));
        },
      });
      await this.squash(0.2, 0.1);
    }
    this.root.position.y = base;
    this.body.rotation.y = 0;
    this.arms.forEach((a, i) => { a.rotation.z = (i ? 1 : -1) * 0.35; });
    this.anim = null;
    setTimeout(() => this.setExpression('happy'), 900);
  }

  async wave() {
    this.anim = 'wave';
    const arm = this.arms[1];
    await tween({ duration: 0.8, ease: Ease.linear, onUpdate: (t) => { arm.rotation.z = 2.5 + Math.sin(t * Math.PI * 5) * 0.35; arm.rotation.x = -0.3; } });
    arm.rotation.set(0, 0, 0.35);
    this.anim = null;
  }

  async sad() {
    this.anim = 'sad';
    this.setExpression('sad');
    await tween({ duration: 0.5, ease: Ease.outCubic, onUpdate: (t, e) => { this.body.scale.set(1 + e * 0.08, 1 - e * 0.12, 1 + e * 0.08); this.face.rotation.x = e * 0.25; this.arms.forEach((a, i) => { a.rotation.z = (i ? 1 : -1) * (0.35 - e * 0.3); }); } });
    await wait(0.7);
    await tween({ duration: 0.4, ease: Ease.outCubic, onUpdate: (t, e) => { this.body.scale.set(1.08 - e * 0.08, 0.88 + e * 0.12, 1.08 - e * 0.08); this.face.rotation.x = 0.25 * (1 - e); } });
    this.anim = null;
    setTimeout(() => this.setExpression('happy'), 600);
  }

  async angry() {
    this.anim = 'angry';
    this.setExpression('angry');
    const x0 = this.root.position.x, z0 = this.root.position.z;
    await tween({ duration: 0.6, ease: Ease.linear, onUpdate: (t) => { const s = Math.sin(t * 60) * 0.035 * (1 - t); this.root.position.x = x0 + s; this.root.position.z = z0 + s * 0.5; this.arms.forEach((a, i) => { a.rotation.z = (i ? 1 : -1) * (1.2 + Math.sin(t * 40) * 0.4); }); } });
    this.root.position.x = x0; this.root.position.z = z0;
    this.arms.forEach((a, i) => { a.rotation.z = (i ? 1 : -1) * 0.35; });
    this.anim = null;
    setTimeout(() => this.setExpression('happy'), 800);
  }

  async shocked() {
    this.anim = 'shock';
    this.setExpression('shock');
    const y0 = this.root.position.y;
    await tween({ duration: 0.3, ease: Ease.linear, onUpdate: (t) => { this.root.position.y = y0 + 4 * 0.25 * t * (1 - t); const st = 1 + Math.sin(t * Math.PI) * 0.25; this.body.scale.set(1 / st, st, 1 / st); } });
    this.root.position.y = y0;
    this.body.scale.set(1, 1, 1);
    this.anim = null;
    setTimeout(() => this.setExpression('happy'), 1100);
  }

  async flop() {
    // fall over backwards (lost a duel / bankrupt)
    this.anim = 'flop';
    this.setExpression('shock');
    await tween({ duration: 0.45, ease: Ease.outBounce, onUpdate: (t, e) => { this.body.rotation.x = -e * Math.PI / 2; } });
    this.setExpression('sad');
  }

  async getUp() {
    await tween({ duration: 0.35, ease: Ease.outBack, onUpdate: (t, e) => { this.body.rotation.x = -(1 - e) * Math.PI / 2; } });
    this.body.rotation.x = 0;
    this.anim = null;
    this.setExpression('happy');
  }

  dispose() {
    this.root.traverse((o) => { if (o.isMesh && !o.geometry.userData.cached) o.geometry.dispose(); });
  }
}

/** Render a portrait PNG for each character (used by the UI). */
export function renderPortraits(size = 192) {
  const out = {};
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    return out;
  }
  renderer.setSize(size, size);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const key = new THREE.DirectionalLight('#fff4e6', 2.6);
  key.position.set(1.5, 2.5, 3);
  const rim = new THREE.DirectionalLight('#bfe0ff', 1.6);
  rim.position.set(-2, 1.5, -2);
  scene.add(key, rim, new THREE.HemisphereLight('#ffffff', '#b8a0ff', 1.2));
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
  cam.position.set(0.35, 0.78, 2.1);
  cam.lookAt(0, 0.52, 0);
  for (const c of ROSTER) {
    const p = new Pawn(c.id);
    p.root.rotation.y = 0.25;
    p.lookTarget = cam.position;
    p.update(0.016, 0, cam);
    p.eyes.forEach((e) => { e.scale.y = 1; });
    scene.add(p.root);
    renderer.render(scene, cam);
    out[c.id] = renderer.domElement.toDataURL('image/png');
    scene.remove(p.root);
    p.dispose();
  }
  renderer.dispose();
  renderer.forceContextLoss?.();
  return out;
}
