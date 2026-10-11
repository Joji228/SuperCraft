// Attack drones: hover around the hero, strafe and shoot energy bolts.
// Freezing one makes it drop out of the sky.
import * as THREE from 'three';
import { Entity } from '../entities/Entity.js';
import { toward, canSee, heroChest } from './AI.js';
import { CITY } from '../world/CityGenerator.js';

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

export class Drone extends Entity {
  constructor(game, x, y, z, opts = {}) {
    super(game, { halfW: 0.55, height: 0.6, health: opts.health || 35, team: 'enemy', kind: 'drone' });
    this.pos.set(x, y, z);
    this.flying = true;
    this.canStep = false;
    this.mass = 1.5;
    this.orbit = Math.random() * Math.PI * 2;
    this.orbitDir = Math.random() < 0.5 ? 1 : -1;
    this.cooldown = 1 + Math.random() * 1.5;
    this.range = opts.range || 12;
    this.heightOff = 3 + Math.random() * 4;
    this.falling = false;
    this.dmgMul = opts.dmgMul || 1;
    this.target = opts.target || null; // civilian to harass when the hero is far
    this.carryLabel = 'Broken drone';
    this.throwable = true;
    this.sensesColor = () => (this.alive ? '#ff3b3b' : null);
    const body = 0x3b4252;
    this.boxes = [
      { y: 0.3, w: 0.8, h: 0.25, d: 0.8, color: body },
      { y: 0.3, x: 0.55, z: 0.55, w: 0.5, h: 0.08, d: 0.5, color: 0x999999 },
      { y: 0.3, x: -0.55, z: 0.55, w: 0.5, h: 0.08, d: 0.5, color: 0x999999 },
      { y: 0.3, x: 0.55, z: -0.55, w: 0.5, h: 0.08, d: 0.5, color: 0x999999 },
      { y: 0.3, x: -0.55, z: -0.55, w: 0.5, h: 0.08, d: 0.5, color: 0x999999 },
      { y: 0.45, x: 0.55, z: 0.55, w: 0.7, h: 0.03, d: 0.08, color: 0x222222 },
      { y: 0.45, x: -0.55, z: 0.55, w: 0.7, h: 0.03, d: 0.08, color: 0x222222 },
      { y: 0.45, x: 0.55, z: -0.55, w: 0.7, h: 0.03, d: 0.08, color: 0x222222 },
      { y: 0.45, x: -0.55, z: -0.55, w: 0.7, h: 0.03, d: 0.08, color: 0x222222 },
      { y: 0.25, z: 0.42, w: 0.25, h: 0.12, d: 0.06, color: 0xff2030, glow: true },
      { y: 0.12, w: 0.2, h: 0.12, d: 0.4, color: 0x222222 },
    ];
    this.rotors = this.boxes.slice(5, 9);
  }

  get canFreeze() {
    return this.alive;
  }

  onDefeated() {
    const c = this.centerInto(new THREE.Vector3());
    this.game.explode(c, 2.5, 8, this);
    this.boxes[9].hidden = true;
    this.flying = false;
    this.carryable = true;
    this.deadTime = 0;
  }

  update(dt) {
    for (const r of this.rotors) r.ry = (r.ry || 0) + dt * (this.alive && this.frozen <= 0 ? 40 : 0);
    if (!this.alive) {
      this.deadTime += dt;
      this.flying = false;
      this.age += dt;
      this.physics(dt);
      if (Math.random() < dt * 6) this.game.effects.smoke(this.center, 1, 0.4, 0.2);
      if (this.deadTime > 20 && !this.carried) this.remove();
      return;
    }
    if (this.frozen > 0) {
      // frozen drones fall and shatter on the ground
      this.flying = false;
      super.update(dt);
      if (this.onGround) this.damage(999, { type: 'impact' });
      return;
    }
    this.flying = true;
    super.update(dt);
    if (this.carried) return;
    const g = this.game;
    const p = g.player;
    const heroDist = this.pos.distanceTo(p.pos);
    const focus = heroDist < 90 || !this.target || this.target.removed ? p.pos : this.target.pos;
    this.orbit += dt * 0.6 * this.orbitDir;
    const tx = focus.x + Math.cos(this.orbit) * this.range;
    const tz = focus.z + Math.sin(this.orbit) * this.range;
    const ground = Math.max(CITY.G, g.world.surfaceY(Math.floor(tx), Math.floor(tz)) + 1);
    const ty = Math.max(focus.y + this.heightOff, ground + 3);
    const k = 1 - Math.exp(-2.2 * dt);
    this.vel.x += ((tx - this.pos.x) * 1.2 - this.vel.x) * k;
    this.vel.y += ((ty - this.pos.y) * 1.2 - this.vel.y) * k;
    this.vel.z += ((tz - this.pos.z) * 1.2 - this.vel.z) * k;
    if (this.vel.length() > 16) this.vel.setLength(16);
    if (this.hitWall) this.orbitDir *= -1;
    const t = toward(this, focus);
    this.yaw = Math.atan2(t.dir.x, t.dir.z);
    this.pitch = 0.15;
    this.roll = Math.sin(this.age * 2) * 0.1;

    this.cooldown -= dt;
    const eye = tmpA.set(this.pos.x, this.pos.y + 0.25, this.pos.z);
    const aimAt = focus === p.pos ? heroChest(g, tmpB) : tmpB.set(focus.x, focus.y + 1, focus.z);
    if (this.cooldown <= 0 && eye.distanceTo(aimAt) < 45 && canSee(g.world, eye, aimAt)) {
      this.cooldown = 1.4 + Math.random() * 1.2;
      g.projectiles.fire('bolt', eye, aimAt, this, 0.03);
      g.audio.play('zap', this.pos);
      g.addDanger(focus, 12, 1.5);
    }
  }
}
