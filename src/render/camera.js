// Cinematic camera director. A spherical rig (target, yaw, pitch, distance,
// fov) that eases toward a goal shot every frame. Timed moves, following,
// shake, FOV punches and user orbit/zoom all layer on top.
import * as THREE from "three";
import { tween, Ease, damp, clamp } from "../core/tween.js";

const TAU = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class CameraDirector {
  constructor(camera, dom) {
    this.camera = camera;
    this.cur = { target: new THREE.Vector3(0, 0, 0), yaw: Math.PI / 4, pitch: 0.95, dist: 60, fov: 34 };
    this.goal = { target: new THREE.Vector3(0, 0, 0), yaw: Math.PI / 4, pitch: 0.95, dist: 60, fov: 34 };
    this.lambda = 3;
    this.followObj = null;
    this.followOffset = new THREE.Vector3(0, 0.5, 0);
    this.user = { yaw: 0, pitch: 0, zoom: 1 };
    this.userEnabled = true;
    this.shakeAmt = 0;
    this.shakeDecay = 4;
    this.fovKick = 0;
    this.moving = null;
    this.drift = 0;
    this.bindInput(dom);
  }

  bindInput(dom) {
    let down = false, lx = 0, ly = 0, moved = 0;
    // touch: track fingers so two of them pinch-zoom instead of orbiting
    const fingers = new Map();
    let pinch0 = 0, zoom0 = 1;
    const spread = () => { const [a, b] = [...fingers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    dom.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      if (e.pointerType === 'touch') {
        fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (fingers.size === 2) { pinch0 = spread(); zoom0 = this.user.zoom; down = false; this.dragging = true; return; }
      }
      down = true; lx = e.clientX; ly = e.clientY; moved = 0; this.dragging = false;
    });
    const lift = (e) => { fingers.delete(e.pointerId); if (fingers.size < 2) pinch0 = 0; down = false; };
    window.addEventListener('pointerup', lift);
    window.addEventListener('pointercancel', lift);
    window.addEventListener('pointermove', (e) => {
      if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch0 && fingers.size >= 2) {
        if (this.userEnabled) this.user.zoom = clamp(zoom0 * (pinch0 / Math.max(20, spread())), 0.45, 1.9);
        return;
      }
      if (!down || !this.userEnabled) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved < 4) return;
      this.user.yaw -= dx * 0.005;
      this.user.pitch = clamp(this.user.pitch + dy * 0.004, -0.5, 0.5);
      this.dragging = true;
    });
    dom.addEventListener('wheel', (e) => {
      if (!this.userEnabled) return;
      this.user.zoom = clamp(this.user.zoom * (1 + Math.sign(e.deltaY) * 0.1), 0.45, 1.9);
    }, { passive: true });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Relax any user orbit back to the director's framing. */
  resetUser(speed = 1) {
    const u = this.user;
    const from = { ...u };
    return tween({ duration: 0.8 / speed, ease: Ease.inOutCubic, onUpdate: (t, e) => { u.yaw = from.yaw * (1 - e); u.pitch = from.pitch * (1 - e); u.zoom = from.zoom + (1 - from.zoom) * e; } });
  }

  /** Ease toward a shot using exponential damping (interruptible). */
  shot({ target, yaw, pitch, dist, fov }, lambda = 3) {
    this.moving?.cancel?.();
    this.moving = null;
    if (target) this.goal.target.copy(target);
    if (yaw !== undefined) this.goal.yaw = this.cur.yaw + wrap(yaw - this.cur.yaw);
    if (pitch !== undefined) this.goal.pitch = pitch;
    if (dist !== undefined) this.goal.dist = dist;
    if (fov !== undefined) this.goal.fov = fov;
    this.lambda = lambda;
  }

  /** Timed cinematic move with an easing curve. */
  move({ target, yaw, pitch, dist, fov }, duration = 1.2, ease = Ease.inOutCubic) {
    this.moving?.cancel?.();
    const from = { target: this.cur.target.clone(), yaw: this.cur.yaw, pitch: this.cur.pitch, dist: this.cur.dist, fov: this.cur.fov };
    const to = {
      target: target ? target.clone() : from.target.clone(),
      yaw: yaw !== undefined ? from.yaw + wrap(yaw - from.yaw) : from.yaw,
      pitch: pitch ?? from.pitch, dist: dist ?? from.dist, fov: fov ?? from.fov,
    };
    Object.assign(this.goal, { yaw: to.yaw, pitch: to.pitch, dist: to.dist, fov: to.fov });
    this.goal.target.copy(to.target);
    const tw = tween({
      duration, ease,
      onUpdate: (t, e) => {
        this.cur.target.lerpVectors(from.target, to.target, e);
        this.cur.yaw = from.yaw + (to.yaw - from.yaw) * e;
        this.cur.pitch = from.pitch + (to.pitch - from.pitch) * e;
        this.cur.dist = from.dist + (to.dist - from.dist) * e;
        this.cur.fov = from.fov + (to.fov - from.fov) * e;
      },
    });
    this.moving = tw;
    tw.then(() => { if (this.moving === tw) this.moving = null; });
    return tw;
  }

  follow(obj, offset) {
    this.followObj = obj;
    if (offset) this.followOffset.copy(offset);
  }
  unfollow() { this.followObj = null; }

  shake(amount = 0.3, decay = 4) { this.shakeAmt = Math.max(this.shakeAmt, amount); this.shakeDecay = decay; }
  punch(fov = -4) { this.fovKick += fov; }

  update(dt, realDt) {
    if (this.followObj) {
      this.goal.target.copy(this.followObj.position).add(this.followOffset);
    }
    if (!this.moving) {
      const k = this.lambda;
      this.cur.target.x = damp(this.cur.target.x, this.goal.target.x, k, realDt);
      this.cur.target.y = damp(this.cur.target.y, this.goal.target.y, k, realDt);
      this.cur.target.z = damp(this.cur.target.z, this.goal.target.z, k, realDt);
      this.cur.yaw = damp(this.cur.yaw, this.goal.yaw, k * 0.8, realDt);
      this.cur.pitch = damp(this.cur.pitch, this.goal.pitch, k * 0.8, realDt);
      this.cur.dist = damp(this.cur.dist, this.goal.dist, k * 0.8, realDt);
      this.cur.fov = damp(this.cur.fov, this.goal.fov, k, realDt);
    } else if (this.followObj) {
      // while a timed move runs we still track a moving target
      this.cur.target.lerp(this.goal.target, 1 - Math.exp(-6 * realDt));
    }
    this.fovKick = damp(this.fovKick, 0, 5, realDt);
    this.drift += realDt;
    const yaw = this.cur.yaw + this.user.yaw + Math.sin(this.drift * 0.13) * 0.012;
    const pitch = clamp(this.cur.pitch + this.user.pitch + Math.sin(this.drift * 0.21) * 0.006, 0.08, 1.45);
    const fit = Math.min(1.8, Math.max(1, 1.45 / this.camera.aspect));
    const dist = this.cur.dist * this.user.zoom * fit;
    const t = this.cur.target;
    const cp = Math.cos(pitch);
    this.camera.position.set(t.x + Math.sin(yaw) * cp * dist, t.y + Math.sin(pitch) * dist, t.z + Math.cos(yaw) * cp * dist);
    this.camera.lookAt(t);
    if (this.shakeAmt > 0.001) {
      const s = this.shakeAmt;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
      this.camera.rotation.z += (Math.random() - 0.5) * s * 0.05;
      this.shakeAmt *= Math.exp(-this.shakeDecay * realDt);
    }
    let f = this.cur.fov + this.fovKick;
    // Portrait phones: widen the view so every shot keeps its sideways framing.
    const a = this.camera.aspect;
    if (a < 1.3) {
      const s = Math.min(2.1, Math.pow(1.3 / a, 0.85));
      f = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(f) / 2) * s));
    }
    if (Math.abs(this.camera.fov - f) > 0.01) { this.camera.fov = f; this.camera.updateProjectionMatrix(); }
  }
}

export { TAU };
