// QUICK DRAW — western reflex duel. Wait for "DRAW!", then fire first.
// Fire on a fake-out ("DRAWBRIDGE!") and you lose the round. Best of 3.
import * as THREE from "three";
import { Minigame } from "./minigame.js";
import { Arena } from "./arena.js";
import { every, wait, lerp } from "../core/tween.js";
import { mat, cyl, sphere, cone, torus, box, at, dynamic, stripeMat, signMesh } from "../render/kit.js";
import { rand, pick } from "../core/rng.js";
import { input } from "../core/input.js";

const FAKES = ['שלום!', 'שלוש!', 'שלג!', 'שלולית!', 'שלו…', 'של… שלוק!', 'שולחן!', 'שלב!'];

function cowboyHat() {
  const g = new THREE.Group();
  const m = mat('#8a5a34', { rough: 0.8 });
  const brim = cyl(0.34, 0.34, 0.03, m, { seg: 24 });
  brim.scale.z = 0.85;
  g.add(brim);
  g.add(at(cyl(0.17, 0.2, 0.2, m, { seg: 18 }), 0, 0.1, 0));
  g.add(at(cyl(0.205, 0.205, 0.04, mat('#3b2412'), { seg: 18 }), 0, 0.04, 0));
  g.rotation.z = 0.08;
  return g;
}

function cactus(s = 1) {
  const g = new THREE.Group();
  const m = mat('#4caf6a', { rough: 0.7 });
  g.add(at(cyl(0.22 * s, 0.25 * s, 1.8 * s, m, { seg: 10 }), 0, 0.9 * s, 0));
  g.add(at(sphere(0.22 * s, m), 0, 1.8 * s, 0));
  const arm = (side, h) => {
    const a = new THREE.Group();
    a.add(at(cyl(0.13 * s, 0.13 * s, 0.5 * s, m, { seg: 8 }), side * 0.4 * s, h, 0, 0, 0, Math.PI / 2));
    a.add(at(cyl(0.13 * s, 0.13 * s, 0.6 * s, m, { seg: 8 }), side * 0.62 * s, h + 0.3 * s, 0));
    a.add(at(sphere(0.13 * s, m), side * 0.62 * s, h + 0.6 * s, 0));
    return a;
  };
  g.add(arm(1, 0.9 * s), arm(-1, 1.2 * s));
  return g;
}

export class QuickDraw extends Minigame {
  static meta = {
    id: 'quickdraw', name: 'שליפה מהירה', icon: '🤠', countdown: false,
    howto: 'חכו ל<b>שלוף!</b> ואז לחצו ראשונים על מקש הפעולה. מי שיורה על הטעיה מפסיד בסיבוב. הטוב מ-3.',
  };

  async build() {
    const a = this.arena = new Arena(this.ctx.stage, { top: '#3a2a78', bottom: '#ff9a5a', ground: '#9b5a2f', ambience: 'motes' });
    const s = a.scene;
    const sand = mat('#e8b777', { rough: 0.95 });
    s.add(at(cyl(7.5, 7.2, 0.8, sand, { seg: 40 }), 0, -0.4, 0));
    s.add(at(cyl(7.2, 6.4, 1.4, mat('#c9844f', { rough: 0.9, flat: true }), { seg: 12 }), 0, -1.5, 0));
    s.add(at(cyl(6.4, 4.2, 2.6, mat('#a8653a', { rough: 0.9, flat: true }), { seg: 9 }), 0, -3.5, 0));
    // sun disc
    const sun = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshBasicMaterial({ color: '#ffcf6b', fog: false }));
    sun.position.set(0, 4, -60);
    s.add(sun);
    const sun2 = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshBasicMaterial({ color: '#ffb35c', transparent: true, opacity: 0.35, fog: false }));
    sun2.position.set(0, 4, -61);
    s.add(sun2);
    // distant mesas
    for (const [x, z, w, h] of [[-26, -40, 8, 6], [22, -46, 11, 9], [-8, -55, 6, 4], [36, -30, 6, 5]]) {
      s.add(at(cyl(w * 0.8, w, h, mat('#9a4f3a', { flat: true }), { seg: 7 }), x, h / 2 - 2, z));
    }
    [[-5.5, -2.5, 1], [5.2, -3, 0.8], [-4.2, 3.6, 0.6], [6, 2.2, 0.7]].forEach(([x, z, sc]) => s.add(at(cactus(sc), x, 0, z, rand(0, 6))));
    s.add(this.saloon());
    // tumbleweed
    const tw = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), new THREE.MeshStandardMaterial({ color: '#8a6232', wireframe: true }));
    tw.position.set(-9, 0.45, 2.5);
    s.add(tw);
    a.updaters.push((dt, t) => {
      tw.position.x += dt * 2.2;
      tw.position.y = 0.3 + Math.abs(Math.sin(t * 5)) * 0.35;
      tw.rotation.z -= dt * 5;
      if (tw.position.x > 9) tw.position.x = -9;
    });
    // duelists
    const [pa, pb] = this.players;
    this.pawns = [
      a.spawn(pa, new THREE.Vector3(-3.4, 0, 0), new THREE.Vector3(3, 0, 0)),
      a.spawn(pb, new THREE.Vector3(3.4, 0, 0), new THREE.Vector3(-3, 0, 0)),
    ];
    for (const p of this.pawns) {
      p.hat.visible = false;
      const h = cowboyHat();
      h.position.y = 0.8;
      p.body.add(h);
      p.lookAt(p === this.pawns[0] ? this.pawns[1].root.position : this.pawns[0].root.position);
    }
    a.snap(new THREE.Vector3(0, 9, 16), new THREE.Vector3(0, 0.5, 0));
  }

  saloon() {
    const g = new THREE.Group();
    const wood = stripeMat('#a8683c', '#96592f', 14);
    const dark = mat('#5a3419');
    const trim = mat('#e8c58a');
    g.add(at(box(6.4, 2.6, 1.6, wood), 0, 1.3, 0));
    g.add(at(box(3.4, 1.0, 0.3, wood), 0, 3.1, 0.65));
    g.add(at(box(6.6, 0.12, 0.3, trim), 0, 2.62, 0.82));
    const sign = signMesh('סלון', 3.0, 0.7, { bg: '#3b2412', fg: '#ffd166', border: '#e8c58a' });
    sign.position.set(0, 3.1, 0.82);
    g.add(sign);
    // porch roof on posts
    const roof = box(6.8, 0.1, 1.5, dark);
    roof.position.set(0, 2.2, 1.45); roof.rotation.x = 0.12;
    g.add(roof);
    for (const x of [-3.2, -1.1, 1.1, 3.2]) g.add(at(box(0.12, 2.2, 0.12, dark), x, 1.1, 2.1));
    g.add(at(box(6.8, 0.12, 1.5, mat('#7a4a28')), 0, 0.06, 1.45));
    // windows + swinging doors
    const glow = mat('#ffcf7a', { emissive: '#ff9a3c', ei: 0.9 });
    for (const x of [-2.2, 2.2]) {
      g.add(at(box(1.1, 0.8, 0.05, glow), x, 1.5, 0.81));
      g.add(at(box(1.25, 0.1, 0.1, trim), x, 1.05, 0.84));
    }
    g.add(at(box(1.3, 1.8, 0.05, mat('#2a1a10')), 0, 0.9, 0.81));
    for (const x of [-0.33, 0.33]) g.add(at(box(0.6, 0.8, 0.06, mat('#c9853e')), x, 1.0, 0.86));
    // barrels + trough
    const barrelM = mat('#8a5a34');
    [[-3.6, 1.6], [-3.1, 1.9], [3.5, 1.7]].forEach(([x, z]) => g.add(at(cyl(0.3, 0.34, 0.75, barrelM, { seg: 14 }), x, 0.38, z)));
    g.add(at(box(1.4, 0.4, 0.5, dark), 2.1, 0.2, 2.6));
    g.add(at(box(1.3, 0.05, 0.4, mat('#4fb3d9', { rough: 0.1 })), 2.1, 0.38, 2.6));
    g.position.set(0, 0, -6.2);
    return g;
  }

  async intro() {
    this.arena.look(new THREE.Vector3(0, 1.6, 9), new THREE.Vector3(0, 1.1, 0), 1.4);
    await wait(1.5, true);
  }

  async play() {
    const score = [0, 0];
    this.emit({ e: 'score', s: score });
    let no = 0;
    while (score[0] < 2 && score[1] < 2) {
      no++;
      const r = await this.round(no);
      if (r < 0) continue;
      score[r]++;
      this.emit({ e: 'score', s: [...score] });
      await wait(1.0, true);
    }
    this.emit({ e: 'clear' });
    return score[0] >= 2 ? 0 : 1;
  }

  /**
   * One round, run by the host. Remote players report their own reaction
   * time measured from when DRAW appeared on *their* screen, so network lag
   * never decides a quick draw.
   */
  async round(no) {
    this.emit({ e: 'steady', r: no });
    const drawAt = rand(2.0, 4.6);
    const fakes = [];
    const nFake = Math.random() < 0.75 ? 1 + (Math.random() < 0.4 ? 1 : 0) : 0;
    for (let k = 0; k < nFake; k++) fakes.push({ at: rand(0.9, drawAt - 0.6), word: pick(FAKES), shown: false });
    const react = [0, 1].map((s) => (this.isAI(s) ? lerp(0.6, 0.27, this.skill[s]) + rand(0, 0.12) : 0));
    const aiPress = [null, null];
    const fired = [null, null];
    const grace = [0, 1].some((s) => this.reports(s)) ? 0.45 : 0;
    let t = 0, phase = 'wait', drawTime = 0, hideAt = 0, early = null;
    await every((dt) => {
      t += dt;
      for (const f of fakes) {
        if (!f.shown && t >= f.at && phase === 'wait') {
          f.shown = true;
          this.emit({ e: 'fake', word: f.word });
          hideAt = t + 0.6;
          for (const s of [0, 1]) if (this.isAI(s) && Math.random() < 0.3 * (1 - this.skill[s])) aiPress[s] = t + react[s];
        }
      }
      if (hideAt && t >= hideAt && phase === 'wait') { this.emit({ e: 'hide' }); hideAt = 0; }
      if (phase === 'wait' && t >= drawAt) {
        phase = 'draw';
        drawTime = t;
        this.emit({ e: 'draw' });
        for (const s of [0, 1]) if (this.isAI(s) && aiPress[s] == null) aiPress[s] = t + react[s];
      }
      for (const s of [0, 1]) {
        const reps = this.reports(s);
        if (reps) {
          while (reps.length) {
            const r = reps.shift();
            if (r.round !== no) continue;
            if (r.phase === 'wait') { if (early == null) early = s; } else if (fired[s] == null) fired[s] = Math.max(0.05, r.react);
          }
          continue;
        }
        const p = this.pressed(s) || (aiPress[s] != null && t >= aiPress[s]);
        if (!p) continue;
        if (phase === 'wait') { if (early == null) early = s; } else if (fired[s] == null) fired[s] = t - drawTime;
      }
      if (early != null) return true;
      if (phase === 'draw') {
        const known = fired.filter((v) => v != null);
        if (known.length === 2) return true;
        if (known.length === 1 && t - drawTime >= known[0] + grace) return true;
        if (t - drawTime > 2.8) return true;
      }
      return false;
    }, true);

    let w = -1, ms = 0;
    if (early != null) w = 1 - early;
    else if (fired[0] != null || fired[1] != null) {
      w = fired[1] == null || (fired[0] != null && fired[0] <= fired[1]) ? 0 : 1;
      ms = Math.round(fired[w] * 1000);
    }
    if (w < 0) {
      this.emit({ e: 'slow' });
      await wait(1.4, true);
      return -1;
    }
    this.emit({ e: 'result', w, early, ms });
    await wait(early != null ? 2.25 : 1.95, true);
    return w;
  }

  onEvent(ev) {
    const a = this.arena;
    const ui = this.ui.duelHud;
    switch (ev.e) {
      case 'score': ui.score(0, String(ev.s[0])); ui.score(1, String(ev.s[1])); break;
      case 'clear': ui.big(''); break;
      case 'steady':
        this.roundNo = ev.r;
        this.drawSeenAt = null;
        this.reported = false;
        this.pawns.forEach((p) => { p.body.rotation.x = 0; p.armPose = false; p.setExpression('neutral'); p.arms.forEach((arm, i) => { arm.rotation.set(0, 0, (i ? 1 : -1) * 0.35); }); });
        a.look(new THREE.Vector3(0, 1.3, 7.2), new THREE.Vector3(0, 1.0, 0), 1.2);
        ui.big('רגע…', 'fake');
        break;
      case 'fake': ui.big(ev.word, 'fake'); this.audio.play('pop', { pitch: 0.7 }); break;
      case 'hide': ui.big('…', 'fake'); break;
      case 'draw':
        this.drawSeenAt = performance.now();
        ui.big('שלוף!', 'red');
        this.audio.play('beep', { pitch: 1.8 });
        a.shake(0.15);
        break;
      case 'slow': this.reported = true; ui.big('איטיים מדי!', 'fake', 'שניכם. עוד פעם!'); break;
      case 'result': this.reported = true; this.showResult(ev); break;
      default:
    }
  }

  async showResult({ w, early, ms }) {
    const a = this.arena;
    const ui = this.ui.duelHud;
    const W = this.pawns[w], L = this.pawns[1 - w];
    if (early != null) {
      ui.big('מוקדם מדי!', 'red', `${this.players[early].name} ירה לפני הזמן`);
      this.audio.play('error');
      L.shocked();
      await wait(0.3, true);
    }
    W.armPose = true;
    W.arms[1].rotation.set(-Math.PI / 2, 0, 0.1);
    const hand = new THREE.Vector3();
    W.body.localToWorld(hand.set(0.3, 0.8, 0.45));
    this.audio.play('gun');
    a.fx.sparks(hand, { count: 26, color: '#ffe38a', speed: 5, size: 0.3, life: 0.5 });
    a.shake(0.45);
    W.setExpression('grin');
    if (early == null) ui.big(`${this.players[w].name}!`, '', `${ms} אלפיות שנייה`);
    L.flop();
    a.look(new THREE.Vector3(L.root.position.x * 0.4, 2.2, 6), L.root.position.clone().setY(0.6), 2.5);
    await wait(1.5, true);
    await L.getUp();
    W.setExpression('happy');
    W.armPose = false;
  }

  // Remote duelist: report what *we* saw — pressed before or after DRAW, and how fast.
  netTick() {
    const side = this.net.localSide;
    if (side < 0 || this.reported || !this.roundNo) return;
    if (!input.anyPressed(this.net.localControls.action)) return;
    this.reported = true;
    const seen = this.drawSeenAt != null;
    this.net.report({ round: this.roundNo, phase: seen ? 'draw' : 'wait', react: seen ? (performance.now() - this.drawSeenAt) / 1000 : 0 });
    this.audio.play('click');
  }

  async outro(winner) {
    const W = this.pawns[winner], L = this.pawns[1 - winner];
    this.arena.look(new THREE.Vector3(W.root.position.x * 0.6, 2, 6), W.root.position.clone().setY(1), 2);
    L.sad();
    await W.celebrate();
  }
}
