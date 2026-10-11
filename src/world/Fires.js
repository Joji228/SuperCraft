// Fires: particle flames + smoke, a few shared point lights, damage nearby,
// slow spreading, and extinguishing by super breath.
import * as THREE from 'three';

const MAX_FIRES = 80;
const LIGHTS = 3;

let nextId = 1;

export class Fires {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.lights = [];
    for (let i = 0; i < LIGHTS; i++) {
      const l = new THREE.PointLight(0xff7a2a, 0, 14, 2);
      game.scene.add(l);
      this.lights.push(l);
    }
    this.tmp = new THREE.Vector3();
  }

  /**
   * opts: { intensity 0..1, size, spread (can spread), tag, persistent, damage }
   */
  ignite(pos, opts = {}) {
    if (this.list.length >= MAX_FIRES) return null;
    // merge with a fire that's already right here
    for (const f of this.list) {
      if (f.pos.distanceToSquared(pos) < 1.2) {
        f.intensity = Math.min(1, f.intensity + 0.3);
        return f;
      }
    }
    const f = {
      id: nextId++,
      pos: pos.clone(),
      intensity: opts.intensity ?? 1,
      size: opts.size ?? 1,
      spread: !!opts.spread,
      spreadTimer: 6 + Math.random() * 6,
      tag: opts.tag || null,
      emitAcc: 0,
      age: 0,
      burnout: opts.burnout ?? (opts.persistent ? Infinity : 40 + Math.random() * 30),
    };
    this.list.push(f);
    return f;
  }

  clear() {
    this.list.length = 0;
    for (const l of this.lights) l.intensity = 0;
  }

  count(tag) {
    let n = 0;
    for (const f of this.list) if (!tag || f.tag === tag) n++;
    return n;
  }

  extinguishCone(origin, dir, range, cosHalf, dt) {
    const g = this.game;
    for (const f of this.list) {
      const t = this.tmp.copy(f.pos).sub(origin);
      const d = t.length();
      if (d > range + f.size) continue;
      t.divideScalar(d || 1);
      if (t.dot(dir) < cosHalf - 0.08 * f.size) continue;
      f.intensity -= dt * 1.1 * (1 - (d / (range + 2)) * 0.5);
      if (Math.random() < 0.3) g.effects.steam(f.pos, 1);
    }
    this.cleanup();
  }

  /** Put out fires near a point (explosions of ice, water, etc.). */
  extinguishAt(pos, radius) {
    for (const f of this.list) if (f.pos.distanceTo(pos) < radius) f.intensity = 0;
    this.cleanup();
  }

  cleanup() {
    const g = this.game;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      if (f.intensity > 0) continue;
      this.list.splice(i, 1);
      if (!f.burnedOut) {
        g.effects.steam(f.pos, 10);
        g.audio.play('hiss', f.pos);
        g.events.emit('fireOut', f);
      }
    }
  }

  update(dt, camPos) {
    const g = this.game;
    const fx = g.effects;
    const spawn = [];
    for (const f of this.list) {
      f.age += dt;
      const dist = f.pos.distanceTo(camPos);
      // visuals: fewer particles for far fires
      if (dist < 220) {
        const rate = (dist < 60 ? 40 : 14) * f.intensity * f.size;
        f.emitAcc += rate * dt;
        while (f.emitAcc >= 1) {
          f.emitAcc -= 1;
          fx.flame(f.pos, f.intensity * f.size, 0.35 * f.size);
          if (Math.random() < 0.3) fx.smoke(this.tmp.copy(f.pos).setY(f.pos.y + 1), 1, 0.6 * f.size, 0.18);
        }
      }
      // grow back slowly if not being fought
      if (f.intensity < 1 && f.intensity > 0) f.intensity = Math.min(1, f.intensity + dt * 0.04);
      // natural burnout
      if (f.age > f.burnout) {
        f.intensity -= dt * 0.2;
        if (f.intensity <= 0) f.burnedOut = true;
      }
      // hurt things standing in it
      const r = 1.4 * f.size;
      for (const e of g.entities.query(f.pos, r + 0.5)) {
        if (e.fireproof) continue;
        e.damage(8 * f.intensity * dt, { type: 'fire' });
        e.onBurn?.(dt);
      }
      const p = g.player;
      if (Math.abs(p.pos.x - f.pos.x) < r && Math.abs(p.pos.z - f.pos.z) < r && p.pos.y - f.pos.y < 1.5 && p.pos.y + 2 > f.pos.y) {
        g.hurtPlayer(5 * f.intensity * dt, f.pos, 'fire');
      }
      g.addDanger(f.pos, 7, 0.5);
      // spread
      if (f.spread && f.intensity > 0.85) {
        f.spreadTimer -= dt;
        if (f.spreadTimer <= 0) {
          f.spreadTimer = 8 + Math.random() * 8;
          if (this.list.length + spawn.length < MAX_FIRES * 0.6) {
            const np = f.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.3) * 2, (Math.random() - 0.5) * 4));
            if (this.surfaceNear(np)) spawn.push([np, f]);
          }
        }
      }
    }
    for (const [np, f] of spawn) this.ignite(np, { intensity: 0.5, spread: true, tag: f.tag, size: f.size * 0.9 });
    this.cleanup();
    this.updateLights(camPos);
    if (this.list.length) {
      const near = this.nearest(camPos);
      g.audio.setLoopLevel('fire', near ? Math.max(0, 1 - near.d / 40) * near.f.intensity : 0);
    } else g.audio.setLoopLevel('fire', 0);
  }

  /** A fire needs something solid next to it to cling to. */
  surfaceNear(p) {
    const w = this.game.world;
    const x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z);
    if (w.isSolid(x, y, z)) return false;
    return w.isSolid(x, y - 1, z) || w.isSolid(x + 1, y, z) || w.isSolid(x - 1, y, z) || w.isSolid(x, y, z + 1) || w.isSolid(x, y, z - 1);
  }

  nearest(pos) {
    let best = null, bd = Infinity;
    for (const f of this.list) {
      const d = f.pos.distanceTo(pos);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best ? { f: best, d: bd } : null;
  }

  updateLights(camPos) {
    const sorted = this.list.length > LIGHTS ? [...this.list].sort((a, b) => a.pos.distanceToSquared(camPos) - b.pos.distanceToSquared(camPos)) : this.list;
    for (let i = 0; i < LIGHTS; i++) {
      const l = this.lights[i];
      const f = sorted[i];
      if (!f) {
        l.intensity = 0;
        continue;
      }
      l.position.set(f.pos.x, f.pos.y + 0.8, f.pos.z);
      l.intensity = (8 + Math.random() * 4) * f.intensity * f.size;
    }
  }
}
