// Particle & juice effects: glow sparks, dust puffs, confetti, flying coins,
// shockwave rings and fireworks. All pooled, all updated on the main clock.
import * as THREE from "three";
import { tween, Ease, wait } from "../core/tween.js";
import { rand } from "../core/rng.js";
import { audio } from "../audio/audio.js";

const pointVert = /* glsl */`
  attribute float aSize; attribute vec4 aColor;
  uniform float uScale;
  varying vec4 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const pointFrag = /* glsl */`
  varying vec4 vColor;
  uniform float uSoft;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.5 - uSoft, d);
    if (a <= 0.0) discard;
    gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  }
`;

class PointPool {
  constructor(scene, max, additive, soft = 0.5) {
    this.max = max;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: pointVert, fragmentShader: pointFrag,
      uniforms: { uScale: { value: 400 }, uSoft: { value: soft } },
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
    this.parts = [];
    this.free = [];
    for (let i = 0; i < max; i++) { this.parts.push({ alive: false, i }); this.free.push(i); this.size[i] = 0; }
  }
  spawn(o) {
    const i = this.free.pop();
    if (i === undefined) return;
    const p = this.parts[i];
    Object.assign(p, {
      alive: true, x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      g: o.g ?? -6, drag: o.drag ?? 1.5, life: o.life ?? 1, age: 0, s0: o.size ?? 0.2, s1: o.size1 ?? 0,
      c: new THREE.Color(o.color || '#fff'), a: o.alpha ?? 1, grow: o.grow || 0,
    });
  }
  update(dt) {
    for (const p of this.parts) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) { p.alive = false; this.free.push(p.i); this.size[p.i] = 0; continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy = p.vy * k + p.g * dt; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const t = p.age / p.life;
      const i3 = p.i * 3, i4 = p.i * 4;
      this.pos[i3] = p.x; this.pos[i3 + 1] = p.y; this.pos[i3 + 2] = p.z;
      this.col[i4] = p.c.r; this.col[i4 + 1] = p.c.g; this.col[i4 + 2] = p.c.b;
      this.col[i4 + 3] = p.a * (t < 0.1 ? t / 0.1 : 1 - Math.pow((t - 0.1) / 0.9, 1.6));
      this.size[p.i] = (p.s0 + (p.s1 - p.s0) * t) * (1 + p.grow * t);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene, stage) {
    this.scene = scene;
    this.stage = stage;
    this.glow = new PointPool(scene, 1400, true, 0.5);
    this.dustPool = new PointPool(scene, 500, false, 0.45);
    this.buildConfetti();
    this.buildCoins();
    this.rings = [];
  }

  setScale(camera) {
    const h = this.stage.renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    const s = (h / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    this.glow.mat.uniforms.uScale.value = s;
    this.dustPool.mat.uniforms.uScale.value = s;
  }

  // ───────────────────────────── confetti
  buildConfetti() {
    const N = 700;
    const geo = new THREE.PlaneGeometry(0.07, 0.12);
    const m = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.5, metalness: 0.2 });
    this.conf = new THREE.InstancedMesh(geo, m, N);
    this.conf.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.conf.frustumCulled = false;
    this.confP = [];
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      this.confP.push({ alive: false });
      this.conf.setColorAt(i, c.set('#fff'));
      this.conf.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    }
    this.confNext = 0;
    this.scene.add(this.conf);
  }

  confetti(pos, { count = 80, colors = ['#ff5d73', '#ffd166', '#4cc9f0', '#7bd389', '#c77dff', '#ffffff'], speed = 5, up = 6, spread = 1 } = {}) {
    const c = new THREE.Color();
    for (let k = 0; k < count; k++) {
      const i = this.confNext = (this.confNext + 1) % this.confP.length;
      const a = rand(0, Math.PI * 2);
      const sp = rand(0.3, 1) * speed;
      this.confP[i] = {
        alive: true, age: 0, life: rand(2.2, 3.4),
        p: new THREE.Vector3(pos.x + rand(-0.2, 0.2) * spread, pos.y, pos.z + rand(-0.2, 0.2) * spread),
        v: new THREE.Vector3(Math.cos(a) * sp, rand(0.5, 1) * up, Math.sin(a) * sp),
        r: new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)),
        w: new THREE.Vector3(rand(-12, 12), rand(-12, 12), rand(-12, 12)),
        flutter: rand(0, 6),
      };
      this.conf.setColorAt(i, c.set(colors[k % colors.length]));
    }
    this.conf.instanceColor.needsUpdate = true;
  }

  // ───────────────────────────── coins
  buildCoins() {
    const N = 160;
    const geo = new THREE.CylinderGeometry(0.13, 0.13, 0.035, 18);
    geo.rotateX(Math.PI / 2);
    const m = new THREE.MeshStandardMaterial({ color: '#ffcf4a', metalness: 0.85, roughness: 0.25, emissive: '#7a4f00', emissiveIntensity: 0.25 });
    this.coins = new THREE.InstancedMesh(geo, m, N);
    this.coins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coins.frustumCulled = false;
    this.coins.castShadow = true;
    this.coinP = [];
    for (let i = 0; i < N; i++) { this.coinP.push({ alive: false }); this.coins.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); }
    this.coinNext = 0;
    this.scene.add(this.coins);
  }

  /**
   * Fly `count` coins from a to b in arcs. onCoin(k) fires as each lands.
   * Resolves when the last coin arrives.
   */
  coinStream(a, b, count = 10, { duration = 0.75, stagger = 0.05, height = 2.5, onCoin, sound = true, scatter = 0.35 } = {}) {
    let resolveAll;
    const done = new Promise((r) => (resolveAll = r));
    let landed = 0;
    const n = Math.max(1, Math.min(count, 60));
    for (let k = 0; k < n; k++) {
      const i = this.coinNext = (this.coinNext + 1) % this.coinP.length;
      const from = a.clone().add(new THREE.Vector3(rand(-scatter, scatter), rand(0, 0.3), rand(-scatter, scatter)));
      const to = b.clone().add(new THREE.Vector3(rand(-scatter, scatter) * 0.6, rand(0, 0.2), rand(-scatter, scatter) * 0.6));
      const dist = from.distanceTo(to);
      this.coinP[i] = {
        alive: true, age: -k * stagger, life: duration * (0.85 + Math.min(1.2, dist / 12)), from, to,
        h: height + dist * 0.18 + rand(-0.3, 0.3), spin: rand(8, 16), axis: new THREE.Vector3(rand(-1, 1), 1, rand(-1, 1)).normalize(),
        onLand: () => {
          landed++;
          if (sound) audio.play('coin', { pitch: 0.9 + (landed / n) * 0.4, minGap: 0.03 });
          this.sparks(to, { count: 3, color: '#ffe38a', speed: 1.5, size: 0.12, life: 0.4 });
          onCoin?.(landed, n);
          if (landed === n) resolveAll();
        },
      };
    }
    return done;
  }

  /** Coins bursting out of a point (e.g. vault jackpot / salary). */
  coinFountain(pos, count = 20) {
    for (let k = 0; k < count; k++) {
      const a = rand(0, Math.PI * 2), r = rand(0.5, 2.2);
      const to = pos.clone().add(new THREE.Vector3(Math.cos(a) * r, -pos.y + 0.05, Math.sin(a) * r));
      const i = this.coinNext = (this.coinNext + 1) % this.coinP.length;
      this.coinP[i] = {
        alive: true, age: -k * 0.02, life: rand(0.7, 1.1), from: pos.clone(), to, h: rand(1.5, 3), spin: rand(8, 16),
        axis: new THREE.Vector3(rand(-1, 1), 1, rand(-1, 1)).normalize(), fade: true,
        onLand: () => { if (k % 3 === 0) audio.play('coin', { pitch: rand(0.8, 1.3), vol: 0.6 }); },
      };
    }
  }

  // ───────────────────────────── particles
  sparks(pos, { count = 20, color = '#ffe38a', speed = 3, size = 0.18, life = 0.8, up = 1, g = -4, colors = null } = {}) {
    for (let k = 0; k < count; k++) {
      const a = rand(0, Math.PI * 2), el = rand(-0.2, 1) * up;
      const sp = rand(0.3, 1) * speed;
      this.glow.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(a) * sp, vy: el * sp + rand(0, 1), vz: Math.sin(a) * sp,
        g, drag: 2, life: rand(0.6, 1) * life, size: size * rand(0.6, 1.3), size1: 0,
        color: colors ? colors[k % colors.length] : color,
      });
    }
  }

  dust(pos, count = 10, spread = 0.6, color = '#f3e6cf') {
    for (let k = 0; k < count; k++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(0.6, 1.4) * spread * 1.6;
      this.dustPool.spawn({
        x: pos.x + Math.cos(a) * 0.1, y: pos.y + 0.05, z: pos.z + Math.sin(a) * 0.1,
        vx: Math.cos(a) * sp, vy: rand(0.2, 0.9), vz: Math.sin(a) * sp,
        g: 0.4, drag: 3.5, life: rand(0.5, 0.9), size: rand(0.18, 0.3) * spread * 1.4, size1: rand(0.4, 0.7) * spread * 1.4,
        color, alpha: 0.75,
      });
    }
  }

  smoke(pos, color = '#cfcfcf') {
    this.dustPool.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: rand(-0.1, 0.1), vy: 0.6, vz: rand(-0.1, 0.1), g: 0.2, drag: 0.5, life: 2.2, size: 0.15, size1: 0.6, color, alpha: 0.35 });
  }

  thunk(pos, k = 0) {
    this.dust(pos, 6, 0.45);
    audio.play('thunk', { pitch: 1 + k * 0.06, minGap: 0.02 });
  }

  ring(pos, { color = '#ffffff', radius = 1.6, duration = 0.55, width = 0.12, y = 0.12 } = {}) {
    const geo = new THREE.RingGeometry(0.8, 1, 48);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, y, pos.z);
    mesh.renderOrder = 6;
    this.scene.add(mesh);
    tween({
      duration, ease: Ease.outCubic,
      onUpdate: (t, e) => {
        const r = 0.2 + e * radius;
        mesh.scale.setScalar(r);
        geo.dispose;
        m.opacity = (1 - t) * 0.9;
        const inner = Math.max(0, 1 - width / Math.max(0.2, r));
        mesh.userData.inner = inner;
      },
      onComplete: () => { this.scene.remove(mesh); geo.dispose(); m.dispose(); },
    });
  }

  /** Vertical light pillar (purchases, landmarks). */
  pillar(pos, color = '#ffd166', h = 6, duration = 1.2) {
    const geo = new THREE.CylinderGeometry(0.5, 0.7, h, 24, 1, true);
    geo.translate(0, h / 2, 0);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    return tween({
      duration, ease: Ease.linear,
      onUpdate: (t) => { m.opacity = Math.sin(t * Math.PI) * 0.45; mesh.scale.set(1 - t * 0.6, 1, 1 - t * 0.6); mesh.rotation.y = t * 4; },
      onComplete: () => { this.scene.remove(mesh); geo.dispose(); m.dispose(); },
    });
  }

  async firework(pos, color) {
    const col = color || ['#ff5d73', '#ffd166', '#4cc9f0', '#7bd389', '#c77dff'][Math.floor(rand(0, 5))];
    const start = pos.clone();
    const top = pos.clone().add(new THREE.Vector3(rand(-1.5, 1.5), rand(5, 8), rand(-1.5, 1.5)));
    audio.play('whoosh', { vol: 0.3, len: 0.6 });
    await tween({
      duration: 0.7, ease: Ease.outQuad,
      onUpdate: (t, e) => {
        const p = start.clone().lerp(top, e);
        this.glow.spawn({ x: p.x, y: p.y, z: p.z, vx: rand(-0.2, 0.2), vy: -1, vz: rand(-0.2, 0.2), g: -2, life: 0.5, size: 0.2, color: '#ffe9b0' });
      },
    });
    audio.play('impact', { vol: 0.35 });
    audio.play('sparkle', { vol: 0.6 });
    for (let k = 0; k < 90; k++) {
      const u = rand(-1, 1), th = rand(0, Math.PI * 2);
      const r = Math.sqrt(1 - u * u);
      const sp = rand(4, 6);
      this.glow.spawn({ x: top.x, y: top.y, z: top.z, vx: r * Math.cos(th) * sp, vy: u * sp, vz: r * Math.sin(th) * sp, g: -3, drag: 1.6, life: rand(1.1, 1.7), size: 0.28, size1: 0.05, color: k % 5 === 0 ? '#ffffff' : col });
    }
  }

  update(dt) {
    this.glow.update(dt);
    this.dustPool.update(dt);
    // confetti
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    let anyConf = false;
    for (let i = 0; i < this.confP.length; i++) {
      const p = this.confP[i];
      if (!p.alive) continue;
      anyConf = true;
      p.age += dt;
      if (p.age > p.life || p.p.y < -0.5) { p.alive = false; this.conf.setMatrixAt(i, m4.makeScale(0, 0, 0)); continue; }
      p.v.y -= 9 * dt;
      const drag = Math.exp(-2.8 * dt);
      p.v.multiplyScalar(drag);
      p.v.y = Math.max(p.v.y, -1.6);
      p.p.addScaledVector(p.v, dt);
      p.p.x += Math.sin(p.age * 5 + p.flutter) * dt * 0.5;
      if (p.p.y < 0.1) { p.p.y = 0.1; p.v.set(0, 0, 0); p.w.multiplyScalar(0.9); }
      p.r.x += p.w.x * dt; p.r.y += p.w.y * dt; p.r.z += p.w.z * dt;
      q.setFromEuler(p.r);
      const fade = p.age > p.life - 0.5 ? (p.life - p.age) / 0.5 : 1;
      s.setScalar(fade);
      this.conf.setMatrixAt(i, m4.compose(p.p, q, s));
    }
    if (anyConf || this._confWasActive) this.conf.instanceMatrix.needsUpdate = true;
    this._confWasActive = anyConf;
    // coins
    let anyCoin = false;
    const pos = new THREE.Vector3();
    for (let i = 0; i < this.coinP.length; i++) {
      const c = this.coinP[i];
      if (!c.alive) continue;
      anyCoin = true;
      c.age += dt;
      if (c.age < 0) { this.coins.setMatrixAt(i, m4.makeScale(0, 0, 0)); continue; }
      const t = Math.min(1, c.age / c.life);
      pos.lerpVectors(c.from, c.to, t);
      pos.y += 4 * c.h * t * (1 - t);
      q.setFromAxisAngle(c.axis, c.age * c.spin);
      const sc = Math.min(1, t * 6) * (c.fade ? Math.min(1, (1 - t) * 4 + 0.2) : 1);
      s.setScalar(sc);
      this.coins.setMatrixAt(i, m4.compose(pos, q, s));
      if (t >= 1) {
        c.alive = false;
        this.coins.setMatrixAt(i, m4.makeScale(0, 0, 0));
        c.onLand?.();
      }
    }
    if (anyCoin || this._coinWasActive) this.coins.instanceMatrix.needsUpdate = true;
    this._coinWasActive = anyCoin;
  }
}
