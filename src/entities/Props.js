// Small breakable street props, training dummies, laser targets and the tutorial cat.
import * as THREE from 'three';
import { Entity } from './Entity.js';
import { Humanoid } from './Humanoid.js';
import { B } from '../world/Blocks.js';
import { CITY } from '../world/CityGenerator.js';
import { hash3 } from '../util/rng.js';

const TYPES = {
  trashcan: { w: 0.6, h: 0.9, color: 0x2f6b3a, top: 0x24502c, mass: 1.5, health: 25, label: 'Trash can' },
  hydrant: { w: 0.4, h: 0.75, color: 0xd8322a, top: 0xf0c020, mass: 2.5, health: 40, label: 'Fire hydrant' },
  mailbox: { w: 0.5, h: 1.1, color: 0x2557b8, top: 0x1b3f88, mass: 2, health: 35, label: 'Mailbox' },
  crate: { w: 0.9, h: 0.9, color: 0xb88a52, top: 0x8f6a3c, mass: 1.5, health: 25, label: 'Crate' },
  barrel: { w: 0.7, h: 1.0, color: 0xe8781e, top: 0x2b2b2b, mass: 2, health: 30, label: 'Barrel' },
  bench: { w: 1.6, h: 0.55, d: 0.6, color: 0x7b5232, top: 0x5b3b22, mass: 2.5, health: 35, label: 'Bench' },
};

export class Prop extends Entity {
  constructor(game, type, x, y, z) {
    const t = TYPES[type];
    super(game, { halfW: Math.min(t.w, t.d ?? t.w) / 2, height: t.h, health: t.health, kind: 'prop' });
    this.type = type;
    this.pos.set(x, y, z);
    this.mass = t.mass;
    this.carryable = true;
    this.throwable = true;
    this.carryLabel = t.label;
    this.friction = 6;
    const d = t.d ?? t.w;
    this.boxes = [
      { y: t.h * 0.45, w: t.w, h: t.h * 0.9, d, color: t.color },
      { y: t.h * 0.95, w: t.w * 0.9, h: t.h * 0.1, d: d * 0.9, color: t.top },
    ];
    if (type === 'barrel') this.explosive = true;
  }

  get canFreeze() {
    return false;
  }

  onDefeated() {
    const g = this.game;
    const c = this.centerInto(new THREE.Vector3());
    g.effects.debris(c, TYPES[this.type].color, 16, 6);
    g.audio.play('crunch', this.pos);
    if (this.type === 'hydrant') {
      // a burst hydrant sprays water and douses fires around it
      for (let i = 0; i < 40; i++)
        g.particles.emit({ x: c.x, y: c.y, z: c.z, vx: (Math.random() - 0.5) * 3, vy: 8 + Math.random() * 6, vz: (Math.random() - 0.5) * 3, life: 1.4, size: 0.2, grow: 2, alpha: 0.7, r: 0.7, g: 0.85, b: 1, gravity: 14 });
      g.fires.extinguishAt(c, 6);
    }
    if (this.explosive) g.explode(c, 4, 30, this);
    this.remove();
  }
}

/** Straw training dummy for the tutorial. */
export class Dummy extends Humanoid {
  constructor(game, x, y, z, yaw = 0) {
    super(game, { health: 60, team: 'enemy', kind: 'dummy', look: { skin: 0xd8b56a, hair: 0xb28d45, shirt: 0xc9a356, pants: 0x8f6d35, scale: 1 } });
    this.pos.set(x, y, z);
    this.yaw = yaw;
    this.pushable = false;
    this.carryable = false;
    this.sensesColor = '#ff4d4d';
    this.persistent = true;
  }

  get canFreeze() {
    return true;
  }

  update(dt) {
    this.age += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.frozen > 0) this.frozen = Math.max(0, this.frozen - dt);
    this.pose.armL = this.pose.armR = 0;
    this.pose.spreadL = this.pose.spreadR = 1.3; // T-pose
    this.pose.roll = Math.sin(this.age * 20) * this.hitFlash * 1.5;
  }

  onDefeated() {
    const c = this.centerInto(new THREE.Vector3());
    this.game.effects.debris(c, 0xd8b56a, 30, 7);
    this.game.audio.play('crunch', this.pos);
    this.remove();
  }
}

/** Bullseye board on a post: destroy with the laser (or fists). */
export class Target extends Entity {
  constructor(game, x, y, z, yaw = 0) {
    super(game, { halfW: 0.6, height: 2.6, health: 45, team: 'neutral', kind: 'target' });
    this.pos.set(x, y, z);
    this.yaw = yaw;
    this.pushable = false;
    this.persistent = true;
    this.sensesColor = '#4dff88';
    this.flying = true; // doesn't fall
    this.boxes = [
      { y: 0.8, w: 0.2, h: 1.6, d: 0.2, color: 0x6b4c30 },
      { y: 2.0, w: 1.4, h: 1.4, d: 0.15, color: 0xf2f2f2 },
      { y: 2.0, z: 0.03, w: 1.0, h: 1.0, d: 0.15, color: 0xe03a30 },
      { y: 2.0, z: 0.06, w: 0.6, h: 0.6, d: 0.15, color: 0xf2f2f2 },
      { y: 2.0, z: 0.09, w: 0.25, h: 0.25, d: 0.15, color: 0xe03a30 },
    ];
  }

  physics() {}

  onDefeated() {
    const c = this.centerInto(new THREE.Vector3());
    c.y += 0.6;
    this.game.effects.debris(c, 0xe03a30, 22, 6);
    this.game.effects.smoke(c, 6, 0.6, 0.3);
    this.game.audio.play('crunch', this.pos);
    this.remove();
  }
}

/** The tutorial's hidden cat. Only easy to spot with super senses. */
export class Cat extends Entity {
  constructor(game, x, y, z) {
    super(game, { halfW: 0.25, height: 0.5, health: 9999, team: 'neutral', kind: 'cat' });
    this.pos.set(x, y, z);
    this.carryable = true;
    this.carryLabel = 'Whiskers the cat';
    this.punchable = false;
    this.persistent = true;
    this.sensesColor = '#ff7ad9';
    this.boxes = [
      { y: 0.22, w: 0.32, h: 0.26, d: 0.6, color: 0xf08a24 },
      { y: 0.42, z: 0.32, w: 0.3, h: 0.28, d: 0.28, color: 0xf08a24 },
      { y: 0.6, z: 0.36, x: 0.09, w: 0.08, h: 0.1, d: 0.06, color: 0xf08a24 },
      { y: 0.6, z: 0.36, x: -0.09, w: 0.08, h: 0.1, d: 0.06, color: 0xf08a24 },
      { y: 0.38, z: -0.38, w: 0.08, h: 0.08, d: 0.3, color: 0xffffff, rx: -0.6 },
      { y: 0.06, z: 0.2, x: 0.1, w: 0.08, h: 0.14, d: 0.08, color: 0xffffff },
      { y: 0.06, z: 0.2, x: -0.1, w: 0.08, h: 0.14, d: 0.08, color: 0xffffff },
      { y: 0.06, z: -0.2, x: 0.1, w: 0.08, h: 0.14, d: 0.08, color: 0xf08a24 },
      { y: 0.06, z: -0.2, x: -0.1, w: 0.08, h: 0.14, d: 0.08, color: 0xf08a24 },
    ];
  }

  update(dt) {
    super.update(dt);
    if (!this.carried && Math.random() < dt * 0.3) this.game.audio.play('meow', this.pos);
  }
}

/**
 * Scatter props along sidewalks around a point, deterministically per sidewalk cell,
 * so the same corners always have the same hydrants and trash cans.
 */
export function scatterProps(game, cx, cz, radius, existing) {
  const w = game.world;
  const out = [];
  const step = 6;
  const x0 = Math.floor((cx - radius) / step) * step, x1 = cx + radius;
  const z0 = Math.floor((cz - radius) / step) * step, z1 = cz + radius;
  const types = ['trashcan', 'hydrant', 'mailbox', 'bench', 'crate', 'barrel', 'trashcan', 'hydrant'];
  for (let z = z0; z < z1; z += step) {
    for (let x = x0; x < x1; x += step) {
      const key = x * 10000 + z;
      if (existing.has(key)) continue;
      const h = hash3(x, 7, z, 42);
      if (h > 0.22) continue;
      // find a sidewalk cell inside this step cell
      const px = x + Math.floor(hash3(x, 1, z) * step);
      const pz = z + Math.floor(hash3(x, 2, z) * step);
      if (w.get(px, CITY.G - 1, pz) !== B.SIDEWALK || w.get(px, CITY.G, pz) !== B.AIR) continue;
      existing.add(key);
      const type = types[Math.floor(hash3(x, 3, z) * types.length)];
      const p = new Prop(game, type, px + 0.5, CITY.G, pz + 0.5);
      p.yaw = Math.floor(hash3(x, 4, z) * 4) * (Math.PI / 2);
      p.cellKey = key;
      out.push(p);
    }
  }
  return out;
}
