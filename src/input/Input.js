// Keyboard + mouse with pointer lock, mapped to named actions.

const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  descend: ['ControlLeft', 'ControlRight', 'KeyC'],
  boost: ['ShiftLeft', 'ShiftRight'],
  fly: ['KeyF'],
  camera: ['KeyV'],
  debug: ['F3', 'Backquote'],
  pause: ['Escape', 'KeyP'],
  // reserved for Phase 2
  punch: ['Mouse0'],
  laser: ['Mouse2'],
  breath: ['KeyQ'],
  senses: ['KeyE'],
  carry: ['KeyG'],
  lock: ['Mouse1'], // middle mouse / wheel click
  summon: ['KeyT'],
};

const CODE_TO_ACTIONS = {};
for (const [action, codes] of Object.entries(BINDINGS)) {
  for (const c of codes) (CODE_TO_ACTIONS[c] ||= []).push(action);
}

const BLOCKED_DEFAULTS = new Set(['Space', 'F3', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backquote', 'KeyF', 'KeyC', 'KeyQ', 'KeyE', 'KeyG', 'KeyT']);

export class Input {
  constructor(element) {
    this.element = element;
    this.held = new Set();
    this.pressedNow = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
    this.enabled = false; // only gameplay reads input
    this.onLockChange = null;

    window.addEventListener('keydown', (e) => {
      if (this.enabled && (BLOCKED_DEFAULTS.has(e.code) || e.ctrlKey)) e.preventDefault();
      if (e.repeat) return;
      this.down(e.code);
    });
    window.addEventListener('keyup', (e) => this.up(e.code));
    window.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 1) e.preventDefault(); // no auto-scroll on wheel click
      this.down('Mouse' + e.button);
    });
    window.addEventListener('mouseup', (e) => this.up('Mouse' + e.button));
    window.addEventListener('contextmenu', (e) => {
      if (this.locked) e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // ignore occasional huge spikes some browsers report on lock
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('blur', () => this.held.clear());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.element;
      if (!this.locked) this.held.clear();
      this.onLockChange?.(this.locked);
    });
  }

  down(code) {
    if (!this.held.has(code)) this.pressedNow.add(code);
    this.held.add(code);
  }

  up(code) {
    this.held.delete(code);
  }

  lock() {
    try {
      const p = this.element.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch {
      // the browser refused (e.g. too soon after leaving lock); the user can click again
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(action) {
    for (const c of BINDINGS[action]) if (this.held.has(c)) return true;
    return false;
  }

  pressed(action) {
    for (const c of BINDINGS[action]) if (this.pressedNow.has(c)) return true;
    return false;
  }

  consumeMouse() {
    const d = [this.mouseDX, this.mouseDY];
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  /** Call once at the end of every frame. */
  endFrame() {
    this.pressedNow.clear();
  }
}
