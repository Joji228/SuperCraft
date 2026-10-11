// Axis-aligned box that moves through the voxel world with collision.
// Shared by the hero, people, cars, props and enemies.
import * as THREE from 'three';
import { B, SOLID } from '../world/Blocks.js';

const EPS = 1e-4;

export class Body {
  constructor(world, halfW = 0.38, height = 1.9) {
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.halfW = halfW;
    this.height = height;
    this.onGround = false;
    this.flying = false; // no step-up and no "stick to floor" when true
    this.canStep = true;
    this.waterSolid = true; // water is a floor for everyone in Brightport
    this.hitWall = false; // horizontal collision during the last move
    this.impact = 0; // speed lost in the last collision (for crash damage)
  }

  /** True if the box overlaps a solid voxel. */
  overlaps() {
    const w = this.world;
    const hw = this.halfW;
    const x0 = Math.floor(this.pos.x - hw), x1 = Math.floor(this.pos.x + hw - EPS);
    const y0 = Math.floor(this.pos.y), y1 = Math.floor(this.pos.y + this.height - EPS);
    const z0 = Math.floor(this.pos.z - hw), z1 = Math.floor(this.pos.z + hw - EPS);
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const b = w.get(x, y, z);
          if (SOLID[b] || (this.waterSolid && b === B.WATER)) return true;
        }
      }
    }
    return false;
  }

  /** Move along one axis; snap back to the block face on collision. Returns true if blocked. */
  moveAxis(axis, d) {
    if (d === 0) return false;
    this.pos[axis] += d;
    if (!this.overlaps()) return false;
    const hw = this.halfW;
    if (axis === 'y') {
      this.pos.y = d > 0 ? Math.floor(this.pos.y + this.height) - this.height - EPS : Math.floor(this.pos.y) + 1;
    } else {
      this.pos[axis] = d > 0 ? Math.floor(this.pos[axis] + hw) - hw - EPS : Math.floor(this.pos[axis] - hw) + 1 + hw + EPS;
    }
    return true;
  }

  /** Horizontal move with a one-block auto step-up when walking. */
  moveHorizontal(axis, d) {
    const before = this.pos[axis];
    if (!this.moveAxis(axis, d)) return;
    if (this.flying || !this.canStep || !this.onGround || this.vel.y > 0) {
      this.impact = Math.max(this.impact, Math.abs(this.vel[axis]));
      this.vel[axis] = 0;
      this.hitWall = true;
      return;
    }
    // try stepping up one block
    const saved = this.pos.clone();
    this.pos[axis] = before;
    this.pos.y += 1.01;
    if (!this.overlaps() && !this.moveAxis(axis, d)) return;
    this.pos.copy(saved);
    this.impact = Math.max(this.impact, Math.abs(this.vel[axis]));
    this.vel[axis] = 0;
    this.hitWall = true;
  }

  move(dt) {
    const dx = this.vel.x * dt, dy = this.vel.y * dt, dz = this.vel.z * dt;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.4));
    const wasGround = this.onGround;
    this.onGround = false;
    this.hitWall = false;
    this.impact = 0;
    for (let i = 0; i < steps; i++) {
      if (this.moveAxis('y', dy / steps)) {
        if (dy < 0) this.onGround = true;
        this.impact = Math.max(this.impact, Math.abs(this.vel.y));
        this.vel.y = 0;
      }
      const g = this.onGround;
      this.onGround = this.onGround || wasGround;
      this.moveHorizontal('x', dx / steps);
      this.moveHorizontal('z', dz / steps);
      this.onGround = g;
    }
    // stay grounded while standing still (gravity keeps pushing into the floor)
    if (!this.onGround && !this.flying && this.vel.y <= 0) {
      this.pos.y -= 0.02;
      if (this.overlaps()) this.onGround = true;
      this.pos.y += 0.02;
    }
  }

  /** Push the body up out of solid blocks (after spawning or teleporting). */
  unstick() {
    for (let i = 0; i < 64 && this.overlaps(); i++) this.pos.y += 1;
  }
}
