// The board: tile plates, printed tile art, corner dioramas, special tiles,
// the central plaza (dice bowl, Vault, Ferris wheel, fountain, leader statue),
// the ring road with traffic, and street furniture.
import * as THREE from "three";
import { TILES, DISTRICTS, tileColor } from "../game/board.js";
import { applyMap } from "../game/maps.js";
import {
  HALF, CORNER, TILE_W, ROAD_IN, ROAD_MID, PARK, BAND,
  tileCenter, tileRot, tileLocal, isCorner,
} from "./layout.js";
import {
  mat, neon, box, rbox, cyl, sphere, cone, torus, prism, plane, at, group, canvasTex, roundRect,
  fitText, FONT_UI, FONT_DISPLAY, signMesh, stripeMat, bake, bakeChildren, dynamic, facadeMat, facadeBox, shade,
} from "./kit.js";
import { makePalm } from "./environment.js";

const PAPER = '#efe3cc';

export class Board3D {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.tiles = [];
    this.animated = [];
    this.pickables = [];
    this.buildTiles();
    this.buildPlaza();
    this.buildRoad();
    this.buildHighlights();
  }

  // ───────────────────────────────────────────── tiles
  buildTiles() {
    const plateM = mat('#f3ead8', { rough: 0.8 });
    const edgeM = mat('#e8dcc4', { rough: 0.7 });
    for (const t of TILES) {
      const i = t.index;
      const g = new THREE.Group();
      tileCenter(i, g.position);
      g.rotation.y = tileRot(i);
      const corner = isCorner(i);
      const w = corner ? CORNER - 0.06 : TILE_W - 0.07;
      const d = CORNER - 0.06;
      const plate = rbox(w, 0.24, d, 0.08, plateM, { seg: 2 });
      plate.position.y = -0.04;
      g.add(plate);
      const base = box(w - 0.02, 0.2, d - 0.02, edgeM);
      base.position.y = -0.2;
      g.add(base);
      const art = plane(w - 0.08, d - 0.08, new THREE.MeshStandardMaterial({ map: this.tileArt(t), roughness: 0.95 }));
      art.rotation.x = -Math.PI / 2;
      art.position.y = 0.081;
      art.receiveShadow = true;
      g.add(art);
      plate.userData.tile = i;
      art.userData.tile = i;
      this.pickables.push(art);
      const content = new THREE.Group();
      g.add(content);
      this.root.add(g);
      this.tiles.push({ index: i, group: g, content, baseY: 0, dip: 0, art });
      if (corner) content.add(bakeChildren(this.cornerModel(t)));
      else {
        const m = this.specialModel(t);
        if (m) content.add(bakeChildren(m));
      }
    }
  }

  tileArt(t) {
    const corner = isCorner(t.index);
    if (corner) return this.cornerArt(t);
    const W = 256, H = 410;
    return canvasTex(W, H, (ctx) => {
      ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
      const col = tileColor(t);
      const plotH = 200;
      // plot ground
      if (t.type === 'property') {
        const g = ctx.createLinearGradient(0, 0, 0, plotH);
        g.addColorStop(0, shade(col, 0.2)); g.addColorStop(1, shade(col, 0.12));
        ctx.fillStyle = g;
      } else ctx.fillStyle = '#e9e0cc';
      roundRect(ctx, 10, 10, W - 20, plotH - 14, 18); ctx.fill();
      // paving dots
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      for (let y = 22; y < plotH - 10; y += 18) for (let x = 22 + ((y / 18) % 2) * 9; x < W - 16; x += 18) {
        ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      // colour band
      ctx.fillStyle = col;
      roundRect(ctx, 6, plotH + 2, W - 12, 34, 10); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(14, plotH + 7, W - 28, 5);
      // path texture
      ctx.fillStyle = 'rgba(0,0,0,0.04)';
      for (let y = plotH + 50; y < H; y += 26) ctx.fillRect(12, y, W - 24, 2);
      // label
      ctx.textAlign = 'center';
      ctx.fillStyle = '#17122a';
      const name = t.name.toUpperCase();
      let s = fitText(ctx, name, W - 30, 36, 800, FONT_UI);
      ctx.font = `800 ${s}px ${FONT_UI}`;
      ctx.fillText(name, W / 2, H - 58);
      if (t.price) {
        ctx.font = `700 26px ${FONT_UI}`;
        const pt = `₪${t.price}`;
        const pw = ctx.measureText(pt).width + 26;
        ctx.fillStyle = t.type === 'property' ? col : '#6a6f86';
        roundRect(ctx, W / 2 - pw / 2, H - 44, pw, 34, 17); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(pt, W / 2, H - 18);
      } else {
        const sub = { news: 'קח קלף', fortune: 'קח קלף', tax: `שלם ₪${t.amount}` }[t.type] || '';
        ctx.font = `700 22px ${FONT_UI}`;
        ctx.fillStyle = '#4b4462';
        ctx.fillText(sub, W / 2, H - 22);
      }
    });
  }

  cornerArt(t) {
    const S = 420;
    const cfg = {
      go: { bg: '#ffe9a8', fg: '#1c7a4a', text: 'יום משכורת', sub: 'קבל ₪200' },
      jail: { bg: '#ffd9cf', fg: '#b3303d', text: 'הכלא', sub: 'רק ביקור' },
      heist: { bg: '#d8f1ff', fg: '#20588f', text: 'השוד', sub: 'פרוץ את הכספת' },
      gotojail: { bg: '#e3dcff', fg: '#3f3aa6', text: 'נתפסת!', sub: 'לך לכלא' },
    }[t.type];
    return canvasTex(S, S, (ctx) => {
      ctx.fillStyle = PAPER; ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = cfg.bg;
      roundRect(ctx, 12, 12, S - 24, S - 24, 30); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 6;
      roundRect(ctx, 26, 26, S - 52, S - 52, 22); ctx.stroke();
      // corner "sunburst"
      ctx.save();
      ctx.translate(S * 0.72, S * 0.72);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let k = 0; k < 12; k++) {
        ctx.rotate(Math.PI / 6);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(260, -30); ctx.lineTo(260, 30); ctx.fill();
      }
      ctx.restore();
      // diagonal text, readable from the outer corner
      ctx.save();
      ctx.translate(S * 0.66, S * 0.66);
      ctx.rotate(-Math.PI / 4);
      ctx.textAlign = 'center';
      ctx.fillStyle = cfg.fg;
      const s = fitText(ctx, cfg.text, 300, 64, 400, FONT_DISPLAY);
      ctx.font = `400 ${s}px ${FONT_DISPLAY}`;
      ctx.fillText(cfg.text, 0, 18);
      ctx.font = `800 20px ${FONT_UI}`;
      ctx.globalAlpha = 0.75;
      ctx.fillText(cfg.sub, 0, 50);
      ctx.restore();
    });
  }

  // ───────────────────────────────────────────── corners
  cornerModel(t) {
    const g = new THREE.Group();
    // Corner local frame: tile rotation of its side. Inner corner is (-x, -z).
    const inner = new THREE.Group();
    inner.position.set(-0.55, 0.08, -0.55);
    g.add(inner);
    if (t.type === 'go') this.buildPayday(inner);
    if (t.type === 'jail') this.buildJail(inner);
    if (t.type === 'heist') this.buildHeistCorner(inner);
    if (t.type === 'gotojail') this.buildPolice(inner);
    return g;
  }

  buildPayday(g) {
    const gold = mat('#ffc83d', { metal: 0.6, rough: 0.3 });
    const green = mat('#2bb673');
    // Arch
    const arch = new THREE.Group();
    arch.add(at(rbox(0.28, 1.9, 0.28, 0.06, green), -1.0, 0.95, 0));
    arch.add(at(rbox(0.28, 1.9, 0.28, 0.06, green), 1.0, 0.95, 0));
    arch.add(at(rbox(2.5, 0.5, 0.36, 0.1, gold), 0, 2.05, 0));
    const sign = signMesh('יום משכורת', 2.2, 0.42, { bg: '#1f9e62', fg: '#fff6c9', glow: true });
    sign.position.set(0, 2.05, 0.19);
    arch.add(sign);
    const sign2 = sign.clone(); sign2.rotation.y = Math.PI; sign2.position.z = -0.19; arch.add(sign2);
    arch.rotation.y = Math.PI / 4;
    g.add(arch);
    // coin stacks
    const coinM = mat('#ffcf4a', { metal: 0.7, rough: 0.28 });
    const stacks = [[-0.9, 0.9, 6], [-0.5, 1.2, 4], [0.9, -0.9, 5], [1.2, -0.4, 3]];
    for (const [x, z, n] of stacks) for (let k = 0; k < n; k++) g.add(at(cyl(0.18, 0.18, 0.06, coinM), x + (k % 2) * 0.02, 0.04 + k * 0.065, z));
    // Big arrow on the ground pointing the direction of travel (−x on side 0)
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.35); arrowShape.lineTo(0.5, 0); arrowShape.lineTo(0, -0.35);
    arrowShape.lineTo(0, -0.15); arrowShape.lineTo(-0.7, -0.15); arrowShape.lineTo(-0.7, 0.15); arrowShape.lineTo(0, 0.15);
    const arrow = new THREE.Mesh(new THREE.ExtrudeGeometry(arrowShape, { depth: 0.05, bevelEnabled: false }), mat('#ff5d73'));
    arrow.rotation.set(-Math.PI / 2, 0, Math.PI);
    arrow.position.set(0.4, 0.01, 1.3);
    arrow.castShadow = true;
    g.add(arrow);
  }

  buildJail(g) {
    const wall = mat('#d9d2c7'), dark = mat('#3b3a48', { metal: 0.6, rough: 0.35 });
    const b = new THREE.Group();
    b.add(at(box(1.6, 1.2, 1.4, facadeMat('#cfc6b8', 'slats', '#2d2f3d')), 0, 0.6, 0));
    b.add(at(box(1.8, 0.14, 1.6, mat('#9a3b3b')), 0, 1.27, 0));
    // cell with bars (front, facing the outer corner)
    const cell = new THREE.Group();
    cell.add(at(box(1.3, 0.08, 0.9, wall), 0, 0.04, 0));
    cell.add(at(box(1.3, 0.08, 0.9, wall), 0, 1.0, 0));
    for (let k = 0; k < 9; k++) cell.add(at(cyl(0.025, 0.025, 0.95, dark, { seg: 6 }), -0.6 + k * 0.15, 0.52, 0.44));
    for (let k = 0; k < 6; k++) cell.add(at(cyl(0.025, 0.025, 0.95, dark, { seg: 6 }), 0.63, 0.52, 0.44 - k * 0.16));
    cell.position.set(0.25, 0, 1.1);
    bakeChildren(cell);
    dynamic(cell);
    b.add(cell);
    const sign = signMesh('הכלא', 1.4, 0.3, { bg: '#2d2f3d', fg: '#ffd166' });
    sign.position.set(0, 1.5, 0.72);
    b.add(sign);
    b.add(at(box(0.08, 0.5, 0.08, dark), 0, 1.25, 0.72));
    // searchlight on the roof
    const light = group(at(cyl(0.1, 0.14, 0.2, dark), 0, 0, 0), at(cyl(0.12, 0.12, 0.05, neon('#fff2b3', 0.8, 4)), 0, 0.12, 0));
    light.position.set(-0.5, 1.45, -0.4);
    dynamic(light);
    b.add(light);
    this.animated.push((dt, t) => { light.rotation.z = Math.sin(t * 0.8) * 0.8; light.rotation.x = Math.cos(t * 0.6) * 0.5; });
    b.rotation.y = Math.PI / 4;
    this.jailCell = cell;
    g.add(b);
  }

  buildHeistCorner(g) {
    const steel = mat('#aab3c2', { metal: 0.85, rough: 0.28 });
    const facade = new THREE.Group();
    facade.add(at(box(2.2, 1.7, 0.6, mat('#e8e2d6')), 0, 0.85, 0));
    for (let k = 0; k < 4; k++) facade.add(at(cyl(0.1, 0.1, 1.5, mat('#f6f1e7')), -0.9 + k * 0.6, 0.75, 0.38));
    facade.add(at(prism(2.4, 0.45, 0.8, mat('#f6f1e7')), 0, 1.7, 0.05));
    const door = new THREE.Group();
    door.add(at(cyl(0.62, 0.62, 0.16, steel, { seg: 32 }), 0, 0, 0, 0, Math.PI / 2));
    door.add(at(torus(0.62, 0.05, mat('#7d8696', { metal: 0.9, rough: 0.3 }), { ts: 32 }), 0, 0, 0.08));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      door.add(at(sphere(0.04, mat('#6c7484', { metal: 0.9 })), Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.09));
    }
    const wheel = new THREE.Group();
    for (let k = 0; k < 3; k++) wheel.add(at(box(0.7, 0.05, 0.05, mat('#ffcc3d', { metal: 0.8, rough: 0.3 })), 0, 0, 0, 0, 0, (k * Math.PI) / 3));
    wheel.add(at(cyl(0.09, 0.09, 0.08, mat('#ffcc3d', { metal: 0.8 })), 0, 0, 0, 0, Math.PI / 2));
    wheel.position.z = 0.14;
    dynamic(wheel);
    door.add(wheel);
    door.position.set(0, 0.8, 0.32);
    facade.add(door);
    this.animated.push((dt, t) => { wheel.rotation.z = Math.sin(t * 0.7) * 1.2; });
    facade.rotation.y = Math.PI / 4;
    facade.position.set(-0.1, 0, -0.1);
    g.add(facade);
    // gold bars on the pavement
    const goldM = mat('#ffc83d', { metal: 0.8, rough: 0.25 });
    for (let k = 0; k < 5; k++) g.add(at(box(0.3, 0.12, 0.14, goldM), 1.0 + (k % 3) * 0.32, 0.06 + Math.floor(k / 3) * 0.12, 1.0, Math.PI / 4));
  }

  buildPolice(g) {
    const b = new THREE.Group();
    b.add(at(box(1.8, 1.1, 1.3, facadeMat('#dfe6f2', 'classic', '#2b3a66')), 0, 0.55, 0));
    b.add(at(box(1.95, 0.14, 1.45, mat('#2f4b8f')), 0, 1.17, 0));
    const sign = signMesh('משטרה', 1.0, 0.28, { bg: '#2f4b8f', fg: '#fff' });
    sign.position.set(0, 0.95, 0.66);
    b.add(sign);
    b.rotation.y = Math.PI / 4;
    g.add(b);
    // police car
    const car = new THREE.Group();
    car.add(at(rbox(0.9, 0.26, 0.46, 0.1, mat('#ffffff', { physical: true })), 0, 0.2, 0));
    car.add(at(rbox(0.5, 0.2, 0.42, 0.08, mat('#1d2340', { physical: true })), -0.05, 0.4, 0));
    for (const [x, z] of [[-0.28, 0.22], [0.28, 0.22], [-0.28, -0.22], [0.28, -0.22]]) car.add(at(cyl(0.1, 0.1, 0.08, mat('#222'), { seg: 12 }), x, 0.1, z, 0, Math.PI / 2));
    const red = mat('#ff2a3d', { emissive: '#ff2a3d', ei: 0.3 });
    const blue = mat('#2a6bff', { emissive: '#2a6bff', ei: 0.3 });
    const lr = box(0.12, 0.07, 0.14, red), lb = box(0.12, 0.07, 0.14, blue);
    car.add(at(lr, -0.1, 0.53, 0), at(lb, 0.05, 0.53, 0));
    car.position.set(1.0, 0, 0.9);
    car.rotation.y = -Math.PI / 5;
    g.add(car);
    this.policeLights = { red, blue };
    this.animated.push((dt, t) => {
      const on = Math.floor(t * 4) % 2;
      red.emissiveIntensity = on ? 4 : 0.2;
      blue.emissiveIntensity = on ? 0.2 : 4;
    });
  }

  // ───────────────────────────────────────────── special tiles
  specialModel(t) {
    const g = new THREE.Group();
    g.position.set(0, 0.08, BAND.plotZ);
    switch (t.type) {
      case 'news': this.buildNews(g); break;
      case 'fortune': this.buildFortune(g); break;
      case 'tax': this.buildTax(g, t); break;
      case 'transit': this.buildTransit(g, t); break;
      case 'utility': this.buildUtility(g, t); break;
      default: return null;
    }
    return g;
  }

  buildNews(g) {
    g.add(at(box(1.3, 0.8, 1.0, facadeMat('#e9eef7', 'wide', '#23304f')), 0, 0.4, -0.1));
    g.add(at(box(1.4, 0.08, 1.1, mat('#d7263d')), 0, 0.84, -0.1));
    // screen
    const scr = canvasTex(256, 128, (ctx) => {
      ctx.fillStyle = '#d7263d'; ctx.fillRect(0, 0, 256, 128);
      ctx.fillStyle = '#fff'; ctx.font = `400 58px ${FONT_DISPLAY}`; ctx.textAlign = 'center'; ctx.fillText('חדשות', 128, 70);
      ctx.fillStyle = '#111'; ctx.fillRect(0, 92, 256, 36);
      ctx.fillStyle = '#ffd166'; ctx.font = `800 20px ${FONT_UI}`; ctx.fillText('מבזק • שידור חי • מבזק', 128, 117);
    });
    const screenM = new THREE.MeshStandardMaterial({ map: scr, emissive: '#fff', emissiveMap: scr, emissiveIntensity: 0.7 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), screenM);
    screen.position.set(0, 1.25, 0.2);
    g.add(screen);
    g.add(at(box(0.95, 0.5, 0.06, mat('#222')), 0, 1.25, 0.16));
    g.add(at(cyl(0.03, 0.03, 0.4, mat('#555')), 0, 0.95, 0.12));
    // satellite dish
    const dish = new THREE.Group();
    dish.add(at(sphere(0.3, mat('#f2f2f2', { side: THREE.DoubleSide }), { thetaLen: Math.PI / 3 }), 0, 0, 0, 0, -Math.PI / 2 - 0.5));
    dish.add(at(cyl(0.02, 0.02, 0.3, mat('#999')), 0, 0.1, 0.1, 0, 0.8));
    dish.position.set(-0.4, 1.05, -0.4);
    dynamic(dish);
    g.add(dish);
    this.animated.push((dt, t) => { dish.rotation.y = Math.sin(t * 0.4) * 1.2; });
  }

  buildFortune(g) {
    const tent = new THREE.Group();
    tent.add(at(cyl(0.62, 0.62, 0.7, stripeMat('#7b3fe4', '#ffd166', 12), { seg: 24 }), 0, 0.35, 0));
    tent.add(at(cone(0.78, 0.7, stripeMat('#7b3fe4', '#ffd166', 12), { seg: 24 }), 0, 1.05, 0));
    tent.add(at(sphere(0.07, mat('#ffd166', { metal: 0.6 })), 0, 1.45, 0));
    const flag = box(0.2, 0.12, 0.01, mat('#ff4d8d'));
    flag.position.set(0.1, 1.55, 0);
    tent.add(flag, at(cyl(0.01, 0.01, 0.25, mat('#555')), 0, 1.5, 0));
    // door flap
    tent.add(at(box(0.36, 0.55, 0.02, mat('#2a1450')), 0, 0.3, 0.62));
    tent.position.z = -0.15;
    g.add(tent);
    // crystal ball
    const ball = sphere(0.18, new THREE.MeshPhysicalMaterial({ color: '#c9a7ff', emissive: '#9b5cff', emissiveIntensity: 1.2, roughness: 0.05, transmission: 0, clearcoat: 1 }));
    ball.position.set(0.55, 0.52, 0.45);
    g.add(ball, at(cyl(0.1, 0.14, 0.34, mat('#6b3fa0')), 0.55, 0.2, 0.45));
    dynamic(ball);
    // orbiting sparkles
    const stars = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), neon('#ffe27a', 1.5, 4));
      s.position.set(Math.cos(k * 1.57) * 0.3, 0, Math.sin(k * 1.57) * 0.3);
      stars.add(s);
    }
    stars.position.copy(ball.position);
    dynamic(stars);
    g.add(stars);
    this.animated.push((dt, t) => {
      stars.rotation.y = t * 1.4;
      stars.position.y = 0.55 + Math.sin(t * 2) * 0.05;
      ball.material.emissiveIntensity = 1 + Math.sin(t * 3) * 0.4;
    });
  }

  buildTax(g, t) {
    g.add(at(box(1.2, 0.95, 0.9, facadeMat('#c9ced8', 'classic', '#39445c')), 0, 0.475, -0.15));
    g.add(at(prism(1.3, 0.35, 1.0, mat('#7d8699')), 0, 0.95, -0.15));
    const sign = signMesh(t.type === 'tax' && t.amount === 100 ? 'מס מותרות' : 'מס הכנסה', 1.0, 0.24, { bg: '#39445c', fg: '#fff' });
    sign.position.set(0, 0.72, 0.31);
    g.add(sign);
    // stacks of paperwork
    const paper = mat('#ffffff');
    for (let k = 0; k < 3; k++) for (let j = 0; j < 4 + k; j++) g.add(at(box(0.25, 0.04, 0.32, paper), 0.35 + k * 0.1 - 0.4, 0.02 + j * 0.045, 0.55, j * 0.2));
  }

  buildTransit(g, t) {
    const lineM = mat('#8c93a8');
    if (t.model === 'ferry') {
      g.add(at(box(1.3, 0.7, 0.9, facadeMat('#ffffff', 'wide', '#2a5d8f')), 0, 0.35, -0.2));
      g.add(at(box(1.4, 0.1, 1.0, mat('#2a7de1')), 0, 0.75, -0.2));
      const tower = group(at(box(0.36, 0.7, 0.36, mat('#ffffff')), 0, 0.35, 0), at(cone(0.3, 0.35, mat('#2a7de1'), { seg: 4 }), 0, 0.88, 0, Math.PI / 4));
      const clock = cyl(0.12, 0.12, 0.02, mat('#fff8e0'));
      clock.rotation.x = Math.PI / 2; clock.position.set(0, 0.5, 0.19);
      tower.add(clock);
      tower.position.set(0.35, 0.8, -0.2);
      g.add(tower);
      // anchor sign
      const s = signMesh('⚓ מעבורת', 0.9, 0.24, { bg: '#2a7de1', fg: '#fff', font: FONT_UI, weight: 800 });
      s.position.set(-0.15, 0.55, 0.26);
      g.add(s);
      // mini ferry bobbing in a pool
      g.add(at(cyl(0.55, 0.55, 0.04, mat('#46c6e8', { rough: 0.1 })), 0, 0.02, 0.55).rotateX(0));
      const boat = group(at(rbox(0.6, 0.14, 0.24, 0.06, mat('#fff', { physical: true })), 0, 0.07, 0), at(box(0.3, 0.12, 0.18, mat('#2a7de1')), -0.05, 0.2, 0));
      boat.position.set(0, 0.05, 0.55);
      dynamic(boat);
      g.add(boat);
      this.animated.push((dt, tt) => { boat.position.y = 0.05 + Math.sin(tt * 2) * 0.02; boat.rotation.z = Math.sin(tt * 1.5) * 0.08; boat.rotation.y = Math.sin(tt * 0.3) * 0.5; });
    } else if (t.model === 'cable') {
      g.add(at(box(0.9, 0.55, 0.8, facadeMat('#f4ecd8', 'wide', '#3b3f5c')), -0.35, 0.28, -0.1));
      g.add(at(box(1.0, 0.08, 0.9, mat('#e24a4a')), -0.35, 0.58, -0.1));
      const pylon = group();
      for (const x of [-0.12, 0.12]) pylon.add(at(box(0.06, 2.2, 0.06, lineM), x, 1.1, 0));
      for (let k = 0; k < 5; k++) pylon.add(at(box(0.3, 0.03, 0.03, lineM), 0, 0.3 + k * 0.42, 0, 0, 0, 0.6));
      pylon.add(at(box(0.5, 0.08, 0.1, lineM), 0, 2.2, 0));
      pylon.position.set(0.5, 0, -0.3);
      g.add(pylon);
      const cable = cyl(0.012, 0.012, 2.4, mat('#333'));
      cable.position.set(0.05, 1.35, -0.3);
      cable.rotation.z = Math.PI / 2 - 0.7;
      g.add(cable);
      const car = group(at(rbox(0.36, 0.28, 0.3, 0.06, mat('#e24a4a', { physical: true })), 0, 0, 0), at(cyl(0.01, 0.01, 0.2, mat('#333')), 0, 0.22, 0));
      dynamic(car);
      g.add(car);
      this.animated.push((dt, tt) => {
        const k = (Math.sin(tt * 0.5) + 1) / 2;
        car.position.set(-0.4 + k * 0.9, 0.62 + k * 1.1 - 0.25, -0.3);
      });
    } else if (t.model === 'blimp') {
      const mast = group(at(cyl(0.05, 0.08, 1.6, lineM), 0, 0.8, 0), at(sphere(0.08, mat('#ff4d5e')), 0, 1.62, 0));
      mast.position.set(0.45, 0, -0.35);
      g.add(mast);
      g.add(at(box(0.9, 0.45, 0.8, facadeMat('#f2f0ff', 'wide', '#39306b')), -0.35, 0.22, -0.1));
      g.add(at(box(1.0, 0.07, 0.9, mat('#7a5cff')), -0.35, 0.48, -0.1));
      const blimp = new THREE.Group();
      const body = sphere(0.5, mat('#c9c3ff', { physical: true }), { ws: 24, hs: 16 });
      body.scale.set(1.8, 0.8, 0.8);
      blimp.add(body);
      blimp.add(at(box(0.3, 0.12, 0.16, mat('#7a5cff')), 0, -0.44, 0));
      for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) blimp.add(at(box(0.25, 0.02, 0.3, mat('#7a5cff')), -0.82, 0, 0, 0, r));
      const band = torus(0.41, 0.03, mat('#ff4d5e'));
      band.rotation.y = Math.PI / 2;
      band.scale.set(1, 1, 1);
      blimp.add(band);
      blimp.position.set(0.1, 1.9, -0.2);
      blimp.scale.setScalar(0.8);
      dynamic(blimp);
      g.add(blimp);
      this.animated.push((dt, tt) => { blimp.position.y = 1.9 + Math.sin(tt * 0.9) * 0.12; blimp.rotation.y = Math.sin(tt * 0.3) * 0.3; blimp.rotation.z = Math.sin(tt * 0.7) * 0.05; });
    } else if (t.model === 'monorail') {
      const track = box(1.9, 0.1, 0.16, mat('#b8bfd0'));
      track.position.set(0, 1.0, -0.2);
      g.add(track);
      for (const x of [-0.7, 0.7]) g.add(at(box(0.12, 1.0, 0.12, lineM), x, 0.5, -0.2));
      g.add(at(box(1.0, 0.35, 0.7, facadeMat('#ffffff', 'glass', '#35a0c9')), 0, 0.18, 0.2));
      g.add(at(box(1.1, 0.06, 0.8, mat('#35a0c9')), 0, 0.38, 0.2));
      const train = group(at(rbox(0.8, 0.26, 0.24, 0.1, mat('#ffffff', { physical: true })), 0, 0, 0), at(box(0.6, 0.08, 0.25, mat('#35a0c9', { emissive: '#35a0c9', ei: 0.3 })), 0, 0.04, 0));
      dynamic(train);
      g.add(train);
      this.animated.push((dt, tt) => {
        const k = ((tt * 0.25) % 1);
        train.position.set(-1.2 + k * 2.4, 1.2, -0.2);
        train.visible = k > 0.08 && k < 0.92;
      });
    }
  }

  buildUtility(g, t) {
    if (t.model === 'wind') {
      for (const [x, z, s] of [[-0.45, -0.3, 1], [0.45, -0.1, 0.8], [0.0, 0.45, 0.65]]) {
        const tur = new THREE.Group();
        tur.add(at(cyl(0.035 * s, 0.06 * s, 1.8 * s, mat('#ffffff')), 0, 0.9 * s, 0));
        const hub = new THREE.Group();
        hub.add(sphere(0.07 * s, mat('#ffffff')));
        for (let k = 0; k < 3; k++) {
          const blade = box(0.07 * s, 0.75 * s, 0.02 * s, mat('#ffffff'));
          blade.position.y = 0.37 * s;
          const holder = new THREE.Group();
          holder.rotation.z = (k * Math.PI * 2) / 3;
          holder.add(blade);
          hub.add(holder);
        }
        hub.position.set(0, 1.8 * s, 0.08 * s);
        dynamic(hub);
        tur.add(hub);
        tur.position.set(x, 0, z);
        g.add(tur);
        const sp = 1.4 + s;
        this.animated.push((dt) => { hub.rotation.z -= dt * sp; });
      }
    } else {
      const tank = new THREE.Group();
      for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) tank.add(at(cyl(0.03, 0.03, 1.2, mat('#8a93a6')), x, 0.6, z));
      tank.add(at(cyl(0.5, 0.5, 0.7, mat('#63b7c9', { physical: true })), 0, 1.5, 0));
      tank.add(at(cone(0.55, 0.3, mat('#4a95a6')), 0, 2.0, 0));
      const s = signMesh('מים', 0.6, 0.2, { bg: 'transparent', fg: '#ffffff' });
      s.position.set(0, 1.5, 0.51);
      tank.add(s);
      tank.position.z = -0.1;
      g.add(tank);
    }
  }

  // ───────────────────────────────────────────── plaza
  buildPlaza() {
    const P = PARK;
    // Ground texture: grass, paving circle, diagonal paths, flower beds
    const tex = canvasTex(1024, 1024, (ctx, W) => {
      const c = W / 2;
      const sc = W / (P * 2);
      ctx.fillStyle = '#7cd06f'; ctx.fillRect(0, 0, W, W);
      for (let i = 0; i < 4000; i++) {
        ctx.fillStyle = `rgba(${40 + Math.random() * 40},${120 + Math.random() * 60},${40},${Math.random() * 0.12})`;
        ctx.fillRect(Math.random() * W, Math.random() * W, 3, 3);
      }
      // mowing stripes
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (let x = 0; x < W; x += 64) ctx.fillRect(x, 0, 32, W);
      // diagonal paths
      ctx.strokeStyle = '#f1e3c8'; ctx.lineWidth = 1.1 * sc; ctx.lineCap = 'round';
      for (const [dx, dy] of [[1, 1], [1, -1]]) {
        ctx.beginPath(); ctx.moveTo(c - dx * c, c - dy * c); ctx.lineTo(c + dx * c, c + dy * c); ctx.stroke();
      }
      ctx.lineWidth = 0.9 * sc;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        ctx.beginPath(); ctx.moveTo(c - dx * c, c - dy * c); ctx.lineTo(c + dx * c, c + dy * c); ctx.stroke();
      }
      // paving circle
      ctx.fillStyle = '#efe0c2';
      ctx.beginPath(); ctx.arc(c, c, 4.2 * sc, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#dcc9a3'; ctx.lineWidth = 4;
      for (let r = 3.6; r <= 4.2; r += 0.3) { ctx.beginPath(); ctx.arc(c, c, r * sc, 0, Math.PI * 2); ctx.stroke(); }
      // quadrant plazas
      for (const [qx, qy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        ctx.fillStyle = '#efe0c2';
        ctx.beginPath(); ctx.arc(c + qx * 4.9 * sc, c + qy * 4.9 * sc, 2.3 * sc, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#dcc9a3'; ctx.lineWidth = 5; ctx.stroke();
      }
      // flower beds along the edge
      const flowers = ['#ff6f91', '#ffd166', '#ffffff', '#c77dff', '#ff9f43'];
      for (let i = 0; i < 700; i++) {
        const edge = Math.random() < 0.5;
        let x = Math.random() * W, y = Math.random() * W;
        const m = 0.55 * sc;
        if (edge) { if (Math.random() < 0.5) x = Math.random() < 0.5 ? Math.random() * m : W - Math.random() * m; else y = Math.random() < 0.5 ? Math.random() * m : W - Math.random() * m; }
        else continue;
        ctx.fillStyle = flowers[i % flowers.length];
        ctx.beginPath(); ctx.arc(x, y, 3 + Math.random() * 3, 0, Math.PI * 2); ctx.fill();
      }
    });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(P * 2, P * 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.0;
    ground.receiveShadow = true;
    this.root.add(ground);

    this.buildDiceBowl();
    this.buildVault(4.9, -4.9);
    this.ferris = this.buildFerris(-4.9, -4.9);
    this.buildFountain(-4.9, 4.9);
    this.landmarks = {};
    this.buildStatue(4.9, 4.9);
    this.buildTrees();
  }

  feltTex(title, sub) {
    return canvasTex(1024, 1024, (ctx, W) => {
      const c = W / 2;
      const grad = ctx.createRadialGradient(c, c, 50, c, c, c);
      grad.addColorStop(0, '#1f8f6a'); grad.addColorStop(1, '#0f5e48');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, W);
      for (let i = 0; i < 9000; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; ctx.fillRect(Math.random() * W, Math.random() * W, 2, 2); }
      ctx.strokeStyle = 'rgba(255,230,160,0.55)'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(c, c, c * 0.86, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c, c, c * 0.82, 0, Math.PI * 2); ctx.stroke();
      ctx.save(); ctx.translate(c, c);
      for (let k = 0; k < 40; k++) { ctx.rotate(Math.PI / 20); ctx.fillStyle = 'rgba(255,230,160,0.35)'; ctx.fillRect(c * 0.83, -3, 26, 6); }
      ctx.restore();
      ctx.fillStyle = 'rgba(255,236,170,0.9)';
      ctx.textAlign = 'center';
      const size = fitText(ctx, title, W * 0.72, 150, 400, FONT_DISPLAY);
      ctx.font = `400 ${size}px ${FONT_DISPLAY}`;
      ctx.fillText(title, c, c + 40);
      ctx.font = `800 34px ${FONT_UI}`;
      ctx.fillStyle = 'rgba(255,236,170,0.6)';
      ctx.fillText(sub, c, c + 100);
    });
  }

  buildDiceBowl() {
    const R = 3.05;
    const g = new THREE.Group();
    const felt = this.feltTex('בומטאון', 'נכסים  ·  דו-קרבות  ·  כאוס מוחלט');
    this.feltMat = new THREE.MeshStandardMaterial({ map: felt, roughness: 0.95 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 64), this.feltMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.06;
    floor.receiveShadow = true;
    g.add(floor);
    const woodM = mat('#8b5a3c', { rough: 0.45, physical: true, clearcoat: 0.8 });
    const wall = cyl(R + 0.12, R + 0.12, 0.42, woodM, { seg: 64, open: true });
    wall.material = new THREE.MeshPhysicalMaterial({ color: '#8b5a3c', roughness: 0.4, clearcoat: 0.8, side: THREE.DoubleSide });
    wall.position.y = 0.2;
    g.add(wall);
    const rim = torus(R + 0.12, 0.16, mat('#ffc83d', { metal: 0.85, rough: 0.25 }), { ts: 96, rs: 12 });
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.42;
    g.add(rim);
    const outerM = new THREE.MeshStandardMaterial({ color: '#6e4630', roughness: 0.5, side: THREE.DoubleSide });
    const outer = cyl(R + 0.5, R + 0.62, 0.38, outerM, { seg: 64, open: true });
    outer.material = outerM;
    outer.position.y = 0.19;
    g.add(outer);
    const top = new THREE.Mesh(new THREE.RingGeometry(R + 0.2, R + 0.5, 64), mat('#7a4e36', { rough: 0.45 }));
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.38;
    top.receiveShadow = true;
    g.add(top);
    // Ring of bulbs that light up at night / when dice roll
    this.bowlBulbs = [];
    const bulbM = neon('#ffe9a8', 0.6, 3.5);
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      const b = sphere(0.05, bulbM, { ws: 8, hs: 6 });
      b.position.set(Math.cos(a) * (R + 0.45), 0.4, Math.sin(a) * (R + 0.45));
      g.add(b);
    }
    this.root.add(bakeChildren(g));
    this.bowl = { radius: R, floorY: 0.06 };
  }

  buildVault(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const marble = mat('#f4efe6', { rough: 0.35 });
    g.add(at(cyl(1.7, 1.85, 0.3, marble, { seg: 40 }), 0, 0.15, 0));
    g.add(at(cyl(1.5, 1.6, 0.25, mat('#e1d8c8'), { seg: 40 }), 0, 0.42, 0));
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      g.add(at(cyl(0.09, 0.09, 1.6, marble, { seg: 12 }), Math.cos(a) * 1.35, 1.35, Math.sin(a) * 1.35));
    }
    g.add(at(torus(1.36, 0.1, mat('#ffc83d', { metal: 0.85, rough: 0.25 }), { ts: 48 }), 0, 2.15, 0, 0, Math.PI / 2));
    // glass dome
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#dff6ff', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22,
      clearcoat: 1, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.5,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.36, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), glass);
    dome.position.y = 2.15;
    dome.renderOrder = 2;
    dynamic(dome);
    g.add(dome);
    const cyl2 = new THREE.Mesh(new THREE.CylinderGeometry(1.34, 1.34, 1.6, 40, 1, true), glass);
    cyl2.position.y = 1.35;
    cyl2.renderOrder = 2;
    dynamic(cyl2);
    g.add(cyl2);
    g.add(at(sphere(0.12, mat('#ffc83d', { metal: 0.9, rough: 0.2 })), 0, 3.55, 0));
    g.add(at(cyl(0.03, 0.03, 0.3, mat('#ffc83d', { metal: 0.9 })), 0, 3.4, 0));
    // coin pile (instanced) — grows with the jackpot
    const coinGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.035, 14);
    const coinMat = mat('#ffcf4a', { metal: 0.85, rough: 0.28, emissive: '#6b4a00', ei: 0.15 });
    const MAX = 420;
    const pile = new THREE.InstancedMesh(coinGeo, coinMat, MAX);
    pile.castShadow = true;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const slots = [];
    for (let k = 0; k < MAX; k++) {
      const layer = Math.floor(Math.sqrt(k / 3));
      const a = k * 2.399;
      const rr = Math.max(0, 1.12 - layer * 0.12) * Math.sqrt(((k * 0.618) % 1));
      pos.set(Math.cos(a) * rr, 0.58 + layer * 0.06 + Math.random() * 0.02, Math.sin(a) * rr);
      e.set((Math.random() - 0.5) * 0.6, Math.random() * 3, (Math.random() - 0.5) * 0.6);
      q.setFromEuler(e);
      m4.compose(pos, q, one);
      slots.push(m4.clone());
    }
    slots.sort((a, b) => a.elements[13] - b.elements[13]);
    slots.forEach((mm, k) => pile.setMatrixAt(k, mm));
    pile.count = 0;
    g.add(pile);
    this.vault = { group: g, pile, max: MAX, shown: 0, target: 0 };
    this.vaultTop = new THREE.Vector3(x, 3.9, z);
    dynamic(pile);
    bakeChildren(g);
    this.animated.push((dt) => {
      const v = this.vault;
      if (v.shown !== v.target) {
        v.shown += Math.sign(v.target - v.shown) * Math.max(1, Math.round(Math.abs(v.target - v.shown) * dt * 4));
        if (Math.abs(v.shown - v.target) < 2) v.shown = v.target;
        v.pile.count = Math.max(0, Math.min(v.max, v.shown));
      }
    });
    this.root.add(g);
  }

  setVault(amount) {
    this.vault.target = Math.min(this.vault.max, Math.round(Math.sqrt(Math.max(0, amount)) * 11));
  }

  buildFerris(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const steel = mat('#ffffff', { rough: 0.4 });
    const R = 2.0;
    g.add(at(cyl(1.4, 1.5, 0.2, mat('#e8dcc4'), { seg: 24 }), 0, 0.1, 0));
    for (const s of [-1, 1]) {
      const leg1 = box(0.1, 2.9, 0.1, steel); leg1.position.set(-0.7, 1.35, s * 0.35); leg1.rotation.z = -0.25; g.add(leg1);
      const leg2 = box(0.1, 2.9, 0.1, steel); leg2.position.set(0.7, 1.35, s * 0.35); leg2.rotation.z = 0.25; g.add(leg2);
    }
    const wheel = new THREE.Group();
    wheel.position.y = 2.75;
    const rimM = mat('#ff5d8f', { rough: 0.4 });
    for (const s of [-0.3, 0.3]) {
      const rim = torus(R, 0.05, rimM, { ts: 48, rs: 6 });
      rim.position.z = s;
      wheel.add(rim);
      for (let k = 0; k < 12; k++) {
        const sp = box(0.03, R, 0.03, steel);
        sp.position.set(Math.cos((k / 12) * Math.PI * 2) * R / 2, Math.sin((k / 12) * Math.PI * 2) * R / 2, s);
        sp.rotation.z = (k / 12) * Math.PI * 2 - Math.PI / 2;
        wheel.add(sp);
      }
    }
    wheel.add(at(cyl(0.12, 0.12, 0.8, mat('#ffd166')), 0, 0, 0, 0, Math.PI / 2));
    const bulbM = neon('#fff1a8', 0.2, 3.5);
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      wheel.add(at(sphere(0.045, bulbM, { ws: 6, hs: 4 }), Math.cos(a) * R, Math.sin(a) * R, 0.33));
    }
    const colors = ['#ff6f91', '#ffd166', '#4cc9f0', '#7bd389', '#c77dff', '#ff9f43'];
    const gondolas = [];
    for (let k = 0; k < 8; k++) {
      const gg = new THREE.Group();
      gg.add(at(rbox(0.36, 0.3, 0.4, 0.07, mat(colors[k % 6], { physical: true })), 0, -0.2, 0));
      gg.add(at(box(0.4, 0.04, 0.44, mat('#fff')), 0, -0.03, 0));
      const a = (k / 8) * Math.PI * 2;
      gg.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
      wheel.add(gg);
      gondolas.push(gg);
    }
    g.add(wheel);
    dynamic(wheel);
    this.animated.push((dt) => {
      wheel.rotation.z += dt * 0.18;
      for (const gg of gondolas) gg.rotation.z = -wheel.rotation.z;
    });
    g.rotation.y = Math.PI / 4;
    this.root.add(g);
    bakeChildren(g);
    return g;
  }

  buildFountain(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const stone = mat('#e8e1d4', { rough: 0.6 });
    g.add(at(cyl(1.5, 1.6, 0.35, stone, { seg: 32 }), 0, 0.17, 0));
    const water = cyl(1.36, 1.36, 0.05, mat('#58d3f0', { rough: 0.05, metal: 0.1, emissive: '#1a6f8f', ei: 0.2 }), { seg: 32 });
    water.position.y = 0.3;
    g.add(water);
    g.add(at(cyl(0.18, 0.28, 0.9, stone), 0, 0.7, 0));
    g.add(at(cyl(0.7, 0.5, 0.15, stone, { seg: 24 }), 0, 1.15, 0));
    g.add(at(cyl(0.6, 0.6, 0.04, mat('#58d3f0', { rough: 0.05 }), { seg: 24 }), 0, 1.22, 0));
    g.add(at(cyl(0.08, 0.12, 0.5, stone), 0, 1.45, 0));
    // water jets as particles
    const N = 90;
    const geo = new THREE.BufferGeometry();
    const posArr = new Float32Array(N * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const drops = [];
    for (let k = 0; k < N; k++) drops.push({ t: Math.random(), a: Math.random() * Math.PI * 2, s: 0.8 + Math.random() * 0.4 });
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#bff3ff', size: 0.09, transparent: true, opacity: 0.85, depthWrite: false }));
    pts.frustumCulled = false;
    g.add(pts);
    this.animated.push((dt) => {
      for (let k = 0; k < N; k++) {
        const d = drops[k];
        d.t += dt * 0.7 * d.s;
        if (d.t > 1) { d.t -= 1; d.a = Math.random() * Math.PI * 2; }
        const r = d.t * 0.62;
        const y = 1.7 + d.t * 1.5 - d.t * d.t * 2.3;
        posArr[k * 3] = Math.cos(d.a) * r;
        posArr[k * 3 + 1] = y;
        posArr[k * 3 + 2] = Math.sin(d.a) * r;
      }
      geo.attributes.position.needsUpdate = true;
    });
    this.root.add(g);
  }

  buildStatue(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const stone = mat('#e9e2d6', { rough: 0.5 });
    g.add(at(cyl(1.1, 1.25, 0.3, stone, { seg: 8 }), 0, 0.15, 0));
    g.add(at(box(0.9, 0.9, 0.9, stone), 0, 0.75, 0));
    g.add(at(box(1.05, 0.12, 1.05, mat('#d8cdb9')), 0, 1.25, 0));
    const plaque = signMesh('הטייקון המוביל', 0.8, 0.2, { bg: '#ffc83d', fg: '#4a3200' });
    plaque.position.set(0, 0.75, 0.46);
    plaque.rotation.y = 0;
    const holder = new THREE.Group();
    holder.add(plaque);
    holder.rotation.y = Math.PI / 4;
    g.add(holder);
    this.statueSlot = new THREE.Group();
    dynamic(this.statueSlot);
    this.statueSlot.position.y = 1.31;
    g.add(this.statueSlot);
    this.root.add(g);
    // soft flowers ring
    const cols = ['#ff6f91', '#ffd166', '#fff', '#c77dff'];
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      g.add(at(sphere(0.07, mat(cols[k % 4]), { ws: 6, hs: 4 }), Math.cos(a) * 1.45, 0.06, Math.sin(a) * 1.45));
    }
    bakeChildren(g);
  }

  buildTrees() {
    const trees = new THREE.Group();
    const P = PARK;
    const leafCols = ['#4fb561', '#5cc36b', '#3fa35a', '#72cf6a'];
    this.leafMats = leafCols.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
    const trunkM = mat('#9a6b47');
    const spots = [];
    for (let k = 0; k < 26; k++) {
      const side = k % 4;
      const u = -P + 0.8 + ((k * 0.37) % 1) * (P * 2 - 1.6);
      const inset = 0.7;
      const pos = [[u, P - inset], [-P + inset, u], [u, -P + inset], [P - inset, u]][side];
      // leave gaps at the path ends
      if (Math.abs(pos[0]) < 1.2 || Math.abs(pos[1]) < 1.2) continue;
      if (Math.abs(Math.abs(pos[0]) - Math.abs(pos[1])) < 1.0) continue;
      spots.push(pos);
    }
    spots.forEach(([x, z], i) => {
      const t = new THREE.Group();
      const s = 0.75 + ((i * 0.53) % 1) * 0.45;
      t.add(at(cyl(0.07 * s, 0.1 * s, 0.6 * s, trunkM, { seg: 6 }), 0, 0.3 * s, 0));
      const lm = this.leafMats[i % 4];
      if (i % 3 === 0) {
        t.add(at(cone(0.45 * s, 0.8 * s, lm, { seg: 7 }), 0, 0.85 * s, 0));
        t.add(at(cone(0.34 * s, 0.6 * s, lm, { seg: 7 }), 0, 1.25 * s, 0));
      } else {
        t.add(at(sphere(0.42 * s, lm, { ws: 10, hs: 8 }), 0, 0.9 * s, 0));
        t.add(at(sphere(0.3 * s, lm, { ws: 10, hs: 8 }), 0.2 * s, 1.15 * s, 0.1 * s));
      }
      t.position.set(x, 0, z);
      t.rotation.y = i;
      trees.add(t);
    });
    // benches + lamps around the bowl paths
    const benchM = mat('#b5764b'), ironM = mat('#3b3a48', { metal: 0.5, rough: 0.4 });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const b = new THREE.Group();
      b.add(at(box(0.8, 0.05, 0.25, benchM), 0, 0.22, 0));
      b.add(at(box(0.8, 0.2, 0.04, benchM), 0, 0.36, -0.12));
      for (const xx of [-0.35, 0.35]) b.add(at(box(0.04, 0.22, 0.24, ironM), xx, 0.11, 0));
      b.position.set(Math.cos(a) * 4.0, 0, Math.sin(a) * 4.0);
      b.lookAt(0, 0, 0);
      trees.add(b);
    }
    const baked = bake(trees);
    this.root.add(baked);
  }

  // ───────────────────────────────────────────── road + traffic
  buildRoad() {
    const road = new THREE.Group();
    const R0 = ROAD_IN, R1 = PARK;
    const roadM = mat('#4a4a5a', { rough: 0.85 });
    const lineM = mat('#fff4d6', { rough: 0.6 });
    const w = R0 - R1;
    for (let s = 0; s < 4; s++) {
      const a = (s * Math.PI) / 2;
      const seg = box(R0 * 2, 0.03, w, roadM, { cast: false });
      seg.position.set(Math.sin(a) * ROAD_MID, 0.015, Math.cos(a) * ROAD_MID);
      seg.rotation.y = a;
      road.add(seg);
      for (let k = -8; k <= 8; k++) {
        const dash = box(0.42, 0.01, 0.06, lineM, { cast: false });
        const along = k * 1.0;
        dash.position.set(Math.sin(a) * ROAD_MID + Math.cos(a) * along, 0.035, Math.cos(a) * ROAD_MID - Math.sin(a) * along);
        dash.rotation.y = a;
        road.add(dash);
      }
    }
    this.root.add(bake(road));
    // street lamps along the inner edge of the road
    const lamps = new THREE.Group();
    const poleM = mat('#2f3040', { metal: 0.4, rough: 0.5 });
    const bulbM = neon('#ffe2a0', 0.1, 4);
    for (let s = 0; s < 4; s++) {
      for (let k = -3; k <= 3; k++) {
        if (k === 0) continue;
        const a = (s * Math.PI) / 2;
        const along = k * 2.3;
        const px = Math.sin(a) * (PARK - 0.15) + Math.cos(a) * along;
        const pz = Math.cos(a) * (PARK - 0.15) - Math.sin(a) * along;
        const l = new THREE.Group();
        l.add(at(cyl(0.03, 0.045, 1.1, poleM, { seg: 6 }), 0, 0.55, 0));
        l.add(at(sphere(0.09, bulbM, { ws: 8, hs: 6 }), 0, 1.15, 0));
        l.add(at(cone(0.12, 0.08, poleM, { seg: 8 }), 0, 1.25, 0));
        l.position.set(px, 0, pz);
        lamps.add(l);
      }
    }
    this.root.add(bake(lamps));
    this.buildCars();
  }

  buildCars() {
    const colors = ['#ff5d73', '#4cc9f0', '#ffd166', '#7bd389', '#ffffff', '#c77dff', '#ff9f43'];
    const headM = neon('#fff6d8', 0.1, 3);
    const tailM = neon('#ff3040', 0.2, 2.5);
    this.cars = [];
    const L = ROAD_MID * 8; // perimeter
    for (let k = 0; k < 7; k++) {
      const car = new THREE.Group();
      const body = mat(colors[k], { physical: true, clearcoat: 1, rough: 0.35 });
      const bus = k === 3;
      const len = bus ? 1.0 : 0.62;
      car.add(at(rbox(len, 0.2, 0.34, 0.08, body), 0, 0.16, 0));
      car.add(at(rbox(bus ? 0.92 : 0.36, 0.18, 0.3, 0.07, bus ? body : mat('#20243a', { physical: true })), bus ? 0 : -0.04, 0.32, 0));
      if (bus) car.add(at(box(0.93, 0.08, 0.31, mat('#20243a')), 0, 0.34, 0));
      for (const [x, z] of [[-len * 0.32, 0.17], [len * 0.32, 0.17], [-len * 0.32, -0.17], [len * 0.32, -0.17]]) car.add(at(cyl(0.075, 0.075, 0.06, mat('#1d1d26'), { seg: 10 }), x, 0.075, z, 0, Math.PI / 2));
      car.add(at(box(0.03, 0.05, 0.08, headM), len / 2, 0.18, 0.1), at(box(0.03, 0.05, 0.08, headM), len / 2, 0.18, -0.1));
      car.add(at(box(0.03, 0.05, 0.08, tailM), -len / 2, 0.18, 0.1), at(box(0.03, 0.05, 0.08, tailM), -len / 2, 0.18, -0.1));
      bakeChildren(car);
      car.userData = { d: (k / 7) * L, speed: 1.1 + (k % 3) * 0.25, lane: 0.22 };
      this.root.add(car);
      this.cars.push(car);
    }
    this.animated.push((dt) => {
      for (const car of this.cars) {
        const u = car.userData;
        u.d = (u.d + dt * u.speed) % L;
        placeOnLoop(car, u.d, ROAD_MID + u.lane);
      }
    });
  }

  // ───────────────────────────────────────────── highlights
  buildHighlights() {
    const tex = canvasTex(256, 256, (ctx) => {
      ctx.clearRect(0, 0, 256, 256);
      roundRect(ctx, 10, 10, 236, 236, 30);
      ctx.lineWidth = 14; ctx.strokeStyle = '#fff'; ctx.stroke();
      const g = ctx.createRadialGradient(128, 128, 40, 128, 128, 170);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.35)');
      ctx.fillStyle = g; roundRect(ctx, 10, 10, 236, 236, 30); ctx.fill();
    });
    this.hlTex = tex;
    this.highlights = new Map();
    this.hover = this.makeHighlight('#ffffff');
  }

  makeHighlight(color) {
    const m = new THREE.MeshBasicMaterial({ map: this.hlTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    mesh.renderOrder = 5;
    this.root.add(mesh);
    return mesh;
  }

  placeHighlight(mesh, i, opacity = 0.9) {
    const t = this.tiles[i];
    const corner = isCorner(i);
    mesh.position.copy(t.group.position);
    mesh.position.y = 0.1;
    mesh.rotation.z = tileRot(i);
    mesh.scale.set(corner ? CORNER : TILE_W, corner ? CORNER : CORNER, 1);
    mesh.visible = true;
    mesh.material.opacity = opacity;
  }

  /** Show pulsing highlights on a set of tiles (build mode etc). */
  setMarked(indices, color = '#ffd166') {
    for (const [i, m] of this.highlights) if (!indices.includes(i)) { m.visible = false; }
    for (const i of indices) {
      let m = this.highlights.get(i);
      if (!m) { m = this.makeHighlight(color); this.highlights.set(i, m); }
      m.material.color.set(color);
      this.placeHighlight(m, i, 0.8);
    }
  }

  // ───────────────────────────────────────────── maps
  /** Re-skin the board for a city map: tile names, felt, landmark, trees. */
  setMap(id) {
    const map = applyMap(id);
    this.mapId = map.id;
    for (const tile of this.tiles) {
      const m = tile.art.material;
      m.map?.dispose();
      m.map = this.tileArt(TILES[tile.index]);
      m.needsUpdate = true;
    }
    this.feltMat.map?.dispose();
    this.feltMat.map = map.id === 'boomtown'
      ? this.feltTex('בומטאון', 'נכסים  ·  דו-קרבות  ·  כאוס מוחלט')
      : this.feltTex(map.center, 'בומטאון  ·  ישראל');
    this.feltMat.needsUpdate = true;
    this.ferris.visible = map.landmark === 'ferris';
    for (const g of Object.values(this.landmarks)) g.visible = false;
    if (map.landmark !== 'ferris') {
      if (!this.landmarks[map.landmark]) this.landmarks[map.landmark] = this.buildLandmark(map.landmark);
      this.landmarks[map.landmark].visible = true;
    }
    map.leaves.forEach((c, k) => this.leafMats[k]?.color.set(c));
    return map;
  }

  buildLandmark(kind) {
    const g = new THREE.Group();
    const x = -4.9, z = -4.9;
    g.add(at(cyl(1.5, 1.65, 0.3, mat('#e8dcc4'), { seg: 24 }), 0, 0.15, 0));
    const beacon = neon('#ff3b3b', 1.5, 5);
    if (kind === 'empire') {
      // Art-deco skyscraper with setbacks, crown and antenna
      const tiers = [[1.9, 2.2], [1.45, 1.6], [1.1, 1.3], [0.8, 0.9], [0.55, 0.6]];
      let y = 0.3;
      tiers.forEach(([w, h], k) => {
        const m = facadeMat(k % 2 ? '#d9cfbd' : '#cfc3ad', 'classic', '#4a5a78');
        g.add(at(facadeBox(w, h, w, m, { floors: Math.round(h / 0.33), cell: 0.3 }), 0, y + h / 2, 0));
        g.add(at(box(w + 0.08, 0.06, w + 0.08, mat('#b8a88a')), 0, y + h, 0));
        y += h;
      });
      g.add(at(cyl(0.18, 0.28, 0.7, mat('#e8e2d4', { metal: 0.3 }), { seg: 8 }), 0, y + 0.35, 0));
      g.add(at(cyl(0.03, 0.06, 1.3, mat('#c9ccd4', { metal: 0.8 }), { seg: 6 }), 0, y + 1.35, 0));
      g.add(at(sphere(0.07, beacon), 0, y + 2.02, 0));
    } else if (kind === 'clocktower') {
      const stone = facadeMat('#d9c089', 'arch', '#3a3f5c');
      g.add(at(facadeBox(1.2, 4.2, 1.2, stone, { floors: 12, cell: 0.3 }), 0, 0.3 + 2.1, 0));
      g.add(at(box(1.34, 0.9, 1.34, mat('#cdb27a')), 0, 4.95, 0));
      const face = canvasTex(256, 256, (ctx) => {
        ctx.fillStyle = '#c9a44c'; ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#fbf6e6'; ctx.beginPath(); ctx.arc(128, 128, 104, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#2a2438'; ctx.lineWidth = 6; ctx.stroke();
        for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; ctx.fillStyle = '#2a2438'; ctx.fillRect(128 + Math.cos(a) * 84 - 4, 128 + Math.sin(a) * 84 - 4, 8, 8); }
        ctx.lineCap = 'round'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(128, 62); ctx.stroke();
        ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(128, 128); ctx.lineTo(178, 128); ctx.stroke();
      });
      const faceM = new THREE.MeshStandardMaterial({ map: face, emissive: '#ffe9a8', emissiveMap: face, emissiveIntensity: 0.15 });
      for (let k = 0; k < 4; k++) {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), faceM);
        const a = (k * Math.PI) / 2;
        f.position.set(Math.sin(a) * 0.68, 4.95, Math.cos(a) * 0.68);
        f.rotation.y = a;
        g.add(f);
      }
      g.add(at(box(1.2, 0.5, 1.2, mat('#b89a5e')), 0, 5.65, 0));
      g.add(at(cone(0.9, 1.9, mat('#4f6b5c', { rough: 0.5 }), { seg: 4 }), 0, 6.85, 0, Math.PI / 4));
      g.add(at(sphere(0.08, mat('#ffc83d', { metal: 0.9 })), 0, 7.85, 0));
    } else if (kind === 'eiffel' || kind === 'tokyotower') {
      // Lattice tower: tapered segments with a wireframe lattice overlay
      const tokyo = kind === 'tokyotower';
      const solid = (k) => (tokyo ? mat(k % 2 ? '#ffffff' : '#ff5a36', { rough: 0.5 }) : mat('#8a6a4a', { rough: 0.55, metal: 0.3 }));
      const lattice = new THREE.MeshBasicMaterial({ color: tokyo ? '#b8321c' : '#5a4430', wireframe: true });
      // four splayed legs
      for (const [lx, lz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const leg = box(0.22, 2.3, 0.22, solid(0));
        leg.position.set(lx * 0.75, 1.3, lz * 0.75);
        leg.rotation.set(-lz * 0.32, 0, lx * 0.32); // feet out, tops leaning in
        g.add(leg);
      }
      g.add(at(box(1.7, 0.14, 1.7, solid(1)), 0, 1.55, 0));
      const segs = [[0.72, 0.5, 1.4], [0.5, 0.3, 1.3], [0.3, 0.14, 1.2], [0.14, 0.05, 1.0]];
      let y = 1.6;
      segs.forEach(([rb, rt, h], k) => {
        const s = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 4, 3), solid(k));
        s.rotation.y = Math.PI / 4;
        s.position.y = y + h / 2;
        s.castShadow = true;
        g.add(s);
        const w = new THREE.Mesh(new THREE.CylinderGeometry(rt * 1.08, rb * 1.08, h, 4, 5, true), lattice);
        w.rotation.y = Math.PI / 4;
        w.position.y = y + h / 2;
        g.add(w);
        if (k === 0 || (tokyo && k === 1)) g.add(at(box(rt * 2.8, 0.16, rt * 2.8, mat(tokyo ? '#ffffff' : '#7a5c3e')), 0, y + h, 0));
        y += h;
      });
      g.add(at(cyl(0.02, 0.03, 0.8, mat('#c9ccd4', { metal: 0.8 }), { seg: 6 }), 0, y + 0.4, 0));
      g.add(at(sphere(0.06, beacon), 0, y + 0.82, 0));
    } else if (kind === 'azrieli') {
      // Tel Aviv: the three Azrieli towers — round, triangular, square
      const glass = facadeMat('#cfd9e4', 'glass', '#5b7a9c');
      const roof = mat('#e9eef4', { metal: 0.4, rough: 0.35 });
      const round = cyl(0.42, 0.42, 5.2, glass, { seg: 28 });
      g.add(at(round, 0.55, 0.3 + 2.6, 0.35));
      g.add(at(cyl(0.44, 0.44, 0.12, roof, { seg: 28 }), 0.55, 5.56, 0.35));
      g.add(at(cyl(0.02, 0.03, 0.9, mat('#c9ccd4', { metal: 0.8 }), { seg: 6 }), 0.55, 6.05, 0.35));
      g.add(at(sphere(0.06, beacon), 0.55, 6.52, 0.35));
      const tri = cyl(0.62, 0.62, 4.8, glass, { seg: 3 });
      g.add(at(tri, -0.55, 0.3 + 2.4, 0.3, Math.PI / 6));
      g.add(at(cyl(0.64, 0.64, 0.12, roof, { seg: 3 }), -0.55, 5.16, 0.3, Math.PI / 6));
      g.add(at(facadeBox(0.8, 4.3, 0.8, glass, { floors: 14, cell: 0.3 }), 0, 0.3 + 2.15, -0.6));
      g.add(at(box(0.84, 0.12, 0.84, roof), 0, 4.66, -0.6));
      g.add(at(box(1.9, 0.5, 1.7, facadeMat('#d8d2c4', 'wide', '#4a5a78')), 0, 0.55, 0.02));
    } else if (kind === 'davidtower') {
      // Jerusalem: stone city wall with a gate, a crenellated tower and the Tower of David
      const stone = facadeMat('#e6d3a8', 'arch', '#6b5a3e');
      const plain = mat('#e2cf9f', { rough: 0.9 });
      const dark = mat('#4a3b28');
      const crenels = (w, d, y, cx = 0, cz = 0) => {
        for (let k = -w / 2 + 0.1; k <= w / 2 - 0.05; k += 0.22) {
          g.add(at(box(0.12, 0.16, 0.12, plain), cx + k, y, cz + d / 2 - 0.06));
          g.add(at(box(0.12, 0.16, 0.12, plain), cx + k, y, cz - d / 2 + 0.06));
        }
      };
      g.add(at(facadeBox(2.8, 1.3, 0.55, stone, { floors: 3, cell: 0.4 }), 0, 0.3 + 0.65, 0.5));
      crenels(2.8, 0.55, 1.68, 0, 0.5);
      g.add(at(box(0.5, 0.8, 0.1, dark), 0, 0.7, 0.8));            // the gate
      g.add(at(cyl(0.25, 0.25, 0.1, dark, { seg: 16 }), 0, 1.1, 0.8, 0, Math.PI / 2));
      g.add(at(facadeBox(1.0, 2.6, 1.0, stone, { floors: 7, cell: 0.36 }), -0.8, 0.3 + 1.3, -0.35));
      crenels(1.0, 1.0, 2.98, -0.8, -0.35);
      // the slender tower with its balcony and cap
      g.add(at(cyl(0.26, 0.3, 3.9, plain, { seg: 12 }), 0.75, 0.3 + 1.95, -0.4));
      g.add(at(cyl(0.4, 0.4, 0.1, plain, { seg: 12 }), 0.75, 3.2, -0.4));
      g.add(at(cyl(0.2, 0.22, 0.9, plain, { seg: 12 }), 0.75, 4.65, -0.4));
      g.add(at(cone(0.24, 0.55, mat('#8a9aa6', { metal: 0.4 }), { seg: 12 }), 0.75, 5.37, -0.4));
      g.add(at(sphere(0.05, beacon), 0.75, 5.72, -0.4));
    } else if (kind === 'bahai') {
      // Haifa: the Baha'i terraces climbing to the golden-domed shrine
      const lawn = mat('#5fae5a', { rough: 0.9 });
      const edge = mat('#f4efe2');
      for (let k = 0; k < 5; k++) {
        const w = 2.6 - k * 0.38, h = 0.34;
        g.add(at(box(w, h, w, lawn), 0, 0.3 + h / 2 + k * h, 0));
        g.add(at(box(w + 0.04, 0.05, w + 0.04, edge), 0, 0.3 + (k + 1) * h, 0));
      }
      const base = 0.3 + 5 * 0.34;
      g.add(at(facadeBox(0.95, 0.75, 0.95, facadeMat('#f6f1e4', 'arch', '#8a7a5a'), { floors: 2, cell: 0.3 }), 0, base + 0.375, 0));
      g.add(at(box(1.05, 0.08, 1.05, edge), 0, base + 0.79, 0));
      g.add(at(cyl(0.36, 0.36, 0.5, facadeMat('#f6f1e4', 'arch', '#6f8a6a'), { seg: 8 }), 0, base + 1.08, 0));
      const gold = mat('#ffc83d', { metal: 0.85, rough: 0.25 });
      g.add(at(sphere(0.4, gold, { thetaLen: Math.PI / 2 }), 0, base + 1.3, 0));
      g.add(at(cyl(0.02, 0.03, 0.35, gold, { seg: 6 }), 0, base + 1.85, 0));
    } else if (kind === 'israelflag') {
      // Israel: a tall flagpole flying the flag
      const flagTex = canvasTex(384, 276, (ctx, W, H) => {
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#0038b8';
        ctx.fillRect(0, H * 0.1, W, H * 0.15);
        ctx.fillRect(0, H * 0.75, W, H * 0.15);
        const cx = W / 2, cy = H / 2, r = H * 0.2;
        ctx.strokeStyle = '#0038b8'; ctx.lineWidth = H * 0.035; ctx.lineJoin = 'miter';
        for (const rot of [-Math.PI / 2, Math.PI / 2]) {
          ctx.beginPath();
          for (let k = 0; k < 3; k++) {
            const a = rot + (k * Math.PI * 2) / 3;
            const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
            k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
          }
          ctx.closePath(); ctx.stroke();
        }
      });
      const flagM = new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.8 });
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.5, 12, 1), flagM);
      // a gentle frozen ripple
      const pos = flag.geometry.attributes.position;
      for (let v = 0; v < pos.count; v++) pos.setZ(v, Math.sin((pos.getX(v) + 1.05) * 3) * 0.08 * (pos.getX(v) + 1.05));
      flag.geometry.computeVertexNormals();
      flag.position.set(1.08, 5.4, 0);
      g.add(flag);
      g.add(at(cyl(0.06, 0.08, 6.3, mat('#d7dbe2', { metal: 0.7, rough: 0.3 }), { seg: 10 }), 0, 0.3 + 3.15, 0));
      g.add(at(sphere(0.12, mat('#ffc83d', { metal: 0.85, rough: 0.25 })), 0, 6.5, 0));
      g.add(at(cyl(0.7, 0.8, 0.35, mat('#e8dcc4'), { seg: 16 }), 0, 0.47, 0));
    } else if (kind === 'observatory') {
      // Eilat: the underwater observatory tower standing in the Red Sea
      const sea = mat('#2fb3d6', { transparent: true, opacity: 0.8, rough: 0.2 });
      g.add(at(cyl(1.45, 1.45, 0.08, sea, { seg: 32 }), 0, 0.34, 0));
      g.add(at(box(0.3, 0.1, 1.4, mat('#c9a77a')), 0, 0.42, 0.75));   // the pier
      const white = mat('#f4f6f8', { rough: 0.5 });
      g.add(at(cyl(0.22, 0.3, 3.2, white, { seg: 16 }), 0, 0.3 + 1.6, 0));
      g.add(at(cyl(0.62, 0.45, 0.55, facadeMat('#eef3f7', 'glass', '#2f6f9a'), { seg: 16 }), 0, 3.75, 0));
      g.add(at(cyl(0.68, 0.68, 0.08, mat('#ff7a3c')), 0, 4.06, 0));
      g.add(at(cone(0.35, 0.5, white, { seg: 16 }), 0, 4.35, 0));
      g.add(at(sphere(0.06, beacon), 0, 4.66, 0));
      g.add(at(torus(0.45, 0.05, mat('#ff7a3c'), { rs: 8, ts: 24 }), 0, 1.4, 0, 0, Math.PI / 2));
      for (const [px, pz, s] of [[1.05, -0.95, 0.75], [-1.1, -0.8, 0.6]]) {
        const palm = makePalm(s);
        palm.position.set(px, 0.3, pz);
        g.add(palm);
      }
    }
    g.position.set(x, 0, z);
    g.rotation.y = Math.PI / 4;
    this.root.add(g);
    return bakeChildren(g);
  }

  dipTile(i, amount = 0.08) { this.tiles[i].dip = amount; }

  update(dt, t) {
    for (const fn of this.animated) fn(dt, t);
    for (const tile of this.tiles) {
      if (tile.dip > 0.0005) {
        tile.group.position.y = -tile.dip;
        tile.dip *= Math.exp(-dt * 9);
      } else if (tile.group.position.y !== 0) tile.group.position.y = 0;
    }
    const pulse = 0.55 + Math.sin(t * 5) * 0.3;
    for (const m of this.highlights.values()) if (m.visible) m.material.opacity = pulse;
  }
}

/** Position an object at distance d along the square ring road (counter-clockwise). */
export function placeOnLoop(obj, d, r) {
  const side = 2 * r;
  const s = Math.floor(d / side) % 4;
  const u = (d % side) - r;
  let x, z, ry;
  switch (s) {
    case 0: x = u; z = r; ry = 0; break;
    case 1: x = r; z = -u; ry = Math.PI / 2; break;
    case 2: x = -u; z = -r; ry = Math.PI; break;
    default: x = -r; z = u; ry = -Math.PI / 2;
  }
  obj.position.set(x, 0.02, z);
  obj.rotation.y = ry;
}

export { tileLocal, DISTRICTS, HALF, FONT_UI };
