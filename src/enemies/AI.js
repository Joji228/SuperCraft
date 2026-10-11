// Shared helpers for enemy behaviour.
import * as THREE from 'three';
import { angleDiff } from '../util/math.js';

const tmp = new THREE.Vector3();

/** Horizontal distance and direction from an entity to a point. */
export function toward(e, target) {
  tmp.set(target.x - e.pos.x, 0, target.z - e.pos.z);
  const d = tmp.length();
  if (d > 1e-4) tmp.divideScalar(d);
  return { d, dir: tmp };
}

/** Accelerate an entity's horizontal velocity towards a direction at a speed. */
export function steer(e, dirX, dirZ, speed, dt, accel = 8) {
  const k = 1 - Math.exp(-accel * dt);
  e.vel.x += (dirX * speed - e.vel.x) * k;
  e.vel.z += (dirZ * speed - e.vel.z) * k;
}

export function faceTowards(e, x, z, dt, rate = 10) {
  const want = Math.atan2(x - e.pos.x, z - e.pos.z);
  e.yaw += angleDiff(e.yaw, want) * (1 - Math.exp(-rate * dt));
}

/** Line of sight between two points through the voxel world. */
export function canSee(world, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const d = Math.hypot(dx, dy, dz);
  if (d < 0.01) return true;
  const hit = world.raycast(a.x, a.y, a.z, dx / d, dy / d, dz / d, d - 0.5);
  return !hit;
}

/** Point at the hero's chest. */
export function heroChest(game, out = new THREE.Vector3()) {
  const p = game.player.pos;
  return out.set(p.x, p.y + 1.2, p.z);
}
