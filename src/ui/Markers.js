// Screen-space overlays anchored to world positions: floating damage numbers and
// objective/event pins (with an arrow at the screen edge when off-screen).
import * as THREE from 'three';

const POOL = 40;

export class Markers {
  constructor(root, camera) {
    this.root = root;
    this.camera = camera;
    this.layer = document.createElement('div');
    this.layer.className = 'markers';
    root.appendChild(this.layer);
    this.numbers = [];
    for (let i = 0; i < POOL; i++) {
      const el = document.createElement('div');
      el.className = 'dmg';
      el.style.display = 'none';
      this.layer.appendChild(el);
      this.numbers.push({ el, pos: new THREE.Vector3(), t: 0, life: 0 });
    }
    this.next = 0;
    this.pins = new Map(); // id -> { el, pos, label, kind }
    this.acc = new Map(); // entity -> accumulated small damage (laser)
    this.v = new THREE.Vector3();
    this.brackets = []; // red target brackets around hostile drones
  }

  /**
   * Red corner brackets around each target in `list` ({ pos, size }), sized to how big
   * it looks on screen. Off-screen targets get none (their pin arrow covers that).
   */
  setBrackets(list) {
    let n = 0;
    for (const t of list) {
      const s = this.project(t.pos);
      if (s.behind || s.x < 0 || s.y < 0 || s.x > s.w || s.y > s.h) continue;
      let b = this.brackets[n];
      if (!b) {
        b = document.createElement('div');
        b.className = 'target-brackets';
        this.layer.appendChild(b);
        this.brackets.push(b);
      }
      const dist = Math.max(3, t.pos.distanceTo(this.camera.position));
      const px = Math.max(26, Math.min(120, (t.size * s.h * 0.9) / dist));
      b.style.display = 'block';
      b.style.setProperty('--size', px + 'px');
      b.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`;
      n++;
    }
    for (let i = n; i < this.brackets.length; i++) this.brackets[i].style.display = 'none';
  }

  damageNumber(pos, amount, color = '#ffffff') {
    if (amount < 0.5) return;
    const n = this.numbers[this.next];
    this.next = (this.next + 1) % POOL;
    n.pos.copy(pos);
    n.pos.x += (Math.random() - 0.5) * 0.6;
    n.pos.y += 0.3;
    n.t = 0;
    n.life = 0.9;
    n.el.textContent = Math.round(amount);
    n.el.style.transform = 'translate(-9999px, 0)';
    n.el.style.color = color;
    n.el.style.display = 'block';
    n.el.style.fontSize = amount >= 40 ? '18px' : amount >= 20 ? '14px' : '11px';
  }

  /** Continuous damage (laser) is summed and shown a few times per second. */
  accumulate(entity, amount, color) {
    const a = this.acc.get(entity) || { sum: 0, t: 0, color };
    a.sum += amount;
    this.acc.set(entity, a);
  }

  /** kind: 'objective' | 'event' | 'zone' | 'boss' */
  setPin(id, pos, label, kind = 'objective') {
    let p = this.pins.get(id);
    if (!p) {
      const el = document.createElement('div');
      el.className = `pin pin-${kind}`;
      el.innerHTML = '<div class="pin-icon"></div><div class="pin-label"></div><div class="pin-dist"></div>';
      this.layer.appendChild(el);
      p = { el, pos: new THREE.Vector3(), label: '', kind, labelEl: el.querySelector('.pin-label'), distEl: el.querySelector('.pin-dist') };
      this.pins.set(id, p);
    }
    p.pos.copy(pos);
    if (p.label !== label) {
      p.label = label;
      p.labelEl.textContent = label;
    }
    p.seen = true;
  }

  /** Call before a frame's setPin calls; pins not set again by endPins() are removed. */
  beginPins() {
    for (const p of this.pins.values()) p.seen = false;
  }

  endPins() {
    for (const [id, p] of this.pins) if (!p.seen) this.removePin(id);
  }

  removePin(id) {
    const p = this.pins.get(id);
    if (p) {
      p.el.remove();
      this.pins.delete(id);
    }
  }

  clearPins() {
    for (const id of [...this.pins.keys()]) this.removePin(id);
  }

  clear() {
    this.clearPins();
    this.setBrackets([]);
    for (const n of this.numbers) n.el.style.display = 'none';
    this.acc.clear();
  }

  project(pos) {
    const v = this.v.copy(pos).project(this.camera);
    const w = window.innerWidth, h = window.innerHeight;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, behind: v.z > 1, w, h };
  }

  update(dt, playerPos) {
    for (const [e, a] of this.acc) {
      a.t += dt;
      if (a.t > 0.25) {
        if (a.sum >= 1 && !e.removed) this.damageNumber(e.centerInto(this.v.clone()), a.sum, a.color);
        this.acc.delete(e);
      }
    }
    for (const n of this.numbers) {
      if (n.life <= 0) continue;
      n.t += dt;
      if (n.t >= n.life) {
        n.life = 0;
        n.el.style.display = 'none';
        continue;
      }
      n.pos.y += dt * 1.6;
      const s = this.project(n.pos);
      if (s.behind) {
        n.el.style.display = 'none';
        continue;
      }
      n.el.style.display = 'block';
      n.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`;
      n.el.style.opacity = String(1 - (n.t / n.life) ** 2);
    }
    for (const p of this.pins.values()) {
      const s = this.project(p.pos);
      const dist = playerPos ? Math.round(p.pos.distanceTo(playerPos)) : 0;
      p.distEl.textContent = dist + ' m';
      const m = 40;
      let x = s.x, y = s.y;
      let off = s.behind || x < m || y < m || x > s.w - m || y > s.h - m;
      if (s.behind) {
        x = s.w - x;
        y = s.h - m;
      }
      if (off) {
        // clamp to the screen edge, pointing towards the target
        const cx = s.w / 2, cy = s.h / 2;
        let dx = x - cx, dy = y - cy;
        const k = Math.min((cx - m) / Math.max(1, Math.abs(dx)), (cy - m) / Math.max(1, Math.abs(dy)));
        x = cx + dx * k;
        y = cy + dy * k;
        p.el.style.setProperty('--rot', `${Math.atan2(dy, dx) + Math.PI / 2}rad`);
      }
      p.el.classList.toggle('off', off);
      p.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    }
  }
}
