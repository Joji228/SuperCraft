// Particle recipes: sparks, explosions, smoke, debris, ice, steam, fire.
const rnd = (a, b) => a + Math.random() * (b - a);

function hexToRgb(hex) {
  return { r: ((hex >> 16) & 255) / 255, g: ((hex >> 8) & 255) / 255, b: (hex & 255) / 255 };
}

export class Effects {
  constructor(particles) {
    this.p = particles;
  }

  sparks(pos, n = 12, dir = null, color = 0xffd35a) {
    const c = hexToRgb(color);
    for (let i = 0; i < n; i++) {
      const s = rnd(4, 12);
      let vx = rnd(-1, 1), vy = rnd(-0.2, 1.2), vz = rnd(-1, 1);
      if (dir) {
        vx += dir.x * 1.2;
        vy += dir.y * 1.2;
        vz += dir.z * 1.2;
      }
      const l = Math.hypot(vx, vy, vz) || 1;
      this.p.emit({ x: pos.x, y: pos.y, z: pos.z, vx: (vx / l) * s, vy: (vy / l) * s, vz: (vz / l) * s, life: rnd(0.2, 0.5), size: rnd(0.08, 0.16), grow: 0.5, alpha: 1, ...c, gravity: 18, drag: 1 });
    }
  }

  /** Punch impact: white ring of dust plus a few sparks. */
  impact(pos, dir, strength = 1) {
    for (let i = 0; i < 10 * strength; i++) {
      this.p.emit({ x: pos.x, y: pos.y, z: pos.z, vx: rnd(-5, 5) * strength, vy: rnd(-2, 4) * strength, vz: rnd(-5, 5) * strength, life: rnd(0.25, 0.45), size: rnd(0.2, 0.35), grow: 2.5, alpha: 0.7, r: 1, g: 1, b: 1, drag: 5 });
    }
    this.sparks(pos, Math.round(6 * strength), dir);
  }

  debris(pos, color, n = 14, speed = 7) {
    const c = hexToRgb(color);
    for (let i = 0; i < n; i++) {
      this.p.emit({ x: pos.x + rnd(-0.3, 0.3), y: pos.y + rnd(-0.3, 0.3), z: pos.z + rnd(-0.3, 0.3), vx: rnd(-1, 1) * speed, vy: rnd(0.2, 1.4) * speed, vz: rnd(-1, 1) * speed, life: rnd(0.6, 1.2), size: rnd(0.15, 0.3), grow: 1, alpha: 1, ...c, gravity: 25, drag: 0.5 });
    }
  }

  smoke(pos, n = 1, size = 0.6, dark = 0.25) {
    for (let i = 0; i < n; i++) {
      const g = rnd(dark, dark + 0.15);
      this.p.emit({ x: pos.x + rnd(-0.3, 0.3), y: pos.y, z: pos.z + rnd(-0.3, 0.3), vx: rnd(-0.6, 0.6), vy: rnd(1.5, 3), vz: rnd(-0.6, 0.6), life: rnd(1.5, 2.6), size, grow: 3.5, alpha: 0.45, r: g, g, b: g + 0.02, drag: 0.4 });
    }
  }

  flame(pos, intensity = 1, spread = 0.5) {
    const t = Math.random();
    this.p.emit({
      x: pos.x + rnd(-spread, spread), y: pos.y + rnd(0, 0.3), z: pos.z + rnd(-spread, spread),
      vx: rnd(-0.4, 0.4), vy: rnd(2, 4.5) * (0.6 + intensity * 0.4), vz: rnd(-0.4, 0.4),
      life: rnd(0.4, 0.8), size: rnd(0.35, 0.6) * (0.6 + intensity * 0.6), grow: 0.3,
      alpha: 0.9, r: 1, g: 0.35 + t * 0.5, b: 0.05 + t * 0.1, drag: 1,
    });
  }

  explosion(pos, size = 1) {
    for (let i = 0; i < 40 * size; i++) {
      const t = Math.random();
      this.p.emit({ x: pos.x, y: pos.y, z: pos.z, vx: rnd(-1, 1) * 12 * size, vy: rnd(-0.3, 1.3) * 12 * size, vz: rnd(-1, 1) * 12 * size, life: rnd(0.35, 0.8), size: rnd(0.5, 1.0) * size, grow: 2.2, alpha: 1, r: 1, g: 0.45 + t * 0.45, b: 0.1, drag: 4 });
    }
    for (let i = 0; i < 18 * size; i++) {
      const g = rnd(0.15, 0.35);
      this.p.emit({ x: pos.x + rnd(-1, 1) * size, y: pos.y + rnd(0, 1) * size, z: pos.z + rnd(-1, 1) * size, vx: rnd(-3, 3), vy: rnd(1, 5), vz: rnd(-3, 3), life: rnd(1.6, 3), size: rnd(0.8, 1.4) * size, grow: 3, alpha: 0.6, r: g, g, b: g, drag: 0.8 });
    }
    this.sparks(pos, Math.round(20 * size), null, 0xffb040);
  }

  iceBurst(pos, n = 18) {
    for (let i = 0; i < n; i++) {
      this.p.emit({ x: pos.x, y: pos.y, z: pos.z, vx: rnd(-4, 4), vy: rnd(-1, 5), vz: rnd(-4, 4), life: rnd(0.5, 1), size: rnd(0.12, 0.28), grow: 0.6, alpha: 0.95, r: 0.75, g: 0.92, b: 1, gravity: 10, drag: 2 });
    }
  }

  iceShatter(pos, n = 14) {
    this.iceBurst(pos, n);
  }

  steam(pos, n = 6) {
    for (let i = 0; i < n; i++) {
      this.p.emit({ x: pos.x + rnd(-0.5, 0.5), y: pos.y, z: pos.z + rnd(-0.5, 0.5), vx: rnd(-0.5, 0.5), vy: rnd(2, 4), vz: rnd(-0.5, 0.5), life: rnd(1, 1.8), size: 0.5, grow: 3, alpha: 0.5, r: 0.92, g: 0.95, b: 0.98, drag: 0.6 });
    }
  }

  dust(pos, n = 12, radius = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rnd(3, 7) * radius;
      this.p.emit({ x: pos.x, y: pos.y + 0.1, z: pos.z, vx: Math.cos(a) * s, vy: rnd(0.3, 1.5), vz: Math.sin(a) * s, life: rnd(0.5, 1), size: 0.4, grow: 3, alpha: 0.45, r: 0.8, g: 0.76, b: 0.68, drag: 3 });
    }
  }

  /** Shockwave ring of dust on the ground (landings, stomps). */
  shockwave(pos, radius = 4) {
    this.dust(pos, Math.round(14 * radius), radius / 2);
  }

  confetti(pos, n = 30) {
    const colors = [0xffd34d, 0x1fc3b5, 0xff5a7a, 0x7dd3fc, 0xffffff];
    for (let i = 0; i < n; i++) {
      const c = hexToRgb(colors[i % colors.length]);
      this.p.emit({ x: pos.x, y: pos.y + 1.5, z: pos.z, vx: rnd(-3, 3), vy: rnd(4, 9), vz: rnd(-3, 3), life: rnd(1, 1.8), size: 0.12, grow: 1, alpha: 1, ...c, gravity: 9, drag: 1.5 });
    }
  }
}
