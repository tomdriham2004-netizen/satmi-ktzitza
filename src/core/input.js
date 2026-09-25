// Keyboard state tracker with per-frame "pressed" edges. Minigames and the
// auction read from here; UI shortcuts subscribe through onKey.
class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.listeners = new Set();
    this.virtual = new Set(); // pointer-held virtual keys (touch / mouse buttons)
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const k = norm(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
      if (!this.down.has(k)) this.pressed.add(k);
      this.down.add(k);
      if (!e.repeat) this.listeners.forEach((fn) => fn(k, e));
    });
    window.addEventListener('keyup', (e) => {
      const k = norm(e.code);
      this.down.delete(k);
      this.released.add(k);
    });
    window.addEventListener('blur', () => { this.down.clear(); this.virtual.clear(); });
  }
  isDown(k) { return this.down.has(k) || this.virtual.has(k); }
  wasPressed(k) { return this.pressed.has(k); }
  anyDown(keys) { return keys.some((k) => this.isDown(k)); }
  anyPressed(keys) { return keys.some((k) => this.pressed.has(k)); }
  pressVirtual(k) { if (!this.virtual.has(k)) this.pressed.add(k); this.virtual.add(k); }
  releaseVirtual(k) { this.virtual.delete(k); this.released.add(k); }
  onKey(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  endFrame() { this.pressed.clear(); this.released.clear(); }
}

function norm(code) {
  if (code === 'NumpadEnter') return 'Enter';
  return code;
}

export const input = new Input();

// Control schemes for 1v1 duels (by side, not by player).
export const DUEL_KEYS = {
  left: {
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], action: ['KeyF'],
    label: { move: 'W A S D', action: 'F' },
  },
  right: {
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], action: ['Enter'],
    label: { move: '← ↑ ↓ →', action: 'ENTER' },
  },
  solo: {
    up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    action: ['Space', 'KeyF', 'Enter'], label: { move: 'WASD / ARROWS', action: 'SPACE' },
  },
};

// Per-seat buzzer keys (auctions). Keyboard corners — easy to share a keyboard.
export const SEAT_KEYS = [
  { code: 'KeyQ', label: 'Q' },
  { code: 'KeyP', label: 'P' },
  { code: 'KeyZ', label: 'Z' },
  { code: 'KeyM', label: 'M' },
];
