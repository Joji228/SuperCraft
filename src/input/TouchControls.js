// On-screen controls for phones and tablets. Only created on touch-first devices, so
// the desktop game is untouched. They feed the same Input the keyboard and mouse do:
//   - a floating move stick (touch anywhere on the left side)
//   - drag anywhere else to look around
//   - action buttons on the right that follow the current hero's (or alien's) ability bar
//   - Jump / Down, plus small Car, Camera and Pause buttons
// Holding Deka's Aliens button and sliding the finger picks an alien on the wheel.

/** True on phones and tablets (touch is the main input, there's no mouse hover). */
export function isTouchDevice() {
  try {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches || (navigator.maxTouchPoints > 1 && !window.matchMedia('(pointer: fine)').matches);
  } catch {
    return false;
  }
}

// ability-bar slot -> the key or mouse button it stands for
const SLOT_CODE = { punch: 'Mouse0', laser: 'Mouse2', breath: 'KeyQ', senses: 'KeyE', carry: 'KeyG', fly: 'KeyF', boost: 'ShiftLeft' };
// (each slot's button has its place in the bottom-right grid: see .touch-<slot> in hud.css)

const STICK_R = 56; // pixels of thumb travel for a full push

export class TouchControls {
  constructor(game, input) {
    this.game = game;
    this.input = input;
    this.stick = null; // { id, x0, y0 }
    this.look = new Map(); // pointer id -> last x, y
    this.buttons = [];
    document.body.classList.add('touch');

    this.root = document.createElement('div');
    this.root.className = 'touch-ui';
    this.root.innerHTML = `
      <div class="touch-stick hidden"><div class="touch-knob"></div></div>
      <div class="touch-cluster"></div>
      <button class="touch-btn touch-jump" data-code="Space"><span>Jump</span></button>
      <button class="touch-btn touch-down" data-code="KeyC"><span>Down</span></button>
      <div class="touch-top">
        <button class="touch-mini" data-code="KeyR">Car</button>
        <button class="touch-mini" data-code="KeyV">Cam</button>
        <button class="touch-mini touch-pause">II</button>
      </div>
      <div class="touch-rotate"><div>Turn your phone sideways to play</div></div>`;
    document.body.appendChild(this.root);
    this.stickEl = this.root.querySelector('.touch-stick');
    this.knob = this.root.querySelector('.touch-knob');
    this.cluster = this.root.querySelector('.touch-cluster');
    for (const b of this.root.querySelectorAll('[data-code]')) this.wire(b, b.dataset.code);
    this.root.querySelector('.touch-pause').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (game.state === 'playing') game.pause();
    });

    // the rest of the screen: move stick on the left, look everywhere else
    const surface = game.renderer.domElement;
    const hud = document.getElementById('hud');
    for (const el of [surface, hud]) {
      el.addEventListener('pointerdown', (e) => this.onDown(e), { passive: false });
    }
    window.addEventListener('pointermove', (e) => this.onMove(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    // no page scrolling, pinch zoom or long-press menus while playing
    document.addEventListener('touchmove', (e) => {
      if (game.state === 'playing') e.preventDefault();
    }, { passive: false });
    document.addEventListener('contextmenu', (e) => {
      if (game.state === 'playing') e.preventDefault();
    });
  }

  /** Rebuild the action buttons from the hero's ability bar (called when the hero or alien changes). */
  setLayout(ab) {
    for (const b of this.buttons) b.remove();
    this.buttons = [];
    for (const [slot, v] of Object.entries(ab)) {
      if (!v || !SLOT_CODE[slot]) continue;
      const b = document.createElement('button');
      b.className = `touch-btn touch-${slot}`;
      b.innerHTML = `<span>${v[1]}</span>`;
      // Deka's Aliens button: hold it and slide the finger to pick an alien
      this.wire(b, SLOT_CODE[slot], slot === 'breath' && v[1] === 'Aliens');
      this.cluster.appendChild(b);
      this.buttons.push(b);
    }
  }

  /** Make a button hold its key while pressed. `steer` sends finger movement as mouse look. */
  wire(b, code, steer = false) {
    const ids = new Set();
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ids.add(e.pointerId);
      try {
        b.setPointerCapture?.(e.pointerId);
      } catch {
        // not capturable (synthetic pointer): the button still works
      }
      b.classList.add('on');
      this.input.down(code);
      if (steer) this.look.set(e.pointerId, { x: e.clientX, y: e.clientY, steer: true });
    });
    const up = (e) => {
      if (!ids.delete(e.pointerId)) return;
      this.look.delete(e.pointerId);
      if (ids.size) return;
      b.classList.remove('on');
      this.input.up(code);
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
  }

  onDown(e) {
    if (e.pointerType === 'mouse') return;
    const g = this.game;
    if (g.state !== 'playing') return;
    e.preventDefault();
    // left 40% of the screen: the move stick appears under the thumb
    if (!this.stick && e.clientX < window.innerWidth * 0.4) {
      this.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
      this.stickEl.style.left = `${e.clientX}px`;
      this.stickEl.style.top = `${e.clientY}px`;
      this.stickEl.classList.remove('hidden');
      this.knob.style.transform = 'translate(-50%, -50%)';
      return;
    }
    this.look.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  onMove(e) {
    if (this.stick && e.pointerId === this.stick.id) {
      e.preventDefault();
      let dx = e.clientX - this.stick.x0, dy = e.clientY - this.stick.y0;
      const d = Math.hypot(dx, dy);
      if (d > STICK_R) {
        dx *= STICK_R / d;
        dy *= STICK_R / d;
      }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.setMove(dx / STICK_R, dy / STICK_R);
      return;
    }
    const l = this.look.get(e.pointerId);
    if (!l) return;
    e.preventDefault();
    const k = l.steer ? 2.2 : 1.6; // fingers move less than a mouse
    this.input.mouseDX += (e.clientX - l.x) * k;
    this.input.mouseDY += (e.clientY - l.y) * k;
    l.x = e.clientX;
    l.y = e.clientY;
  }

  onUp(e) {
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick = null;
      this.stickEl.classList.add('hidden');
      this.setMove(0, 0);
      return;
    }
    if (!this.look.get(e.pointerId)?.steer) this.look.delete(e.pointerId);
  }

  /** Stick position (-1..1 each way) to WASD. */
  setMove(x, y) {
    const t = 0.35;
    const keys = { KeyW: y < -t, KeyS: y > t, KeyA: x < -t, KeyD: x > t };
    for (const [code, on] of Object.entries(keys)) {
      if (on) this.input.down(code);
      else this.input.up(code);
    }
  }

  /** Let go of everything (pausing, leaving the game). */
  release() {
    this.stick = null;
    this.look.clear();
    this.stickEl.classList.add('hidden');
    for (const b of this.root.querySelectorAll('.touch-btn.on, .touch-mini.on')) b.classList.remove('on');
  }
}
