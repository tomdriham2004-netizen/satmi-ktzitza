// Modeling toolkit: cached materials, primitive builders, procedural canvas
// textures and a static-mesh batcher. Everything in the world is built from
// these so the look stays consistent (soft "vinyl toy" materials).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const FONT_UI = '"Bricolage Grotesque Variable", "Rubik Variable", "Bricolage Grotesque", system-ui, sans-serif';
export const FONT_DISPLAY = '"Lilita One", "Secular One", "Bricolage Grotesque Variable", system-ui, sans-serif';

// ───────────────────────────────────────────── materials
const matCache = new Map();
// Materials whose emissive intensity follows the day/night cycle.
export const nightMaterials = new Set();

export function mat(color, o = {}) {
  const key = `${color}|${JSON.stringify(o)}`;
  if (matCache.has(key)) return matCache.get(key);
  const params = {
    color: new THREE.Color(color),
    roughness: o.rough ?? 0.72,
    metalness: o.metal ?? 0,
  };
  if (o.emissive) {
    params.emissive = new THREE.Color(o.emissive);
    params.emissiveIntensity = o.ei ?? 1;
  }
  if (o.transparent) { params.transparent = true; params.opacity = o.opacity ?? 0.5; params.depthWrite = o.depthWrite ?? false; }
  if (o.side) params.side = o.side;
  if (o.flat) params.flatShading = true;
  let m;
  if (o.physical) {
    m = new THREE.MeshPhysicalMaterial({
      ...params,
      clearcoat: o.clearcoat ?? 0.6,
      clearcoatRoughness: o.clearcoatRough ?? 0.25,
      sheen: o.sheen ?? 0,
    });
  } else if (o.basic) {
    m = new THREE.MeshBasicMaterial({ color: params.color, transparent: !!o.transparent, opacity: o.opacity ?? 1, depthWrite: o.depthWrite ?? !o.transparent, fog: o.fog ?? true, toneMapped: o.toneMapped ?? true });
  } else {
    m = new THREE.MeshStandardMaterial(params);
  }
  if (o.night) {
    m.userData.nightBase = o.nightBase ?? 0; // intensity during the day
    m.userData.nightPeak = o.nightPeak ?? (o.ei ?? 1.6);
    nightMaterials.add(m);
  }
  matCache.set(key, m);
  return m;
}

/** Emissive "neon" material that brightens at night. */
export function neon(color, dayI = 0.6, nightI = 3.2) {
  return mat(color, { emissive: color, ei: dayI, night: true, nightBase: dayI, nightPeak: nightI, rough: 0.4 });
}

// ───────────────────────────────────────────── meshes
function finish(mesh, o = {}) {
  mesh.castShadow = o.cast ?? true;
  mesh.receiveShadow = o.receive ?? true;
  return mesh;
}

const geoCache = new Map();
function cachedGeo(key, make) {
  if (!geoCache.has(key)) {
    const g = make();
    g.userData.cached = true;
    geoCache.set(key, g);
  }
  return geoCache.get(key);
}

export function box(w, h, d, material, o = {}) {
  const g = cachedGeo(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
  return finish(new THREE.Mesh(g, material), o);
}
export function rbox(w, h, d, r, material, o = {}) {
  const seg = o.seg ?? 3;
  const g = cachedGeo(`rbox${w},${h},${d},${r},${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) - 1e-4));
  return finish(new THREE.Mesh(g, material), o);
}
export function cyl(rt, rb, h, material, o = {}) {
  const seg = o.seg ?? 20;
  const g = cachedGeo(`cyl${rt},${rb},${h},${seg},${o.open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!o.open));
  return finish(new THREE.Mesh(g, material), o);
}
export function sphere(r, material, o = {}) {
  const ws = o.ws ?? 20, hs = o.hs ?? 14;
  const key = `sph${r},${ws},${hs},${o.phiLen ?? 'f'},${o.thetaLen ?? 'f'}`;
  const g = cachedGeo(key, () => new THREE.SphereGeometry(r, ws, hs, 0, o.phiLen ?? Math.PI * 2, 0, o.thetaLen ?? Math.PI));
  return finish(new THREE.Mesh(g, material), o);
}
export function cone(r, h, material, o = {}) {
  const seg = o.seg ?? 20;
  const g = cachedGeo(`cone${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg));
  return finish(new THREE.Mesh(g, material), o);
}
export function torus(r, tube, material, o = {}) {
  const key = `tor${r},${tube},${o.arc ?? 'f'},${o.rs ?? 10},${o.ts ?? 24}`;
  const g = cachedGeo(key, () => new THREE.TorusGeometry(r, tube, o.rs ?? 10, o.ts ?? 24, o.arc ?? Math.PI * 2));
  return finish(new THREE.Mesh(g, material), o);
}
/** Triangular prism (pitched roof). Ridge along X. */
export function prism(w, h, d, material, o = {}) {
  const g = cachedGeo(`prism${w},${h},${d}`, () => {
    const shape = new THREE.Shape();
    shape.moveTo(-d / 2, 0); shape.lineTo(d / 2, 0); shape.lineTo(0, h); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    geo.translate(0, 0, -w / 2);
    geo.rotateY(Math.PI / 2);
    geo.computeVertexNormals();
    return geo;
  });
  return finish(new THREE.Mesh(g, material), o);
}
export function plane(w, h, material, o = {}) {
  const g = cachedGeo(`plane${w},${h}`, () => new THREE.PlaneGeometry(w, h));
  return finish(new THREE.Mesh(g, material), { cast: false, ...o });
}

export function at(obj, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
  obj.position.set(x, y, z);
  obj.rotation.set(rx, ry, rz);
  return obj;
}
export function group(...children) {
  const g = new THREE.Group();
  children.forEach((c) => c && g.add(c));
  return g;
}

// ───────────────────────────────────────────── canvas textures
export function canvasTex(w, h, draw, o = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.direction = 'rtl'; // Hebrew signs: keep "₪200" and words in reading order
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.needsUpdate = true;
  return t;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Fit text into a width by shrinking the font. */
export function fitText(ctx, text, maxW, size, weight = 800, family = FONT_UI) {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${family}`;
    if (ctx.measureText(text).width <= maxW) break;
    s -= 2;
  } while (s > 8);
  return s;
}

const texCache = new Map();
export function cachedTex(key, make) {
  if (!texCache.has(key)) texCache.set(key, make());
  return texCache.get(key);
}

/** Sign texture: rounded panel with text. */
export function signTex(text, { bg = '#fff', fg = '#222', w = 512, h = 160, font = FONT_DISPLAY, border = null, weight = 400, radius = 36 } = {}) {
  return cachedTex(`sign|${text}|${bg}|${fg}|${w}|${h}|${font}|${border}`, () =>
    canvasTex(w, h, (ctx) => {
      ctx.clearRect(0, 0, w, h);
      if (bg !== 'transparent') {
        roundRect(ctx, 4, 4, w - 8, h - 8, radius);
        ctx.fillStyle = bg; ctx.fill();
        if (border) { ctx.lineWidth = 10; ctx.strokeStyle = border; ctx.stroke(); }
      }
      const s = fitText(ctx, text, w - 60, h * 0.62, weight, font);
      ctx.font = `${weight} ${s}px ${font}`;
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2 + s * 0.06);
    }));
}

export function signMesh(text, w, h, opts = {}) {
  const key = `signMat|${text}|${opts.bg}|${opts.fg}|${opts.w}|${opts.h}|${opts.font}|${opts.border}|${!!opts.glow}`;
  let m = matCache.get(key);
  if (!m) {
    const tex = signTex(text, opts);
    m = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, alphaTest: 0.05, roughness: 0.85,
      emissive: opts.glow ? new THREE.Color('#ffffff') : new THREE.Color('#000'),
      emissiveMap: opts.glow ? tex : null,
      emissiveIntensity: opts.glow ? 0.35 : 0,
    });
    if (opts.glow) { m.userData.nightBase = 0; m.userData.nightPeak = 1.3; nightMaterials.add(m); }
    matCache.set(key, m);
  }
  const mesh = new THREE.Mesh(cachedGeo(`plane${w},${h}`, () => new THREE.PlaneGeometry(w, h)), m);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

// ───────────────────────────────────────────── facade textures (windows)
function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return `#${c.getHexString()}`;
}
export { shade };

/**
 * Facade material: 4x4 window cells per texture tile. Includes an emissive map
 * (randomly lit windows) and a roughness map (glossy glass, matte wall).
 * style: 'classic' | 'arch' | 'round' | 'glass' | 'wide' | 'slats'
 */
export function facadeMat(wall, style = 'classic', glass = '#35486b') {
  const key = `facade|${wall}|${style}|${glass}`;
  if (matCache.has(key)) return matCache.get(key);
  const S = 256, C = 64;
  const cells = [];
  let seed = [...key].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 16; i++) cells.push(rnd());
  const windowPath = (ctx, x, y) => {
    if (style === 'glass') { ctx.rect(x + 3, y + 3, C - 6, C - 6); return; }
    if (style === 'wide') { ctx.rect(x + 6, y + 16, C - 12, C - 30); return; }
    if (style === 'slats') { ctx.rect(x + 22, y + 10, C - 44, C - 22); return; }
    if (style === 'round') { ctx.moveTo(x + C / 2 + 17, y + C / 2); ctx.arc(x + C / 2, y + C / 2, 17, 0, Math.PI * 2); return; }
    if (style === 'arch') {
      const l = x + 18, r = x + C - 18, top = y + 22, bot = y + C - 10;
      ctx.moveTo(l, bot); ctx.lineTo(l, top); ctx.arc((l + r) / 2, top, (r - l) / 2, Math.PI, 0); ctx.lineTo(r, bot); ctx.closePath();
      return;
    }
    ctx.rect(x + 14, y + 13, C - 28, C - 24);
  };
  const map = canvasTex(S, S, (ctx) => {
    ctx.fillStyle = wall; ctx.fillRect(0, 0, S, S);
    // subtle wall noise
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.035})`;
      ctx.fillRect(rnd() * S, rnd() * S, 2, 2);
    }
    if (style === 'slats') {
      ctx.fillStyle = shade(wall, -0.06);
      for (let y = 0; y < S; y += 8) ctx.fillRect(0, y, S, 2);
    }
    for (let cy = 0; cy < 4; cy++) {
      // floor line
      ctx.fillStyle = shade(wall, -0.08);
      if (style !== 'glass') ctx.fillRect(0, cy * C + C - 4, S, 4);
      for (let cx = 0; cx < 4; cx++) {
        const x = cx * C, y = cy * C;
        // frame
        ctx.save();
        ctx.beginPath(); windowPath(ctx, x, y);
        ctx.lineWidth = style === 'glass' ? 3 : 7;
        ctx.strokeStyle = style === 'glass' ? shade(wall, 0.15) : shade(wall, 0.18);
        ctx.stroke();
        const g = ctx.createLinearGradient(x, y, x + C, y + C);
        g.addColorStop(0, shade(glass, 0.12)); g.addColorStop(0.5, glass); g.addColorStop(1, shade(glass, -0.1));
        ctx.fillStyle = g; ctx.fill();
        ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath(); ctx.moveTo(x, y + C * 0.7); ctx.lineTo(x + C * 0.7, y); ctx.lineTo(x + C * 0.85, y); ctx.lineTo(x, y + C * 0.85); ctx.fill();
        ctx.restore();
        if (style === 'classic' || style === 'arch') {
          ctx.fillStyle = shade(wall, -0.12); // sill
          ctx.fillRect(x + 10, y + C - 12, C - 20, 4);
        }
      }
    }
  }, { repeat: true });
  const emap = canvasTex(S, S, (ctx) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
    for (let cy = 0; cy < 4; cy++) for (let cx = 0; cx < 4; cx++) {
      const r = cells[cy * 4 + cx];
      if (r < 0.35) continue;
      const warm = r > 0.8 ? '#bfe3ff' : r > 0.55 ? '#ffd58a' : '#ffb869';
      ctx.fillStyle = warm;
      ctx.globalAlpha = 0.55 + r * 0.45;
      ctx.beginPath(); windowPath(ctx, cx * C, cy * C); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, { repeat: true });
  const rmap = canvasTex(S, S, (ctx) => {
    ctx.fillStyle = 'rgb(220,220,220)'; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = 'rgb(40,40,40)';
    for (let cy = 0; cy < 4; cy++) for (let cx = 0; cx < 4; cx++) { ctx.beginPath(); windowPath(ctx, cx * C, cy * C); ctx.fill(); }
  }, { repeat: true, linear: true });
  const m = new THREE.MeshStandardMaterial({
    map, emissiveMap: emap, roughnessMap: rmap,
    emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0,
    roughness: 1, metalness: 0.05,
  });
  m.userData.nightBase = 0;
  m.userData.nightPeak = 1.35;
  nightMaterials.add(m);
  matCache.set(key, m);
  return m;
}

/**
 * Box with facade UVs: side faces repeat one window cell per `cell` units,
 * top/bottom map to plain wall.
 */
export function facadeBox(w, h, d, material, { floors = 1, cell = 0.36 } = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const faceDims = [[d, h], [d, h], null, null, [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      if (!faceDims[f]) { uv.setXY(i, 0.01, 0.01); continue; }
      const cols = Math.max(1, Math.round(faceDims[f][0] / cell));
      uv.setXY(i, uv.getX(i) * cols / 4, uv.getY(i) * floors / 4);
    }
  }
  uv.needsUpdate = true;
  return finish(new THREE.Mesh(g, material));
}

/** Striped texture (awnings, tents, candy). */
export function stripeTex(a, b, n = 8, scallop = false) {
  return cachedTex(`stripe|${a}|${b}|${n}|${scallop}`, () =>
    canvasTex(256, 256, (ctx, W, H) => {
      const sw = W / n;
      for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? b : a; ctx.fillRect(i * sw, 0, sw + 1, H); }
      if (scallop) {
        ctx.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < n; i++) {
          ctx.beginPath(); ctx.arc(i * sw + sw / 2, H, sw / 2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(0, 0, W, 10);
    }));
}
export function stripeMat(a, b, n = 8, o = {}) {
  const key = `stripeMat|${a}|${b}|${n}|${o.scallop}`;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    map: stripeTex(a, b, n, o.scallop), roughness: 0.8, side: THREE.DoubleSide,
    transparent: !!o.scallop, alphaTest: o.scallop ? 0.5 : 0,
  });
  matCache.set(key, m);
  return m;
}

// ───────────────────────────────────────────── batching
/**
 * Merge all static meshes under `root` into one mesh per material. Meshes (or
 * ancestors) flagged userData.dynamic are kept as-is. Returns the new group.
 */
export function bake(root, { keepDynamic = true } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const dynamic = [];
  const walk = (o) => {
    for (const c of o.children) {
      if (c.userData.dynamic) { dynamic.push(c); continue; }
      if (c.isMesh && !Array.isArray(c.material) && !c.isInstancedMesh && !c.isSkinnedMesh && c.visible) {
        const geo = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
        for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
        if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
        if (!geo.attributes.normal) geo.computeVertexNormals();
        geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld));
        const k = c.material.uuid + (c.castShadow ? 'c' : '') + (c.receiveShadow ? 'r' : '');
        if (!buckets.has(k)) buckets.set(k, { material: c.material, cast: c.castShadow, receive: c.receiveShadow, geos: [] });
        buckets.get(k).geos.push(geo);
      } else if (c.isMesh || c.isPoints || c.isLine || c.isSprite) {
        dynamic.push(c);
        continue;
      }
      walk(c);
    }
  };
  walk(root);
  const out = new THREE.Group();
  out.position.copy(root.position); out.quaternion.copy(root.quaternion); out.scale.copy(root.scale);
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, b.material);
    m.castShadow = b.cast; m.receiveShadow = b.receive;
    out.add(m);
    b.geos.forEach((g) => g.dispose());
  }
  if (keepDynamic) {
    for (const d of dynamic) {
      // re-parent preserving transform relative to root
      const mw = d.matrixWorld.clone();
      const rel = new THREE.Matrix4().multiplyMatrices(inv, mw);
      d.parent?.remove(d);
      rel.decompose(d.position, d.quaternion, d.scale);
      out.add(d);
    }
  }
  return out;
}

/** Bake a group in place: its static meshes are merged, dynamic children kept. */
export function bakeChildren(g) {
  const parent = g.parent;
  if (parent) parent.remove(g);
  g.updateMatrixWorld(true);
  const saved = { p: g.position.clone(), q: g.quaternion.clone(), s: g.scale.clone() };
  g.position.set(0, 0, 0); g.quaternion.identity(); g.scale.set(1, 1, 1);
  g.updateMatrixWorld(true);
  const b = bake(g);
  while (g.children.length) g.remove(g.children[0]);
  for (const c of [...b.children]) g.add(c);
  g.position.copy(saved.p); g.quaternion.copy(saved.q); g.scale.copy(saved.s);
  if (parent) parent.add(g);
  return g;
}

export function disposeTree(obj) {
  obj.traverse((o) => {
    if ((o.isMesh || o.isPoints || o.isLine) && o.geometry && !o.geometry.userData.cached) o.geometry.dispose();
  });
}

export function dynamic(obj) { obj.userData.dynamic = true; return obj; }
