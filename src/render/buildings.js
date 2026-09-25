// Procedural businesses. Every district has its own architecture and every
// business has a signature rooftop icon, so the skyline tells you who owns
// what at a glance. Buildings grow floor by floor with a stacking animation.
import * as THREE from "three";
import { TILES, DISTRICTS, isOwnable } from "../game/board.js";
import { BAND, tileLocal, tileRot } from "./layout.js";
import {
  mat, neon, box, rbox, cyl, sphere, cone, torus, prism, at, group, canvasTex, roundRect, fitText,
  FONT_UI, FONT_DISPLAY, signMesh, stripeMat, bake, bakeChildren, dynamic, facadeMat, facadeBox, shade, disposeTree,
} from "./kit.js";
import { tween, Ease, wait } from "../core/tween.js";
import { hash01 } from "../core/rng.js";

const THEMES = {
  rust:    { walls: ['#c47c50', '#a9674a', '#b98a5e'], trim: '#4a3b33', roof: 'saw', roofColor: '#7d5a45', facade: 'slats', glass: '#3a3140', awning: ['#e8543d', '#f4e1c1'], mul: 1 },
  bay:     { walls: ['#ffffff', '#e2f6fd', '#fff1d6'], trim: '#46b8e8', roof: 'pitched', roofColor: '#46b8e8', facade: 'classic', glass: '#3b6d8f', awning: ['#46b8e8', '#ffffff'], mul: 1 },
  candy:   { walls: ['#ffd1e3', '#ffe6f1', '#eadbff'], trim: '#ff6fae', roof: 'dome', roofColor: '#ff6fae', facade: 'round', glass: '#6b3a64', awning: ['#ff6fae', '#ffffff'], mul: 1 },
  arcade:  { walls: ['#3b2b63', '#2f3a6e', '#4a2d5e'], trim: '#ff9a3c', roof: 'billboard', roofColor: '#2b2140', facade: 'wide', glass: '#141030', awning: ['#ff9a3c', '#2b1f4a'], neon: ['#ff9a3c', '#3cf0ff', '#ff4fd8'], mul: 1 },
  show:    { walls: ['#b8323a', '#f2e6d0', '#9e2a33'], trim: '#ffc83d', roof: 'deco', roofColor: '#ffc83d', facade: 'arch', glass: '#2b1a24', awning: ['#b8323a', '#ffc83d'], mul: 1.1 },
  sunny:   { walls: ['#ffe7a3', '#fff4d6', '#ffd98a'], trim: '#ffffff', roof: 'terracotta', roofColor: '#e2733f', facade: 'arch', glass: '#2f5f7a', awning: ['#ffc93c', '#ffffff'], mul: 1 },
  circuit: { walls: ['#eef8f2', '#e0f3ea', '#f4f7fb'], trim: '#2fcf85', roof: 'solar', roofColor: '#1f3b5c', facade: 'glass', glass: '#2c8f72', awning: ['#2fcf85', '#ffffff'], mul: 1.1 },
  skyline: { walls: ['#26315c', '#1f2a4d', '#2d3a70'], trim: '#f2c14e', roof: 'spire', roofColor: '#f2c14e', facade: 'glass', glass: '#7094ff', awning: ['#f2c14e', '#26315c'], mul: 1.35 },
};

const FLOOR_H = 0.36;
const FLOORS = [1, 1, 2, 3, 4, 6];
const FOOT_W = [0.9, 1.1, 1.28, 1.38, 1.44, 1.52];
const FOOT_D = [0.75, 0.95, 1.05, 1.15, 1.2, 1.26];

// ───────────────────────────────────────────── signature props
function signature(biz, big = false) {
  const g = new THREE.Group();
  const gold = mat('#ffc83d', { metal: 0.8, rough: 0.25 });
  switch (biz) {
    case 'Food Truck': {
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 24, 1, true, -Math.PI / 2, Math.PI), mat('#f6c453', { side: THREE.DoubleSide }));
      shell.rotation.x = Math.PI / 2; shell.rotation.z = Math.PI;
      shell.position.y = 0.3;
      g.add(shell);
      g.add(at(box(0.5, 0.06, 0.16, mat('#5bbf4a')), 0, 0.32, 0));
      for (let k = 0; k < 3; k++) g.add(at(sphere(0.05, mat('#e8443a')), -0.14 + k * 0.14, 0.36, 0));
      break;
    }
    case 'Junkyard': {
      const gear = new THREE.Group();
      gear.add(cyl(0.22, 0.22, 0.08, mat('#9aa3b0', { metal: 0.7, rough: 0.4 }), { seg: 16 }));
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        gear.add(at(box(0.08, 0.08, 0.1, mat('#9aa3b0', { metal: 0.7, rough: 0.4 })), Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25, -a));
      }
      gear.add(cyl(0.07, 0.07, 0.1, mat('#555')));
      gear.rotation.x = Math.PI / 2;
      gear.position.y = 0.32;
      g.add(gear);
      break;
    }
    case 'Surf Shop': {
      const b = sphere(0.3, stripeMat('#ff6f61', '#ffffff', 3), { ws: 20, hs: 12 });
      b.scale.set(0.35, 1.25, 0.07);
      b.position.y = 0.38;
      b.rotation.z = 0.25;
      g.add(b);
      break;
    }
    case 'Ice Cream': {
      const c = cone(0.14, 0.4, mat('#e0a458'), { seg: 16 });
      c.rotation.x = Math.PI; c.position.y = 0.2;
      g.add(c);
      g.add(at(sphere(0.15, mat('#ff9ecb')), 0, 0.44, 0));
      g.add(at(sphere(0.13, mat('#9ef0c9')), 0, 0.62, 0));
      g.add(at(sphere(0.04, mat('#e8203a')), 0, 0.77, 0));
      break;
    }
    case 'Café': {
      g.add(at(cyl(0.17, 0.13, 0.3, mat('#ffffff'), { seg: 20 }), 0, 0.17, 0));
      g.add(at(cyl(0.15, 0.15, 0.02, mat('#6b3e26')), 0, 0.31, 0));
      g.add(at(torus(0.08, 0.025, mat('#ffffff')), 0.19, 0.18, 0));
      g.add(at(cyl(0.22, 0.22, 0.02, mat('#ffffff')), 0, 0.02, 0));
      break;
    }
    case 'Sweet Shop': {
      const swirl = canvasTex(128, 128, (ctx) => {
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 128, 128);
        ctx.strokeStyle = '#ff4f9a'; ctx.lineWidth = 14;
        ctx.beginPath();
        for (let a = 0; a < 18; a += 0.1) ctx.lineTo(64 + Math.cos(a) * a * 3.4, 64 + Math.sin(a) * a * 3.4);
        ctx.stroke();
      });
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.06, 28), [mat('#ff4f9a'), new THREE.MeshStandardMaterial({ map: swirl, roughness: 0.3 }), new THREE.MeshStandardMaterial({ map: swirl, roughness: 0.3 })]);
      disc.rotation.x = Math.PI / 2;
      disc.position.y = 0.5;
      disc.castShadow = true;
      g.add(disc);
      g.add(at(cyl(0.02, 0.02, 0.3, mat('#ffffff')), 0, 0.15, 0));
      break;
    }
    case 'Dessert Bar': {
      g.add(at(cyl(0.18, 0.13, 0.2, stripeMat('#7ad3ff', '#ffffff', 12), { seg: 20 }), 0, 0.1, 0));
      const fro = sphere(0.2, mat('#fff0f6'));
      fro.scale.y = 0.8; fro.position.y = 0.28;
      g.add(fro);
      g.add(at(sphere(0.06, mat('#e8203a')), 0, 0.46, 0));
      break;
    }
    case 'Boutique': {
      const d = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), new THREE.MeshPhysicalMaterial({ color: '#c9f3ff', roughness: 0.02, metalness: 0.1, clearcoat: 1, emissive: '#5fd5ff', emissiveIntensity: 0.25 }));
      d.scale.y = 1.3; d.position.y = 0.5; d.castShadow = true;
      g.add(d);
      g.add(at(torus(0.18, 0.035, gold), 0, 0.2, 0));
      break;
    }
    case 'Arcade': {
      const px = [
        '..X...X..', '...X.X...', '..XXXXX..', '.XX.X.XX.', 'XXXXXXXXX', 'X.XXXXX.X', 'X.X...X.X', '...XX.XX.',
      ];
      const m = neon('#6cff7a', 1.2, 3.5);
      px.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === 'X') g.add(at(box(0.07, 0.07, 0.07, m), (c - 4) * 0.07, 0.6 - r * 0.07, 0)); }));
      break;
    }
    case 'Pizzeria': {
      const s = new THREE.Shape();
      s.moveTo(0, 0); s.lineTo(-0.22, 0.5); s.quadraticCurveTo(0, 0.56, 0.22, 0.5); s.closePath();
      const slice = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false }), mat('#ffc94a'));
      slice.position.set(0, 0.05, -0.03);
      slice.castShadow = true;
      g.add(slice);
      g.add(at(cyl(0.035, 0.035, 0.46, mat('#c9853e')), 0, 0.53, 0.0, 0, 0, Math.PI / 2 + 0.05));
      for (const [x, y] of [[0, 0.3], [-0.08, 0.42], [0.09, 0.4], [0, 0.18]]) g.add(at(cyl(0.04, 0.04, 0.02, mat('#d7382f')), x, y, 0.04, 0, Math.PI / 2));
      break;
    }
    case 'Karaoke': {
      g.add(at(cyl(0.05, 0.07, 0.35, mat('#222230', { metal: 0.5 })), 0, 0.18, 0));
      g.add(at(sphere(0.13, mat('#c8ccd8', { metal: 0.9, rough: 0.35 })), 0, 0.45, 0));
      g.add(at(torus(0.13, 0.015, neon('#ff4fd8', 1, 3)), 0, 0.45, 0, 0, Math.PI / 2));
      break;
    }
    case 'Theatre': {
      const s = new THREE.Shape();
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 + Math.PI / 2;
        const r = k % 2 ? 0.12 : 0.28;
        if (k === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      const star = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 }), mat('#ffc83d', { metal: 0.8, rough: 0.25, emissive: '#7a5200', ei: 0.2 }));
      star.position.set(0, 0.36, -0.03);
      star.castShadow = true;
      g.add(star);
      break;
    }
    case 'Cinema': {
      g.add(at(cyl(0.2, 0.14, 0.34, stripeMat('#e8203a', '#ffffff', 10), { seg: 20 }), 0, 0.17, 0));
      for (let k = 0; k < 9; k++) g.add(at(sphere(0.06, mat('#fff4c9')), Math.cos(k * 1.9) * 0.11, 0.36 + (k % 3) * 0.04, Math.sin(k * 1.9) * 0.11));
      break;
    }
    case 'Comedy Club': {
      g.add(at(sphere(0.24, mat('#ffd23f')), 0, 0.3, 0));
      g.add(at(sphere(0.035, mat('#222')), -0.08, 0.36, 0.21), at(sphere(0.035, mat('#222')), 0.08, 0.36, 0.21));
      g.add(at(torus(0.1, 0.02, mat('#222'), { arc: Math.PI }), 0, 0.27, 0.2, 0, 0, Math.PI));
      break;
    }
    case 'Hotel': {
      g.add(at(cyl(0.24, 0.26, 0.05, gold), 0, 0.03, 0));
      g.add(at(sphere(0.2, gold, { thetaLen: Math.PI / 2 }), 0, 0.05, 0));
      g.add(at(cyl(0.03, 0.03, 0.08, gold), 0, 0.28, 0));
      g.add(at(sphere(0.04, gold), 0, 0.33, 0));
      break;
    }
    case 'Bakery': {
      const cr = torus(0.18, 0.08, mat('#d99a4e'), { arc: Math.PI * 1.25, ts: 16 });
      cr.rotation.z = Math.PI * 0.12;
      cr.position.y = 0.2;
      cr.scale.set(1, 1, 0.8);
      g.add(cr);
      break;
    }
    case 'Market': {
      g.add(at(sphere(0.22, mat('#e8303a', { rough: 0.35 })), 0, 0.24, 0));
      g.add(at(cyl(0.015, 0.02, 0.1, mat('#6b4a2a')), 0, 0.48, 0));
      const leaf = sphere(0.07, mat('#4fbf4f'));
      leaf.scale.set(1, 0.3, 0.6); leaf.position.set(0.07, 0.5, 0); leaf.rotation.z = -0.5;
      g.add(leaf);
      break;
    }
    case 'Aerospace': {
      g.add(at(cyl(0.1, 0.1, 0.45, mat('#ffffff')), 0, 0.3, 0));
      g.add(at(cone(0.1, 0.2, mat('#e8303a')), 0, 0.62, 0));
      g.add(at(cyl(0.05, 0.05, 0.02, mat('#56b4ff')), 0, 0.38, 0.1, 0, Math.PI / 2));
      for (let k = 0; k < 3; k++) {
        const fin = box(0.02, 0.14, 0.1, mat('#e8303a'));
        const h = new THREE.Group(); h.rotation.y = (k / 3) * Math.PI * 2; fin.position.set(0, 0.12, 0.1); h.add(fin);
        g.add(h);
      }
      g.add(at(cone(0.07, 0.16, neon('#ffb03a', 2, 4)), 0, 0.02, 0, 0, Math.PI));
      break;
    }
    case 'Tech HQ': {
      const c = box(0.3, 0.3, 0.3, new THREE.MeshStandardMaterial({ color: '#0e3d2e', emissive: '#2fcf85', emissiveIntensity: 0.8, transparent: true, opacity: 0.85, roughness: 0.2 }));
      c.position.y = 0.4; c.rotation.set(0.6, 0.6, 0);
      g.add(c);
      g.add(at(sphere(0.07, neon('#bfffe0', 2, 4)), 0, 0.4, 0));
      break;
    }
    case 'Robotics': {
      g.add(at(rbox(0.34, 0.26, 0.26, 0.05, mat('#c8d0dc', { metal: 0.6, rough: 0.35 })), 0, 0.28, 0));
      g.add(at(box(0.24, 0.06, 0.02, neon('#3cf0ff', 1.5, 4)), 0, 0.3, 0.14));
      g.add(at(cyl(0.01, 0.01, 0.14, mat('#999')), 0, 0.48, 0), at(sphere(0.03, neon('#ff3b3b', 1.5, 4)), 0, 0.56, 0));
      break;
    }
    case 'Casino': {
      const d = rbox(0.34, 0.34, 0.34, 0.06, mat('#e8203a', { physical: true, clearcoat: 1 }));
      d.position.y = 0.3; d.rotation.set(0.5, 0.7, 0.2);
      const pipM = mat('#ffffff');
      for (const [x, y] of [[0, 0], [-0.08, 0.08], [0.08, -0.08]]) d.add(at(sphere(0.035, pipM, { ws: 8, hs: 6 }), x, y, 0.17));
      for (const [x, z] of [[-0.08, -0.08], [0.08, 0.08]]) d.add(at(sphere(0.035, pipM, { ws: 8, hs: 6 }), x, 0.17, z));
      g.add(d);
      break;
    }
    case 'Penthouse': {
      g.add(at(cyl(0.22, 0.2, 0.16, gold, { seg: 20 }), 0, 0.1, 0));
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        g.add(at(cone(0.05, 0.18, gold, { seg: 8 }), Math.cos(a) * 0.19, 0.27, Math.sin(a) * 0.19));
        g.add(at(sphere(0.03, mat(k % 2 ? '#3a7bff' : '#e8203a', { rough: 0.1 })), Math.cos(a) * 0.21, 0.1, Math.sin(a) * 0.21));
      }
      break;
    }
    default:
      g.add(at(sphere(0.2, gold), 0, 0.2, 0));
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  if (big) g.scale.setScalar(1.7);
  return g;
}

// ───────────────────────────────────────────── storefront texture
function storefrontMat(th, wall) {
  const key = `${th.glass}|${wall}|${th.trim}`;
  storefrontMat.cache = storefrontMat.cache || new Map();
  if (storefrontMat.cache.has(key)) return storefrontMat.cache.get(key);
  const tex = canvasTex(256, 128, (ctx) => {
    ctx.fillStyle = wall; ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = th.trim;
    ctx.fillRect(0, 0, 256, 10);
    // display window
    const gl = ctx.createLinearGradient(0, 20, 0, 118);
    gl.addColorStop(0, shade(th.glass, 0.15)); gl.addColorStop(1, th.glass);
    ctx.fillStyle = gl;
    roundRect(ctx, 14, 22, 150, 90, 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.moveTo(24, 100); ctx.lineTo(90, 26); ctx.lineTo(112, 26); ctx.lineTo(40, 110); ctx.fill();
    // shelf goods silhouettes
    const goods = ['#ffd166', '#ff6f91', '#4cc9f0', '#7bd389'];
    for (let k = 0; k < 6; k++) { ctx.fillStyle = goods[k % 4]; ctx.fillRect(24 + k * 22, 86, 14, 18); }
    ctx.fillStyle = shade(wall, -0.2); ctx.fillRect(14, 104, 150, 8);
    // door
    ctx.fillStyle = shade(th.trim, -0.1);
    roundRect(ctx, 180, 26, 60, 102, 8); ctx.fill();
    ctx.fillStyle = th.glass; roundRect(ctx, 188, 34, 44, 50, 5); ctx.fill();
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(228, 96, 4, 0, Math.PI * 2); ctx.fill();
  });
  const emap = canvasTex(256, 128, (ctx) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#e8a860'; roundRect(ctx, 14, 22, 150, 90, 6); ctx.fill();
    ctx.fillStyle = '#d98a40'; roundRect(ctx, 188, 34, 44, 50, 5); ctx.fill();
  });
  const m = new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: emap, emissiveIntensity: 0.1, roughness: 0.5 });
  m.userData.nightBase = 0.05; m.userData.nightPeak = 0.75;
  storefrontMat.night.add(m);
  storefrontMat.cache.set(key, m);
  return m;
}
storefrontMat.night = new Set();

// ───────────────────────────────────────────── building generator
/** Returns { root, parts: [{obj, order}] } for a business at a level (0-5). */
export function makeBusiness(tile, level, variant = 0) {
  const th = THEMES[tile.district];
  const root = new THREE.Group();
  const parts = [];
  const add = (obj, order) => { root.add(obj); parts.push({ obj, order }); return obj; };
  const r = hash01(tile.index * 13 + variant);
  const wall = th.walls[Math.floor(r * th.walls.length)];
  const trimM = mat(th.trim, { rough: 0.5 });
  const name = tile.name;

  if (level === 0) {
    // Kiosk / stall
    const k = new THREE.Group();
    const bodyM = mat(wall, { rough: 0.6 });
    k.add(at(rbox(0.72, 0.42, 0.5, 0.05, bodyM), 0, 0.21, -0.05));
    k.add(at(box(0.78, 0.05, 0.56, trimM), 0, 0.44, -0.05));
    const aw = box(0.8, 0.02, 0.3, stripeMat(th.awning[0], th.awning[1], 8));
    aw.position.set(0, 0.52, 0.28); aw.rotation.x = 0.35;
    k.add(aw);
    for (const x of [-0.37, 0.37]) k.add(at(cyl(0.015, 0.015, 0.34, trimM, { seg: 6 }), x, 0.36, 0.4));
    k.add(at(box(0.6, 0.06, 0.12, mat('#fff8e8')), 0, 0.3, 0.24));
    const s = signMesh(name, 0.7, 0.14, { bg: th.trim, fg: '#fff', w: 512, h: 104 });
    s.position.set(0, 0.62, 0.02);
    k.add(s);
    add(k, 0);
    const sig = signature(tile.sig || tile.biz);
    sig.scale.multiplyScalar(0.55);
    sig.position.set(0, 0.47, -0.12);
    add(sig, 1);
    return { root, parts };
  }

  const floors = Math.max(1, Math.round(FLOORS[level] * th.mul));
  let w = FOOT_W[level], d = FOOT_D[level];
  const facade = facadeMat(wall, th.facade, th.glass);
  let y = 0;
  let order = 0;
  const groundH = FLOOR_H * 1.15;
  for (let f = 0; f < floors; f++) {
    const fh = f === 0 ? groundH : FLOOR_H;
    if (th.roof === 'spire' && f > 0 && f === Math.ceil(floors * 0.55)) { w *= 0.82; d *= 0.82; }
    if (th.roof === 'deco' && f > 0 && f === floors - 1 && floors > 2) { w *= 0.8; d *= 0.8; }
    const fl = new THREE.Group();
    const body = facadeBox(w, fh, d, facade, { floors: 1, cell: 0.33 });
    body.position.y = fh / 2;
    fl.add(body);
    if (f === 0) {
      const sf = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.92, fh * 0.9), storefrontMat(th, wall));
      sf.position.set(0, fh * 0.45, d / 2 + 0.004);
      fl.add(sf);
    }
    // cornice trim
    const cor = box(w + 0.04, 0.035, d + 0.04, trimM);
    cor.position.y = fh;
    fl.add(cor);
    if (th.neon && f % 2 === 1) {
      const nm = neon(th.neon[(f + level) % th.neon.length], 1.2, 4);
      fl.add(at(box(w + 0.05, 0.025, 0.025, nm), 0, fh * 0.5, d / 2 + 0.02));
    }
    if (tile.district === 'candy' && f > 0) {
      fl.add(at(box(w + 0.06, 0.05, d + 0.06, stripeMat('#ff6fae', '#ffffff', 16)), 0, 0.03, 0));
    }
    if (tile.district === 'sunny' && f > 0 && f % 2 === 0) {
      // balconies with flowers
      fl.add(at(box(w * 0.7, 0.03, 0.16, mat('#ffffff')), 0, 0.02, d / 2 + 0.08));
      fl.add(at(box(w * 0.7, 0.08, 0.02, mat('#ffffff')), 0, 0.07, d / 2 + 0.16));
      for (let k = 0; k < 4; k++) fl.add(at(sphere(0.035, mat(['#ff6f91', '#ffd166', '#c77dff', '#ff9f43'][k])), -w * 0.3 + k * w * 0.2, 0.1, d / 2 + 0.15));
    }
    fl.position.y = y;
    add(fl, order++);
    y += fh;
  }
  // vertical neon edges for the arcade
  if (th.neon) {
    const nm = neon(th.neon[level % th.neon.length], 1.4, 4.5);
    const ed = new THREE.Group();
    for (const sx of [-1, 1]) ed.add(at(box(0.03, y, 0.03, nm), sx * (w / 2 + 0.005), y / 2, d / 2 + 0.005));
    add(ed, order);
  }

  // Awning + sign on the ground floor
  const aw = new THREE.Group();
  const awM = stripeMat(th.awning[0], th.awning[1], 10);
  const awning = box(w * 0.92, 0.02, 0.28, awM);
  awning.position.set(0, groundH * 0.78, d / 2 + 0.12);
  awning.rotation.x = 0.38;
  aw.add(awning);
  const fringe = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.92, 0.07), stripeMat(th.awning[0], th.awning[1], 10, { scallop: true }));
  fringe.position.set(0, groundH * 0.78 - 0.08, d / 2 + 0.25);
  aw.add(fringe);
  const signBg = tile.district === 'arcade' ? '#1b1636' : th.trim;
  const sign = signMesh(name, Math.min(w * 0.95, 1.3), 0.17, { bg: signBg, fg: tile.district === 'arcade' ? '#ffcf8a' : '#ffffff', w: 512, h: 96, glow: true });
  sign.position.set(0, groundH + 0.12, d / 2 + 0.03);
  aw.add(sign);
  aw.add(at(box(Math.min(w * 0.95, 1.3) + 0.04, 0.2, 0.03, mat(shade(signBg, -0.15))), 0, groundH + 0.12, d / 2 + 0.01));
  add(aw, order + 0.5);

  // Show district: theatre marquee with bulbs
  if (tile.district === 'show') {
    const mq = new THREE.Group();
    mq.add(at(box(w * 0.85, 0.16, 0.34, mat('#1a1320')), 0, groundH * 0.95, d / 2 + 0.17));
    const bulbM = neon('#fff1b0', 1.2, 4);
    for (let k = 0; k < 9; k++) mq.add(at(sphere(0.022, bulbM, { ws: 6, hs: 4 }), -w * 0.4 + (k / 8) * w * 0.8, groundH * 0.95 - 0.09, d / 2 + 0.35));
    for (const x of [-w * 0.36, w * 0.36]) mq.add(at(cyl(0.035, 0.035, groundH * 0.9, mat('#f6f1e7')), x, groundH * 0.45, d / 2 + 0.2));
    add(mq, order + 0.6);
  }

  // Roof
  const roof = new THREE.Group();
  const rc = mat(th.roofColor, { rough: 0.55 });
  switch (th.roof) {
    case 'pitched':
    case 'terracotta':
      roof.add(at(prism(w + 0.12, 0.34 + level * 0.02, d + 0.12, rc), 0, 0, 0));
      if (th.roof === 'terracotta') roof.add(at(box(0.12, 0.3, 0.12, mat('#fff4d6')), w * 0.3, 0.2, -d * 0.2));
      break;
    case 'dome':
      roof.add(at(sphere(Math.min(w, d) * 0.46, rc, { thetaLen: Math.PI / 2 }), 0, 0, 0));
      roof.add(at(sphere(0.06, mat('#ffffff')), 0, Math.min(w, d) * 0.46, 0));
      for (const sx of [-1, 1]) roof.add(at(sphere(0.12, mat('#fff0f6'), { thetaLen: Math.PI / 2 }), sx * w * 0.38, 0, d * 0.3));
      break;
    case 'saw':
      for (let k = 0; k < 3; k++) roof.add(at(prism(d * 0.95, 0.22, w / 3, rc), -w / 3 + (k * w) / 3, 0, 0, Math.PI / 2));
      roof.add(at(cyl(0.06, 0.07, 0.5, mat('#7a6a60')), w * 0.35, 0.25, -d * 0.3));
      break;
    case 'billboard': {
      roof.add(at(box(w, 0.06, d, rc), 0, 0.03, 0));
      const bb = canvasTex(256, 96, (ctx) => {
        const g = ctx.createLinearGradient(0, 0, 256, 96);
        g.addColorStop(0, '#ff4fd8'); g.addColorStop(1, '#ff9a3c');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 96);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
        const s = fitText(ctx, name.toUpperCase(), 230, 44, 400, FONT_DISPLAY);
        ctx.font = `400 ${s}px ${FONT_DISPLAY}`;
        ctx.fillText(name.toUpperCase(), 128, 62);
      });
      const bm = new THREE.MeshStandardMaterial({ map: bb, emissive: '#fff', emissiveMap: bb, emissiveIntensity: 0.6 });
      bm.userData.nightBase = 0.5; bm.userData.nightPeak = 1.8;
      storefrontMat.night.add(bm);
      const board = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, w * 0.34), bm);
      board.position.set(0, 0.3 + w * 0.17, d * 0.2);
      roof.add(board);
      for (const x of [-w * 0.35, w * 0.35]) roof.add(at(box(0.03, 0.35, 0.03, mat('#333')), x, 0.2, d * 0.18));
      break;
    }
    case 'deco':
      roof.add(at(box(w * 0.6, 0.18, d * 0.6, rc), 0, 0.09, 0));
      roof.add(at(box(w * 0.36, 0.18, d * 0.36, rc), 0, 0.27, 0));
      break;
    case 'solar':
      roof.add(at(box(w, 0.05, d, mat('#dfe8e4')), 0, 0.025, 0));
      for (let k = 0; k < 2; k++) {
        const p = box(w * 0.38, 0.02, d * 0.4, mat('#1f3b5c', { metal: 0.6, rough: 0.2 }));
        p.position.set(-w * 0.22 + k * w * 0.44, 0.1, -d * 0.18);
        p.rotation.x = -0.4;
        roof.add(p);
      }
      roof.add(at(box(w * 0.8, 0.06, d * 0.28, mat('#4fbf6a')), 0, 0.06, d * 0.3));
      break;
    case 'spire':
      roof.add(at(box(w * 0.7, 0.1, d * 0.7, rc), 0, 0.05, 0));
      roof.add(at(cyl(0.03, 0.06, 0.8 + level * 0.1, rc), 0, 0.5 + level * 0.05, 0));
      roof.add(at(sphere(0.05, neon('#ff4040', 1.5, 5)), 0, 0.95 + level * 0.1, 0));
      break;
    default:
      roof.add(at(box(w, 0.06, d, rc), 0, 0.03, 0));
  }
  // AC units / water tower flavour
  if (level >= 2 && th.roof !== 'pitched' && th.roof !== 'terracotta' && th.roof !== 'dome') {
    roof.add(at(box(0.16, 0.1, 0.14, mat('#c9ccd4')), -w * 0.32, 0.1, d * 0.28));
  }
  roof.position.y = y;
  add(roof, order + 1);

  // Signature icon: small on a pole for levels 1-4, giant + spinning at Landmark
  const big = level >= 5;
  const sig = signature(tile.sig || tile.biz, big);
  const holder = new THREE.Group();
  holder.add(sig);
  const topY = y + (th.roof === 'pitched' || th.roof === 'terracotta' ? 0.18 : th.roof === 'dome' ? Math.min(w, d) * 0.3 : th.roof === 'spire' ? 0.12 : 0.1);
  if (big) {
    holder.position.set(th.roof === 'spire' ? w * 0.18 : 0, topY + 0.05, th.roof === 'spire' ? d * 0.15 : 0);
    holder.userData.spin = 0.6;
    dynamic(holder);
    // gold plinth
    const pl = cyl(0.26, 0.3, 0.1, mat('#ffc83d', { metal: 0.8, rough: 0.25 }));
    pl.position.set(holder.position.x, topY, holder.position.z);
    add(pl, order + 1.5);
  } else {
    holder.position.set(-w * 0.28, topY, d * 0.15);
    holder.scale.setScalar(0.6 + level * 0.06);
    holder.userData.spin = 0.25;
    dynamic(holder);
  }
  add(holder, order + 2);
  root.userData.height = topY + (big ? 1.2 : 0.5);
  if (th.roof === 'saw') root.userData.chimney = new THREE.Vector3(w * 0.35, y + 0.55, -d * 0.3);
  root.userData.level = level;
  return { root, parts };
}

// ───────────────────────────────────────────── lot dressing
function makeLot(tile) {
  const g = new THREE.Group();
  const col = DISTRICTS[tile.district]?.color || '#8c93a8';
  const post = box(0.05, 0.55, 0.05, mat('#8a6a4a'));
  post.position.set(0.15, 0.27, 0.35);
  g.add(post);
  const tex = canvasTex(256, 160, (ctx) => {
    ctx.fillStyle = '#ffffff'; roundRect(ctx, 4, 4, 248, 152, 18); ctx.fill();
    ctx.fillStyle = col; roundRect(ctx, 4, 4, 248, 60, 18); ctx.fill(); ctx.fillRect(4, 40, 248, 24);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = `400 42px ${FONT_DISPLAY}`; ctx.fillText('FOR SALE', 128, 50);
    ctx.fillStyle = '#2a2438'; ctx.font = `800 46px ${FONT_UI}`; ctx.fillText(`$${tile.price}`, 128, 122);
  });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.31), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide }));
  board.position.set(0.15, 0.5, 0.38);
  board.castShadow = true;
  g.add(board);
  // grass tufts + cone
  const grassM = mat('#5fbf5a');
  for (let k = 0; k < 5; k++) {
    const tuft = cone(0.06, 0.16, grassM, { seg: 5 });
    tuft.position.set(-0.55 + hash01(tile.index + k) * 1.0, 0.08, -0.5 + hash01(tile.index * 3 + k) * 0.8);
    g.add(tuft);
  }
  g.add(at(cone(0.07, 0.2, stripeMat('#ff7a2e', '#ffffff', 4), { seg: 10 }), -0.45, 0.1, 0.3));
  g.add(at(box(0.16, 0.02, 0.16, mat('#ff7a2e')), -0.45, 0.01, 0.3));
  return g;
}

function makeFlag(color) {
  const g = new THREE.Group();
  g.add(at(cyl(0.012, 0.012, 0.9, mat('#e8e8ee', { metal: 0.6, rough: 0.3 }), { seg: 6 }), 0, 0.45, 0));
  g.add(at(sphere(0.025, mat('#ffc83d', { metal: 0.8 })), 0, 0.91, 0));
  const geo = new THREE.PlaneGeometry(0.34, 0.2, 10, 1);
  geo.translate(0.17, 0, 0);
  const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.7 }));
  cloth.position.y = 0.78;
  cloth.castShadow = true;
  g.add(cloth);
  g.userData.cloth = cloth;
  g.userData.base = Float32Array.from(geo.attributes.position.array);
  g.userData.dynamic = true;
  return g;
}

function makeOwnerPad(color) {
  const tex = makeOwnerPad.tex || (makeOwnerPad.tex = canvasTex(256, 256, (ctx) => {
    ctx.clearRect(0, 0, 256, 256);
    roundRect(ctx, 12, 12, 232, 232, 34);
    ctx.lineWidth = 14; ctx.strokeStyle = '#fff'; ctx.stroke();
  }));
  const m = new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false, opacity: 0.95 });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(BAND.plotW, BAND.plotDepth - 0.06), m);
  p.rotation.x = -Math.PI / 2;
  p.position.y = 0.005;
  p.renderOrder = 3;
  return p;
}

function makeClosed() {
  const g = new THREE.Group();
  const wood = mat('#a77a4f');
  const a = box(1.2, 0.08, 0.03, wood); a.rotation.z = 0.5; a.position.set(0, 0.3, 0.72);
  const b = box(1.2, 0.08, 0.03, wood); b.rotation.z = -0.5; b.position.set(0, 0.3, 0.73);
  g.add(a, b);
  const s = signMesh('MORTGAGED', 0.8, 0.18, { bg: '#e8303a', fg: '#fff' });
  s.position.set(0, 0.62, 0.75);
  g.add(s);
  return g;
}

// ───────────────────────────────────────────── manager
export class Buildings {
  constructor(board3d, fx) {
    this.board = board3d;
    this.fx = fx;
    this.slots = new Map();
    this.night = 0;
    this.flags = [];
    for (const t of TILES) {
      if (!isOwnable(t)) continue;
      const plot = new THREE.Group();
      plot.position.set(0, 0.08, BAND.plotZ);
      board3d.tiles[t.index].content.add(plot);
      const slot = { tile: t, plot, building: null, lot: null, flag: null, pad: null, closed: null, owner: null, level: -1, mortgaged: false, beam: null };
      this.slots.set(t.index, slot);
      if (t.type === 'property') { slot.lot = bakeChildren(makeLot(t)); plot.add(slot.lot); }
    }
    for (const m of storefrontMat.night) m.userData.night = true;
  }

  /** Instantly sync visuals to a tile state (used on load / refresh). */
  sync(idx, ts, ownerColor) {
    const slot = this.slots.get(idx);
    if (!slot) return;
    this.setOwnerVisual(slot, ts.owner === null ? null : ownerColor);
    if (slot.tile.type === 'property') {
      const lvl = ts.owner === null ? -1 : ts.level;
      if (lvl !== slot.level) this.placeBuilding(slot, lvl, false);
    }
    this.setMortgaged(slot, ts.mortgaged);
  }

  setOwnerVisual(slot, color) {
    if (slot.flag) { slot.plot.remove(slot.flag); this.flags = this.flags.filter((f) => f !== slot.flag); slot.flag = null; }
    if (slot.pad) { slot.plot.remove(slot.pad); slot.pad = null; }
    slot.owner = color;
    if (!color) return;
    slot.flag = makeFlag(color);
    slot.flag.position.set(0.78, 0, 0.62);
    slot.plot.add(slot.flag);
    this.flags.push(slot.flag);
    slot.pad = makeOwnerPad(color);
    slot.plot.add(slot.pad);
    if (slot.beam) slot.beam.material.color.set(color);
  }

  setMortgaged(slot, on) {
    if (on === slot.mortgaged && (on ? !!slot.closed : !slot.closed)) return;
    slot.mortgaged = on;
    if (slot.closed) { slot.plot.remove(slot.closed); slot.closed = null; }
    if (on) { slot.closed = makeClosed(); slot.closed.position.z = -0.1; slot.plot.add(slot.closed); }
  }

  /** Rebuild every standing business (after a map change renames them). */
  refreshAll() {
    for (const slot of this.slots.values()) {
      if (slot.tile.type === 'property' && slot.level >= 0) this.placeBuilding(slot, slot.level, false);
    }
  }

  placeBuilding(slot, level, animate) {
    if (slot.building) { slot.plot.remove(slot.building); disposeTree(slot.building); slot.building = null; }
    if (slot.beam) { slot.plot.remove(slot.beam); slot.beam = null; }
    slot.level = level;
    if (slot.lot) slot.lot.visible = level < 0;
    if (level < 0) return null;
    const { root, parts } = makeBusiness(slot.tile, level);
    slot.plot.add(root);
    slot.building = root;
    if (level >= 5) this.addBeam(slot, root.userData.height);
    if (!animate) {
      slot.building = this.bakeSlot(slot, root);
      return null;
    }
    return { root, parts };
  }

  bakeSlot(slot, root) {
    const baked = bake(root);
    slot.plot.remove(root);
    slot.plot.add(baked);
    baked.userData.height = root.userData.height;
    baked.userData.chimney = root.userData.chimney;
    baked.userData.level = root.userData.level;
    this.collectSpinners(baked);
    return baked;
  }

  collectSpinners(g) {
    g.userData.spinners = g.children.filter((c) => c.userData.spin);
  }

  addBeam(slot, h) {
    const m = new THREE.MeshBasicMaterial({ color: slot.owner || '#fff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 14, 16, 1, true), m);
    beam.position.y = h + 7;
    slot.plot.add(beam);
    slot.beam = beam;
  }

  /** Animated construction from the current level to `level`. */
  async construct(idx, level, ownerColor) {
    const slot = this.slots.get(idx);
    if (!slot) return;
    if (ownerColor && slot.owner !== ownerColor) this.setOwnerVisual(slot, ownerColor);
    if (slot.tile.type !== 'property') return;
    // Old building sinks away
    if (slot.building) {
      const old = slot.building;
      slot.building = null;
      await tween({
        duration: 0.22, ease: Ease.inBack,
        onUpdate: (t, e) => { old.scale.set(1 + e * 0.1, 1 - e * 0.95, 1 + e * 0.1); },
      });
      slot.plot.remove(old);
      disposeTree(old);
    }
    const res = this.placeBuilding(slot, level, true);
    if (!res) return;
    const { root, parts } = res;
    parts.sort((a, b) => a.order - b.order);
    const finals = parts.map((p) => ({ p: p.obj.position.clone(), s: p.obj.scale.clone() }));
    parts.forEach((p) => { p.obj.visible = false; });
    const world = new THREE.Vector3();
    root.getWorldPosition(world);
    const each = Math.max(0.07, 0.34 / Math.max(1, parts.length / 3));
    const jobs = parts.map((p, k) => (async () => {
      await wait(k * each);
      const f = finals[k];
      p.obj.visible = true;
      p.obj.position.y = f.p.y + 1.6;
      await tween({
        duration: 0.34, ease: Ease.outBounce,
        onUpdate: (t, e) => {
          p.obj.position.y = f.p.y + (1 - e) * 1.6;
          const sq = t < 0.6 ? 1 : 1 + Math.sin((t - 0.6) / 0.4 * Math.PI) * 0.12;
          p.obj.scale.set(f.s.x * sq, f.s.y / sq, f.s.z * sq);
        },
      });
      p.obj.scale.copy(f.s);
      this.fx?.thunk(world.clone().setY(world.y + f.p.y), k);
    })());
    await Promise.all(jobs);
    // settle bounce of whole building
    await tween({ duration: 0.3, ease: Ease.outElastic, onUpdate: (t, e) => { const s = 1 + (1 - e) * 0.08; root.scale.set(1 / s, s, 1 / s); } });
    root.scale.set(1, 1, 1);
    slot.building = this.bakeSlot(slot, root);
  }

  /** Crumble a building down to `level` (-1 = empty lot). */
  async crumble(idx, level) {
    const slot = this.slots.get(idx);
    if (!slot || !slot.building) {
      if (slot && level < 0) { this.placeBuilding(slot, -1, false); }
      return;
    }
    const old = slot.building;
    slot.building = null;
    const base = old.position.clone();
    await tween({ duration: 0.5, ease: Ease.linear, onUpdate: (t) => { old.position.x = base.x + Math.sin(t * 60) * 0.04 * (1 - t); } });
    const world = new THREE.Vector3(); old.getWorldPosition(world);
    this.fx?.dust(world, 22, 1.2);
    await tween({
      duration: 0.5, ease: Ease.inQuad,
      onUpdate: (t, e) => { old.scale.set(1 + e * 0.2, Math.max(0.01, 1 - e), 1 + e * 0.2); old.rotation.z = e * 0.15; },
    });
    slot.plot.remove(old);
    disposeTree(old);
    if (slot.beam) { slot.plot.remove(slot.beam); slot.beam = null; }
    slot.level = -2;
    if (level >= 0) await this.construct(idx, level, slot.owner);
    else this.placeBuilding(slot, -1, false);
  }

  topOf(idx) {
    const slot = this.slots.get(idx);
    const v = new THREE.Vector3();
    slot.plot.getWorldPosition(v);
    v.y += (slot.building?.userData.height || 0.8) + 0.2;
    return v;
  }

  plotWorld(idx) {
    const v = new THREE.Vector3();
    this.slots.get(idx).plot.getWorldPosition(v);
    return v;
  }

  update(dt, t) {
    for (const f of this.flags) {
      const geo = f.userData.cloth.geometry;
      const pos = geo.attributes.position;
      const base = f.userData.base;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        pos.array[i * 3 + 2] = Math.sin(x * 14 - t * 6 + f.id) * 0.04 * (x / 0.34);
      }
      pos.needsUpdate = true;
    }
    this.fxT = (this.fxT || 0) + dt;
    const puff = this.fxT > 0.45;
    if (puff) this.fxT = 0;
    const wp = new THREE.Vector3();
    for (const slot of this.slots.values()) {
      const b = slot.building;
      if (b?.userData.spinners) for (const s of b.userData.spinners) s.rotation.y += dt * s.userData.spin;
      if (puff && b && this.fx) {
        // chimney smoke in Rust Row, sparkles around Landmarks
        if (b.userData.chimney && Math.random() < 0.7) {
          wp.copy(b.userData.chimney); b.localToWorld(wp);
          this.fx.smoke(wp, this.night > 0.5 ? '#6d6a80' : '#d9d4cc');
        }
        if (b.userData.level >= 5 && Math.random() < 0.6) {
          slot.plot.getWorldPosition(wp);
          wp.y += (b.userData.height || 2) * (0.4 + Math.random() * 0.6);
          wp.x += (Math.random() - 0.5) * 1.4; wp.z += (Math.random() - 0.5) * 1.4;
          this.fx.sparks(wp, { count: 2, color: slot.owner || '#ffe38a', speed: 0.6, size: 0.16, life: 0.9, g: 0.5 });
        }
      }
      if (slot.beam) {
        slot.beam.material.opacity = 0.04 + this.night * 0.15;
        slot.beam.rotation.y += dt;
      }
    }
    for (const m of storefrontMat.night) m.emissiveIntensity = THREE.MathUtils.lerp(m.userData.nightBase, m.userData.nightPeak, this.night);
  }
}

export { tileLocal, tileRot };
