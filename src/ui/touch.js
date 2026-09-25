// Touch controls. Everything here presses the same key codes the keyboard
// does (through input.pressVirtual), so minigames, the heist and auctions work
// on a phone without knowing a finger was involved.
import { input } from "../core/input.js";

export const IS_TOUCH = !!(window.matchMedia?.('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && window.matchMedia?.('(hover: none)').matches));
if (IS_TOUCH) document.documentElement.classList.add('touch');

const make = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

/** Holding the element holds `code` down (multi-touch safe). Returns a release fn. */
export function holdToPress(el, code) {
  let active = null;
  const up = () => {
    if (active == null) return;
    active = null;
    input.releaseVirtual(code);
    el.classList.remove('held');
  };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    active = e.pointerId;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    input.pressVirtual(code);
    el.classList.add('held');
    navigator.vibrate?.(8);
  });
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  return up;
}

/** A thumb stick that holds the arrow-style keys of a control scheme. */
function joystick(c) {
  const el = make('<div class="tp-stick"><i></i></div>');
  const knob = el.querySelector('i');
  const held = new Set();
  const set = (codes) => {
    for (const k of held) if (!codes.includes(k)) { input.releaseVirtual(k); held.delete(k); }
    for (const k of codes) if (!held.has(k)) { input.pressVirtual(k); held.add(k); }
  };
  let id = null, cx = 0, cy = 0;
  const move = (e) => {
    if (e.pointerId !== id) return;
    const r = el.offsetWidth / 2;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > r) { dx *= r / d; dy *= r / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const t = r * 0.3, codes = [];
    if (dx < -t) codes.push(c.left[0]);
    if (dx > t) codes.push(c.right[0]);
    if (dy < -t) codes.push(c.up[0]);
    if (dy > t) codes.push(c.down[0]);
    set(codes);
  };
  const end = (e) => {
    if (e && e.pointerId !== id) return;
    id = null;
    knob.style.transform = '';
    set([]);
  };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    id = e.pointerId;
    const b = el.getBoundingClientRect();
    cx = b.left + b.width / 2; cy = b.top + b.height / 2;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    move(e);
  });
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);
  return { el, release: () => end() };
}

/**
 * On-screen duel controls.
 * pads: [{ side: 0|1, c: controlScheme, color }] — only local human sides.
 */
export function openDuelPads({ pads, move = false, label = 'פעולה' }) {
  closeDuelPads();
  if (!IS_TOUCH || !pads.length) return;
  const host = make('<div id="touchpads"></div>');
  const releases = [];
  const two = pads.length > 1;
  for (const p of pads) {
    const pad = make(`<div class="tp-pad ${two ? (p.side === 0 ? 'left' : 'right') : 'solo'}" style="--pc:${p.color}"></div>`);
    if (move) {
      const s = joystick(p.c);
      pad.appendChild(s.el);
      releases.push(s.release);
    }
    const btn = make(`<button class="tp-action">${label}</button>`);
    releases.push(holdToPress(btn, p.c.action[0]));
    pad.appendChild(btn);
    host.appendChild(pad);
  }
  host.release = () => releases.forEach((r) => r());
  document.getElementById('ui').appendChild(host);
}

export function closeDuelPads() {
  const el = document.getElementById('touchpads');
  if (!el) return;
  el.release?.();
  el.remove();
}

/** A big "hold me" button (auction / heist). */
export function bigHoldButton(text, code = 'Space', cls = '') {
  const b = make(`<button class="tp-hold ${cls}">${text}</button>`);
  const release = holdToPress(b, code);
  b.release = release;
  return b;
}
