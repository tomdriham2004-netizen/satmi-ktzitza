// HTML elements pinned to 3D positions (crisp text over the WebGL canvas).
import * as THREE from "three";

const v = new THREE.Vector3();

export class Labels {
  constructor(container) {
    this.container = container;
    this.items = new Set();
    this.camera = null;
  }

  setCamera(cam) { this.camera = cam; }

  /** Pin `el` to a world position (Vector3 or function returning one). */
  add(inner, pos, { offsetY = 0, life = 0, rise = 0, fadeIn = true, scaleWithDistance = false } = {}) {
    // A wrapper owns the positioning transform so the inner element is free to
    // run its own CSS animations (bobbing, swinging) without fighting us.
    const el = document.createElement('div');
    el.className = 'wl';
    el.appendChild(inner);
    this.container.appendChild(el);
    const item = { el, inner, pos, offsetY, life, rise, age: 0, scaleWithDistance };
    if (fadeIn) { el.style.opacity = '0'; }
    this.items.add(item);
    item.remove = () => { this.items.delete(item); el.remove(); };
    return item;
  }

  /** Floating text that rises and fades (money deltas, callouts). */
  float(html, pos, cls = 'float-text', { life = 1.6, rise = 70, offsetY = -20 } = {}) {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    return this.add(el, pos.clone ? pos.clone() : pos, { life, rise, offsetY });
  }

  update(dt) {
    const cam = this.camera;
    if (!cam) return;
    const w = window.innerWidth, h = window.innerHeight;
    for (const it of this.items) {
      it.age += dt;
      if (it.life && it.age > it.life) { it.remove(); continue; }
      const p = typeof it.pos === 'function' ? it.pos() : it.pos;
      if (!p) continue;
      v.copy(p).project(cam);
      if (v.z > 1) { it.el.style.visibility = 'hidden'; continue; }
      it.el.style.visibility = 'visible';
      const x = (v.x * 0.5 + 0.5) * w;
      let y = (-v.y * 0.5 + 0.5) * h + it.offsetY;
      let op = 1, sc = 1;
      if (it.life) {
        const t = it.age / it.life;
        y -= it.rise * (1 - Math.pow(1 - t, 3));
        op = t < 0.12 ? t / 0.12 : t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
        sc = t < 0.12 ? 0.5 + (t / 0.12) * 0.7 : t < 0.25 ? 1.2 - ((t - 0.12) / 0.13) * 0.2 : 1;
      } else if (it.age < 0.3) {
        op = it.age / 0.3;
        sc = 0.7 + op * 0.3;
      }
      if (it.scaleWithDistance) sc *= THREE.MathUtils.clamp(18 / cam.position.distanceTo(p), 0.55, 1.25);
      it.el.style.opacity = op;
      it.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) scale(${sc})`;
    }
  }

  clear() { for (const it of [...this.items]) it.remove(); }
}
