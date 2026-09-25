// The world around the board: sky, sun/moon, ocean, island, clouds, birds,
// boats and a hot-air balloon — plus the day/night cycle driving all of it.
import * as THREE from "three";
import { HALF } from "./layout.js";
import { mat, box, cyl, sphere, cone, group, at, nightMaterials, stripeMat, dynamic, bakeChildren } from "./kit.js";
import { lerp, damp, clamp } from "../core/tween.js";

// Keyframes: 0 morning, 1 noon, 2 dusk, 3 night (cyclic)
const KEYS = [
  { elev: 24, az: 125, sun: '#ffd6a3', sunI: 2.9, hemiSky: '#bfe0ff', hemiGnd: '#e8c9a0', hemiI: 0.55, top: '#62aefc', hor: '#ffe0c2', env: 0.32, night: 0, exposure: 0.95, bloom: 0.14, water: ['#2fb3cf', '#6ee6e0'] },
  { elev: 50, az: 170, sun: '#fff1d8', sunI: 2.35, hemiSky: '#c6e2ff', hemiGnd: '#cdb890', hemiI: 0.4, top: '#3f98ff', hor: '#c4ebff', env: 0.22, night: 0, exposure: 0.84, bloom: 0.08, water: ['#1ea5cf', '#5fe8e0'] },
  { elev: 11, az: 235, sun: '#ff8f55', sunI: 2.6, hemiSky: '#e0a0a8', hemiGnd: '#5a4a7c', hemiI: 0.45, top: '#4a4fb8', hor: '#ffa56e', env: 0.22, night: 0.5, exposure: 1.02, bloom: 0.42, water: ['#3a4f9a', '#e0877a'] },
  { elev: 48, az: 300, sun: '#7f9cff', sunI: 0.7, hemiSky: '#3a4a8f', hemiGnd: '#161630', hemiI: 0.36, top: '#050922', hor: '#1f2a62', env: 0.08, night: 1, exposure: 1.0, bloom: 0.75, water: ['#071640', '#123a78'] },
];

const tmpA = new THREE.Color(), tmpB = new THREE.Color();
function lerpColor(a, b, t, out) { return out.copy(tmpA.set(a)).lerp(tmpB.set(b), t); }

export class Environment {
  constructor(stage) {
    this.stage = stage;
    this.scene = stage.scene;
    this.time = 0;          // continuous 0..4
    this.target = 0;
    this.nightFactor = 0;
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.animated = [];

    this.buildLights();
    this.buildSky();
    this.buildWater();
    this.buildIsland();
    this.buildClouds();
    this.buildBirds();
    this.buildBoats();
    this.buildBalloon();
    this.buildDistantIslands();
    this.apply(0);
  }

  // ───────────────────────────────────────────── lights
  buildLights() {
    const sun = new THREE.DirectionalLight('#fff', 3);
    sun.castShadow = true;
    const hi = this.stage.quality === 'high';
    sun.shadow.mapSize.set(hi ? 4096 : 2048, hi ? 4096 : 2048);
    const S = 19;
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 20, far: 200 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = 3;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    this.hemi = new THREE.HemisphereLight('#cfe8ff', '#e8d1a8', 1);
    this.scene.add(this.hemi);
    this.scene.fog = new THREE.Fog('#ffe0c2', 90, 330);
  }

  // ───────────────────────────────────────────── sky
  buildSky() {
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() },
        uNight: { value: 0 }, uTime: { value: 0 },
      },
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uTop, uHor, uSunDir, uSunCol; uniform float uNight, uTime;
        varying vec3 vDir;
        float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -1.0, 1.0);
          vec3 col = mix(uHor, uTop, pow(smoothstep(-0.02, 0.65, h), 0.8));
          col = mix(col, uHor * 0.92, smoothstep(0.02, -0.25, h));
          float sd = max(dot(d, normalize(uSunDir)), 0.0);
          col += uSunCol * (pow(sd, 900.0) * 6.0 * (1.0 - uNight * 0.6) + pow(sd, 12.0) * 0.28 + pow(sd, 3.0) * 0.08);
          // stars
          if (uNight > 0.01 && h > 0.0) {
            vec3 cell = floor(d * 160.0);
            float s = hash(cell);
            float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 40.0);
            col += vec3(0.9, 0.95, 1.0) * step(0.9975, s) * uNight * tw * smoothstep(0.0, 0.25, h) * 1.4;
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), this.skyMat);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.root.add(sky);
    this.sky = sky;
  }

  // ───────────────────────────────────────────── water
  buildWater() {
    this.waterMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color('#1ea5cf') }, uShallow: { value: new THREE.Color('#5fe8e0') },
        uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.2) }, uSunCol: { value: new THREE.Color('#fff') },
        uSky: { value: new THREE.Color('#bfe6ff') }, uFog: { value: new THREE.Color('#fff') },
        uFogNear: { value: 90 }, uFogFar: { value: 330 }, uHalf: { value: HALF + 3.4 }, uNight: { value: 0 },
      },
      vertexShader: /* glsl */`
        uniform float uTime;
        varying vec3 vW; varying vec3 vN; varying float vFogDepth;
        float wave(vec2 p, vec2 dir, float freq, float speed, float amp) { return sin(dot(p, dir) * freq + uTime * speed) * amp; }
        void main() {
          vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
          vec2 q = p.xz;
          float h = wave(q, normalize(vec2(1.0, 0.3)), 0.35, 1.2, 0.09) + wave(q, normalize(vec2(-0.4, 1.0)), 0.52, 1.6, 0.06) + wave(q, normalize(vec2(0.7, -0.8)), 1.1, 2.3, 0.025);
          float e = 0.1;
          float hx = wave(q + vec2(e, 0.0), normalize(vec2(1.0, 0.3)), 0.35, 1.2, 0.09) + wave(q + vec2(e, 0.0), normalize(vec2(-0.4, 1.0)), 0.52, 1.6, 0.06) + wave(q + vec2(e, 0.0), normalize(vec2(0.7, -0.8)), 1.1, 2.3, 0.025);
          float hz = wave(q + vec2(0.0, e), normalize(vec2(1.0, 0.3)), 0.35, 1.2, 0.09) + wave(q + vec2(0.0, e), normalize(vec2(-0.4, 1.0)), 0.52, 1.6, 0.06) + wave(q + vec2(0.0, e), normalize(vec2(0.7, -0.8)), 1.1, 2.3, 0.025);
          p.y += h;
          vN = normalize(vec3(-(hx - h) / e, 1.0, -(hz - h) / e));
          vW = p;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vFogDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime, uFogNear, uFogFar, uHalf, uNight;
        uniform vec3 uDeep, uShallow, uSunDir, uSunCol, uSky, uFog;
        varying vec3 vW; varying vec3 vN; varying float vFogDepth;
        float sdRoundBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
        float noise(vec2 p) { return sin(p.x * 1.7 + sin(p.y * 1.3 + uTime * 0.6)) * sin(p.y * 1.9 + sin(p.x * 1.1 - uTime * 0.5)); }
        void main() {
          float d = sdRoundBox(vW.xz, vec2(uHalf), 3.2);
          float shore = exp(-max(d, 0.0) / 5.5);
          vec3 col = mix(uDeep, uShallow, shore);
          // caustic shimmer in the shallows
          float c = noise(vW.xz * 1.6) * 0.5 + 0.5;
          col += uShallow * pow(c, 6.0) * shore * 0.35;
          // foam bands lapping the beach
          float band = fract(d * 0.55 - uTime * 0.22 + noise(vW.xz * 0.6) * 0.25);
          float foam = smoothstep(0.92, 1.0, band) * smoothstep(9.0, 0.5, d);
          foam += smoothstep(1.2, 0.0, d) * (0.55 + 0.45 * noise(vW.xz * 3.0 + uTime));
          vec3 V = normalize(cameraPosition - vW);
          vec3 N = normalize(vN);
          float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
          col = mix(col, uSky, fres * 0.55);
          vec3 H = normalize(normalize(uSunDir) + V);
          float spec = (pow(max(dot(N, H), 0.0), 260.0) * 3.0 + pow(max(dot(N, H), 0.0), 40.0) * 0.12) * (1.0 - uNight * 0.93);
          col += uSunCol * spec;
          col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0) * (0.85 - uNight * 0.5));
          float f = smoothstep(uFogNear, uFogFar, vFogDepth);
          col = mix(col, uFog, f);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const geo = new THREE.PlaneGeometry(700, 700, 220, 220);
    geo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(geo, this.waterMat);
    water.position.y = -0.62;
    water.receiveShadow = false;
    this.root.add(water);
    this.water = water;
  }

  // ───────────────────────────────────────────── island
  buildIsland() {
    const H = HALF;
    const shape = new THREE.Shape();
    const s = H + 1.6, r = 3.4;
    shape.moveTo(-s + r, -s);
    shape.lineTo(s - r, -s); shape.quadraticCurveTo(s, -s, s, -s + r);
    shape.lineTo(s, s - r); shape.quadraticCurveTo(s, s, s - r, s);
    shape.lineTo(-s + r, s); shape.quadraticCurveTo(-s, s, -s, s - r);
    shape.lineTo(-s, -s + r); shape.quadraticCurveTo(-s, -s, -s + r, -s);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: true, bevelThickness: 0.9, bevelSize: 2.6, bevelSegments: 6, curveSegments: 16 });
    geo.rotateX(-Math.PI / 2);
    const sandTex = this.sandTexture();
    const sand = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#efcf95', roughness: 0.95, map: sandTex }));
    sand.position.y = -2.2;
    sand.receiveShadow = true;
    this.root.add(sand);

    // Grass plateau the board sits on
    const plateau = new THREE.Mesh(
      new THREE.BoxGeometry(H * 2 + 0.9, 0.5, H * 2 + 0.9),
      mat('#6fc56a', { rough: 0.9 }),
    );
    plateau.position.y = -0.3;
    plateau.receiveShadow = true;
    this.root.add(plateau);
    // stone curb
    const curbM = mat('#e9e2d3', { rough: 0.85 });
    for (let i = 0; i < 4; i++) {
      const c = box(H * 2 + 1.1, 0.22, 0.28, curbM);
      const a = (i * Math.PI) / 2;
      c.position.set(Math.sin(a) * (H + 0.45), -0.1, Math.cos(a) * (H + 0.45));
      c.rotation.y = a;
      this.root.add(c);
    }

    // Beach props: palms, rocks, umbrellas, lighthouse
    const beach = new THREE.Group();
    const B = H + 2.5;
    const palmSpots = [[B, B - 3], [B - 3, B + 0.4], [-B, B - 2], [-B + 1, -B], [B - 1, -B + 0.2], [B + 0.3, -3], [-B - 0.2, 4], [4, B + 0.4], [-6, -B - 0.2]];
    this.occluders = [];
    palmSpots.forEach(([x, z], i) => {
      const palm = bakeChildren(at(makePalm(0.9 + (i % 3) * 0.15), x, -0.35, z, i * 1.7));
      beach.add(palm);
      this.occluders.push({ obj: palm, r: 1.5, h: 1.8, s: 1 });
    });
    const rockM = mat('#9a9aa6', { rough: 0.9, flat: true });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.2;
      const rr = H + 4.6 + (i % 3) * 0.6;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + (i % 4) * 0.18, 0), rockM);
      rock.position.set(Math.cos(a) * rr * clamp(1 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))), 1, 1.35), -0.7, Math.sin(a) * rr);
      rock.rotation.set(i, i * 2, i * 3);
      rock.castShadow = true;
      beach.add(rock);
    }
    const umbrellaColors = [['#ff6f91', '#fff'], ['#4cc9f0', '#fff'], ['#ffd166', '#ef476f']];
    [[-4, B + 0.2], [7, -B - 0.1], [-B - 0.1, -5]].forEach(([x, z], i) => {
      const u = group();
      u.add(at(cyl(0.03, 0.03, 1.4, mat('#fff')), 0, 0.7, 0));
      const top = cone(0.9, 0.35, stripeMat(umbrellaColors[i][0], umbrellaColors[i][1], 8), { seg: 8 });
      u.add(at(top, 0, 1.45, 0));
      u.add(at(box(0.5, 0.05, 1.0, mat(umbrellaColors[i][0])), 0.7, 0.03, 0));
      beach.add(at(u, x, -0.4, z, i, 0, 0.12));
      this.occluders.push({ obj: u, r: 1.1, h: 1.2, s: 1 });
    });
    this.root.add(beach);
    // lighthouse on its own rocky islet, off the camera's corner sight-lines
    const lx = -(H + 12), lz = -(H + 4);
    const islet = new THREE.Group();
    islet.add(at(cone(3.2, 1.6, mat('#8d8d99', { flat: true }), { seg: 8 }), 0, -0.6, 0));
    islet.add(at(cone(2.4, 1.0, mat('#efcf95', { flat: true }), { seg: 9 }), 0.3, -0.1, 0.2));
    islet.position.set(lx, 0, lz);
    this.root.add(islet);
    this.buildLighthouse(lx, lz);
  }

  sandTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5000; i++) {
      ctx.fillStyle = `rgba(${150 + Math.random() * 60},${120 + Math.random() * 40},80,${Math.random() * 0.12})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(8, 8);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  buildLighthouse(x, z) {
    const g = new THREE.Group();
    const white = mat('#ffffff'), red = mat('#ff4d5e');
    g.add(at(cyl(1.1, 1.3, 0.5, mat('#8d8d99', { flat: true }), { seg: 8 }), 0, 0.1, 0));
    for (let i = 0; i < 4; i++) g.add(at(cyl(0.62 - i * 0.07, 0.7 - i * 0.07, 1.0, i % 2 ? red : white), 0, 0.85 + i, 0));
    g.add(at(cyl(0.55, 0.55, 0.12, mat('#333')), 0, 4.4, 0));
    const lamp = cyl(0.38, 0.38, 0.6, mat('#fff6c8', { emissive: '#ffe28a', ei: 0.5, night: true, nightBase: 0.4, nightPeak: 5 }));
    g.add(at(lamp, 0, 4.8, 0));
    g.add(at(cone(0.55, 0.5, red), 0, 5.35, 0));
    // rotating beam
    const beamMat = new THREE.MeshBasicMaterial({ color: '#fff3c0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beamGeo = new THREE.ConeGeometry(1.4, 16, 16, 1, true);
    beamGeo.translate(0, -8, 0);
    beamGeo.rotateZ(Math.PI / 2);
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 4.8;
    g.add(beam);
    g.position.set(x, 0.3, z);
    this.root.add(g);
    this.animated.push((dt, t) => {
      beam.rotation.y = t * 0.9;
      beamMat.opacity = 0.16 * this.nightFactor;
      beam.visible = this.nightFactor > 0.02;
    });
  }

  // ───────────────────────────────────────────── clouds
  buildClouds() {
    const cloudM = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.18 });
    this.cloudMat = cloudM;
    // Invisible "shadow-only" material: the clouds overhead never block the
    // camera, but their shadows still drift across the town.
    const shadowOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    const makeCloud = (m, cast) => {
      const c = new THREE.Group();
      const n = 4 + Math.floor(Math.random() * 4);
      for (let k = 0; k < n; k++) {
        const r = 1.1 + Math.random() * 1.3;
        const s = sphere(r, m, { ws: 14, hs: 10 });
        s.position.set((k - n / 2) * 1.3 + Math.random(), Math.random() * 0.6, (Math.random() - 0.5) * 1.6);
        s.scale.y = 0.72;
        s.castShadow = cast; s.receiveShadow = false;
        c.add(s);
      }
      return bakeChildren(c);
    };
    this.clouds = [];
    // visible clouds: a slow ring around the island, out on the horizon
    for (let i = 0; i < 12; i++) {
      const c = makeCloud(cloudM, false);
      c.userData = { a: (i / 12) * Math.PI * 2 + Math.random() * 0.4, r: 70 + Math.random() * 60, y: 6 + Math.random() * 12, speed: 0.004 + Math.random() * 0.005 };
      c.scale.setScalar(1.8 + Math.random() * 1.8);
      this.root.add(c);
      this.clouds.push(c);
    }
    // shadow casters high overhead
    this.shadowClouds = [];
    for (let i = 0; i < 4; i++) {
      const c = makeCloud(shadowOnly, true);
      c.position.set(-40 + i * 22, 34, -14 + (i % 2) * 22);
      c.scale.setScalar(0.9 + Math.random() * 0.5);
      c.userData.speed = 0.5 + Math.random() * 0.3;
      this.root.add(c);
      this.shadowClouds.push(c);
    }
    this.animated.push((dt) => {
      for (const c of this.clouds) {
        const u = c.userData;
        u.a += u.speed * dt;
        c.position.set(Math.cos(u.a) * u.r, u.y, Math.sin(u.a) * u.r);
      }
      for (const c of this.shadowClouds) {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > 45) c.position.x = -45;
      }
    });
  }

  // ───────────────────────────────────────────── birds
  buildBirds() {
    const birdM = mat('#2d2d3a', { side: THREE.DoubleSide });
    const wingGeo = new THREE.BufferGeometry();
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.08, 0, 0, 0.1, 0.45, 0.02, 0], 3));
    wingGeo.computeVertexNormals();
    this.flocks = [];
    for (let f = 0; f < 2; f++) {
      const flock = new THREE.Group();
      const birds = [];
      for (let i = 0; i < 6; i++) {
        const b = new THREE.Group();
        const l = new THREE.Mesh(wingGeo, birdM), r = new THREE.Mesh(wingGeo, birdM);
        r.scale.x = -1;
        b.add(l, r);
        b.position.set(-i * 0.6 * (i % 2 ? 1 : -1) * 0.8, Math.random() * 0.4, -i * 0.7);
        b.userData = { l, r, phase: Math.random() * 6 };
        flock.add(b);
        birds.push(b);
      }
      flock.userData = { birds, radius: 22 + f * 12, height: 11 + f * 4, speed: 0.12 + f * 0.05, off: f * 3 };
      this.root.add(flock);
      this.flocks.push(flock);
    }
    this.animated.push((dt, t) => {
      for (const fl of this.flocks) {
        const u = fl.userData;
        const a = t * u.speed + u.off;
        fl.position.set(Math.cos(a) * u.radius, u.height + Math.sin(t * 0.5 + u.off) * 1.2, Math.sin(a) * u.radius);
        fl.rotation.y = -a;
        for (const b of u.birds) {
          const fl2 = Math.sin(t * 9 + b.userData.phase) * 0.7;
          b.userData.l.rotation.z = fl2; b.userData.r.rotation.z = -fl2;
        }
      }
    });
  }

  // ───────────────────────────────────────────── boats
  buildBoats() {
    this.boats = [];
    const sails = [['#ffffff', '#ff5d73'], ['#ffffff', '#3fa7ff'], ['#ffe066', '#ff8c42']];
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.25, 2.4, 10, 1, false, 0, Math.PI), mat(i % 2 ? '#ffffff' : '#2c3e66', { physical: true }));
      hull.rotation.set(0, 0, Math.PI / 2);
      hull.rotation.x = Math.PI / 2;
      hull.rotation.set(Math.PI / 2, 0, Math.PI / 2);
      hull.scale.set(1, 1, 0.8);
      hull.position.y = 0.3;
      hull.castShadow = true;
      b.add(hull);
      b.add(at(box(2.0, 0.08, 0.8, mat('#c98b58')), 0, 0.31, 0));
      b.add(at(cyl(0.035, 0.035, 2.4, mat('#6b4a3a')), 0.1, 1.5, 0));
      const sailGeo = new THREE.BufferGeometry();
      sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 2.1, 0, -1.1, 0, 0], 3));
      sailGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0], 2));
      sailGeo.computeVertexNormals();
      const sail = new THREE.Mesh(sailGeo, stripeMat(sails[i % 3][0], sails[i % 3][1], 4));
      sail.position.set(0.05, 0.45, 0);
      sail.castShadow = true;
      b.add(sail);
      b.userData = { r: 30 + i * 7, speed: (0.03 + i * 0.008) * (i % 2 ? 1 : -1), off: i * 1.9, sail };
      this.root.add(b);
      this.boats.push(b);
    }
    this.animated.push((dt, t) => {
      for (const b of this.boats) {
        const u = b.userData;
        const a = t * u.speed + u.off;
        b.position.set(Math.cos(a) * u.r, -0.62 + Math.sin(t * 1.3 + u.off) * 0.08, Math.sin(a) * u.r * 0.9);
        b.rotation.y = -a + (u.speed > 0 ? -Math.PI / 2 : Math.PI / 2);
        b.rotation.z = Math.sin(t * 1.1 + u.off) * 0.06;
        b.rotation.x = Math.cos(t * 0.9 + u.off) * 0.04;
      }
    });
  }

  // ───────────────────────────────────────────── balloon
  buildBalloon() {
    const g = new THREE.Group();
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const a = t * Math.PI;
      const r = Math.sin(a) * (1 - 0.35 * t * t) * 1.5 + (t > 0.85 ? 0.08 : 0);
      pts.push(new THREE.Vector2(Math.max(0.15, r), -Math.cos(a) * 1.7));
    }
    const env = new THREE.Mesh(new THREE.LatheGeometry(pts.reverse(), 16), stripeMat('#ff5d73', '#ffd166', 8));
    env.material = new THREE.MeshStandardMaterial({ map: env.material.map, roughness: 0.6 });
    env.castShadow = true;
    g.add(env);
    g.add(at(box(0.5, 0.4, 0.5, mat('#a0703f')), 0, -2.6, 0));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const rope = cyl(0.012, 0.012, 1.0, mat('#5a4030'));
      rope.position.set(Math.cos(a) * 0.3, -2.0, Math.sin(a) * 0.3);
      g.add(rope);
    }
    this.root.add(g);
    this.balloon = g;
    this.animated.push((dt, t) => {
      const a = t * 0.025;
      g.position.set(Math.cos(a) * 26, 15 + Math.sin(t * 0.3) * 1.5, Math.sin(a * 1.3) * 20);
      g.rotation.y = t * 0.05;
    });
  }

  buildDistantIslands() {
    const spots = [[-95, -120, 14], [130, -80, 10], [-150, 40, 18], [60, 150, 9], [170, 90, 12]];
    for (const [x, z, s] of spots) {
      const g = new THREE.Group();
      g.add(at(cone(s, s * 0.35, mat('#f1d49a', { flat: true }), { seg: 9 }), 0, s * 0.1 - 0.6, 0));
      g.add(at(cone(s * 0.72, s * 0.45, mat('#62b86a', { flat: true }), { seg: 7 }), s * 0.1, s * 0.25, s * 0.05));
      for (let i = 0; i < 3; i++) g.add(at(makePalm(s * 0.12), (i - 1) * s * 0.25, s * 0.38, (i % 2) * s * 0.15));
      g.position.set(x, 0, z);
      this.root.add(bakeChildren(g));
    }
  }

  // ───────────────────────────────────────────── day / night
  setTime(t, instant = false) {
    this.target = t;
    if (instant) { this.time = t; this.apply(t); }
  }

  apply(t) {
    const tt = ((t % 4) + 4) % 4;
    const i = Math.floor(tt), f = tt - i;
    const a = KEYS[i], b = KEYS[(i + 1) % 4];
    const e = f * f * (3 - 2 * f);
    const elev = THREE.MathUtils.degToRad(lerp(a.elev, b.elev, e));
    let az0 = a.az, az1 = b.az;
    if (az1 < az0) az1 += 360;
    const az = THREE.MathUtils.degToRad(lerp(az0, az1, e));
    const dir = new THREE.Vector3(Math.cos(elev) * Math.cos(az), Math.sin(elev), Math.cos(elev) * Math.sin(az));
    this.sunDir = dir;
    this.sun.position.copy(dir).multiplyScalar(110);
    lerpColor(a.sun, b.sun, e, this.sun.color);
    this.sun.intensity = lerp(a.sunI, b.sunI, e);
    lerpColor(a.hemiSky, b.hemiSky, e, this.hemi.color);
    lerpColor(a.hemiGnd, b.hemiGnd, e, this.hemi.groundColor);
    this.hemi.intensity = lerp(a.hemiI, b.hemiI, e);
    lerpColor(a.top, b.top, e, this.skyMat.uniforms.uTop.value);
    lerpColor(a.hor, b.hor, e, this.skyMat.uniforms.uHor.value);
    this.skyMat.uniforms.uSunDir.value.copy(dir);
    this.skyMat.uniforms.uSunCol.value.copy(this.sun.color);
    this.scene.fog.color.copy(this.skyMat.uniforms.uHor.value);
    const night = lerp(a.night, b.night, e);
    this.nightFactor = night;
    this.skyMat.uniforms.uNight.value = night;
    this.scene.environmentIntensity = lerp(a.env, b.env, e);
    this.exposure = lerp(a.exposure, b.exposure, e);
    this.stage.renderer.toneMappingExposure = this.exposure;
    this.bloomBase = lerp(a.bloom, b.bloom, e);
    const w = this.waterMat.uniforms;
    lerpColor(a.water[0], b.water[0], e, w.uDeep.value);
    lerpColor(a.water[1], b.water[1], e, w.uShallow.value);
    w.uSunDir.value.copy(dir);
    w.uSunCol.value.copy(this.sun.color).multiplyScalar(night > 0.7 ? 0.5 : 1);
    w.uSky.value.copy(this.skyMat.uniforms.uHor.value);
    w.uFog.value.copy(this.scene.fog.color);
    w.uNight.value = night;
    this.cloudMat.color.copy(this.skyMat.uniforms.uHor.value).lerp(new THREE.Color('#ffffff'), 0.65 - night * 0.4);
    this.cloudMat.emissiveIntensity = 0.2 - night * 0.15;
  }

  /** Props between the camera and what it looks at duck into the sand. */
  updateOccluders(dt, camPos, target) {
    const seg = new THREE.Vector3().subVectors(target, camPos);
    const len2 = seg.lengthSq();
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    for (const o of this.occluders) {
      o.obj.getWorldPosition(p);
      p.y += o.h;
      const k = Math.max(0, Math.min(1, q.subVectors(p, camPos).dot(seg) / len2));
      q.copy(camPos).addScaledVector(seg, k);
      const blocking = k > 0.02 && k < 0.95 && q.distanceTo(p) < o.r + 0.4;
      const goal = blocking ? 0.001 : 1;
      o.s += (goal - o.s) * (1 - Math.exp(-dt * (blocking ? 10 : 4)));
      o.obj.scale.setScalar(Math.max(0.001, o.s));
      o.obj.visible = o.s > 0.01;
    }
  }

  update(dt, t) {
    if (Math.abs(this.time - this.target) > 0.0005) {
      this.time = damp(this.time, this.target, 1.6, dt);
      this.apply(this.time);
    }
    this.skyMat.uniforms.uTime.value = t;
    this.waterMat.uniforms.uTime.value = t;
    const night = this.nightFactor;
    for (const m of nightMaterials) m.emissiveIntensity = lerp(m.userData.nightBase, m.userData.nightPeak, night);
    for (const fn of this.animated) fn(dt, t);
  }
}

// Palm tree used on the beach and distant islands.
export function makePalm(s = 1) {
  const g = new THREE.Group();
  const trunkM = mat('#b08354', { rough: 0.9 });
  const leafM = mat('#3fae5a', { rough: 0.7, side: THREE.DoubleSide });
  let x = 0, y = 0;
  for (let i = 0; i < 6; i++) {
    const seg = cyl(0.09 * s, 0.11 * s, 0.42 * s, trunkM, { seg: 7 });
    x += 0.035 * s * i;
    y += 0.4 * s;
    seg.position.set(x, y - 0.2 * s, 0);
    seg.rotation.z = -0.06 * i;
    g.add(seg);
  }
  const leafGeo = new THREE.PlaneGeometry(1.3 * s, 0.34 * s, 6, 1);
  const pos = leafGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const t = (px / (1.3 * s)) + 0.5;
    pos.setY(i, pos.getY(i) * (1 - t * 0.7));
    pos.setZ(i, -t * t * 0.45 * s);
  }
  leafGeo.translate(0.65 * s, 0, 0);
  leafGeo.computeVertexNormals();
  const crown = new THREE.Group();
  for (let k = 0; k < 7; k++) {
    const leaf = new THREE.Mesh(leafGeo, leafM);
    leaf.rotation.set(-Math.PI / 2 + 0.35, (k / 7) * Math.PI * 2, 0, 'YXZ');
    leaf.castShadow = true;
    crown.add(leaf);
  }
  crown.add(sphere(0.13 * s, mat('#7a5230')));
  crown.position.set(x, y + 0.05 * s, 0);
  g.add(crown);
  return g;
}
