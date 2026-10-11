// Q (hold): freezing super breath. A cone that puts out fires, freezes enemies,
// pushes people/props/cars and freezes the water surface.
import * as THREE from 'three';
import { B } from '../world/Blocks.js';

const RANGE = 23;
const COS_HALF = Math.cos(0.58); // a wide cone
const ENERGY_PER_SEC = 20;

export class Breath {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.mouth = new THREE.Vector3();
    this.to = new THREE.Vector3();
    this.freezeAcc = 0;
  }

  stop() {
    if (this.active) this.game.audio.stopLoop('breath');
    this.active = false;
  }

  update(dt, holding, aim) {
    const g = this.game;
    if (!holding || !g.meters.drain(ENERGY_PER_SEC * dt)) {
      if (holding && g.meters.energy <= 0 && !this.warned) {
        g.hud.toast('Out of energy', 'warn');
        this.warned = true;
      }
      if (!holding) this.warned = false;
      this.stop();
      return;
    }
    if (!this.active) g.audio.startLoop('breath');
    this.active = true;
    const p = g.player;
    p.aimTimer = 0.3;
    const dir = aim.dir;
    // from the hero's mouth (the head moves a lot when flying)
    g.hero.head.getWorldPosition(this.mouth);
    this.mouth.y += p.flying ? 0.1 : 0.12;
    this.mouth.addScaledVector(dir, 0.5);

    // frosty particles streaming forward
    const parts = g.particles;
    for (let i = 0; i < 9; i++) {
      const s = 20 + Math.random() * 12;
      const sx = (Math.random() - 0.5) * 0.9, sy = (Math.random() - 0.5) * 0.9, sz = (Math.random() - 0.5) * 0.9;
      parts.emit({
        x: this.mouth.x, y: this.mouth.y, z: this.mouth.z,
        vx: (dir.x + sx) * s + p.vel.x, vy: (dir.y + sy) * s + p.vel.y, vz: (dir.z + sz) * s + p.vel.z,
        life: 0.55 + Math.random() * 0.3, size: 0.12, grow: 6, alpha: 0.55,
        r: 0.82, g: 0.94, b: 1, drag: 2.2,
      });
    }

    // entities in the cone
    const list = g.entities.query(this.mouth, RANGE + 12);
    for (const e of list) {
      if (e.carried) continue;
      const sp = e.sphere?.();
      if (sp) {
        // shields: breath reaches if it hits the bubble anywhere in the cone
        this.to.copy(sp.c).sub(this.mouth);
        const dc = this.to.length();
        const surf = Math.max(0, dc - sp.r);
        if (surf > RANGE) continue;
        const spread = dc > sp.r ? Math.asin(Math.min(1, sp.r / dc)) : Math.PI;
        if (dc > sp.r && this.to.divideScalar(dc).dot(dir) < Math.cos(Math.acos(COS_HALF) + spread)) continue;
        e.onBreath?.(dt, 1 - surf / RANGE);
        continue;
      }
      e.centerInto(this.to).sub(this.mouth);
      const d = this.to.length();
      if (d < 0.01 || d > RANGE) continue;
      this.to.divideScalar(d);
      if (this.to.dot(dir) < COS_HALF) continue;
      const fall = 1 - d / RANGE;
      if (e.canFreeze) e.chill(dt * 2.8 * (0.5 + fall));
      if (e.pushable && e.frozen <= 0) {
        const f = (e.team === 'civ' ? 6 : 38) * (0.3 + fall) * dt / Math.max(0.6, e.mass * 0.5);
        e.vel.addScaledVector(dir, f * 4);
        if (e.vel.y < 1 && fall > 0.6) e.vel.y += 6 * dt;
      }
      e.onBreath?.(dt, fall);
    }

    // fires
    g.fires.extinguishCone(this.mouth, dir, RANGE, COS_HALF, dt);

    // freeze water along the breath
    this.freezeAcc += dt;
    if (this.freezeAcc > 0.08) {
      this.freezeAcc = 0;
      const d = 3 + Math.random() * (RANGE - 3);
      const tx = this.mouth.x + dir.x * d + (Math.random() - 0.5) * 2;
      const ty = this.mouth.y + dir.y * d;
      const tz = this.mouth.z + dir.z * d + (Math.random() - 0.5) * 2;
      const x = Math.floor(tx), z = Math.floor(tz);
      for (let y = Math.floor(ty); y > ty - 4; y--) {
        const b = g.world.get(x, y, z);
        if (b === B.WATER && g.world.get(x, y + 1, z) === B.AIR) {
          g.world.edit(x, y, z, B.ICE);
          break;
        }
        if (b !== B.AIR) break;
      }
    }
  }
}
