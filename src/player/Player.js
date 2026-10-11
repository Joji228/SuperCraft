// Hero movement: walking, jumping, swimming and flight, with voxel collision.
import * as THREE from 'three';
import { B } from '../world/Blocks.js';
import { SX, SZ } from '../world/World.js';
import { clamp, dampAngle } from '../util/math.js';

const HALF_W = 0.38;
const HEIGHT = 1.9;
const EPS = 1e-4;

export const MOVE = {
  walk: 7,
  run: 13,
  jump: 12.5,
  gravity: 32,
  fly: 22,
  boost: 62,
  maxAltitude: 230,
};

export class Player {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; // facing of the body
    this.flying = false;
    this.boosting = false;
    this.onGround = false;
    this.inWater = false;
    this.lastJumpPress = -10;
    this.time = 0;
    this.boostAmount = 0; // 0..1, for camera/FX
  }

  spawn(x, y, z, yaw = 0) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw + Math.PI; // model faces +Z; camera yaw 0 looks -Z
    this.flying = false;
  }

  setFlying(on) {
    if (on === this.flying) return;
    this.flying = on;
    if (on && this.onGround) this.vel.y = 9; // take-off pop
  }

  /** dt: seconds. camYaw/camPitch: camera orientation. input: Input. */
  update(dt, input, camYaw, camPitch) {
    this.time += dt;
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    const iz = (input.isDown('forward') ? 1 : 0) - (input.isDown('back') ? 1 : 0);
    const ix = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);

    // flight toggles: F, or double-tap Space in mid-air
    if (input.pressed('fly')) this.setFlying(!this.flying);
    if (input.pressed('jump')) {
      if (!this.flying && !this.onGround && !this.inWater && this.time - this.lastJumpPress < 0.35) this.setFlying(true);
      this.lastJumpPress = this.time;
    }

    const feet = this.world.get(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.4), Math.floor(this.pos.z));
    this.inWater = feet === B.WATER;

    if (this.flying) {
      const cp = Math.cos(camPitch), sp = Math.sin(camPitch);
      // forward follows where the camera looks, including up/down
      let dx = fx * cp * iz + rx * ix;
      let dy = sp * iz;
      let dz = fz * cp * iz + rz * ix;
      const len = Math.hypot(dx, dy, dz);
      if (len > 1) {
        dx /= len;
        dy /= len;
        dz /= len;
      }
      const vert = (input.isDown('jump') ? 1 : 0) - (input.isDown('descend') ? 1 : 0);
      this.boosting = input.isDown('boost') && iz > 0;
      const speed = this.boosting ? MOVE.boost : MOVE.fly;
      const tx = dx * speed;
      const ty = dy * speed + vert * MOVE.fly * 0.75;
      const tz = dz * speed;
      const k = 1 - Math.exp(-(this.boosting ? 2.4 : 5) * dt);
      this.vel.x += (tx - this.vel.x) * k;
      this.vel.y += (ty - this.vel.y) * k;
      this.vel.z += (tz - this.vel.z) * k;
    } else {
      this.boosting = false;
      const run = input.isDown('boost');
      const speed = this.inWater ? 4.5 : run ? MOVE.run : MOVE.walk;
      let wx = fx * iz + rx * ix;
      let wz = fz * iz + rz * ix;
      const wl = Math.hypot(wx, wz);
      if (wl > 1) {
        wx /= wl;
        wz /= wl;
      }
      const accel = this.onGround ? 14 : 3.5;
      const k = 1 - Math.exp(-accel * dt);
      this.vel.x += (wx * speed - this.vel.x) * k;
      this.vel.z += (wz * speed - this.vel.z) * k;

      if (this.inWater) {
        this.vel.y -= MOVE.gravity * 0.25 * dt;
        this.vel.y = Math.max(this.vel.y, -4);
        if (input.isDown('jump')) this.vel.y = Math.min(this.vel.y + 30 * dt, 5);
        if (input.pressed('jump')) this.vel.y = 10; // kick up, enough to climb out onto the quay
      } else {
        this.vel.y -= MOVE.gravity * dt;
        this.vel.y = Math.max(this.vel.y, -70);
        if (this.onGround && input.pressed('jump')) {
          this.vel.y = MOVE.jump;
          this.onGround = false;
        }
      }
    }

    this.move(dt);

    // land when holding descend on the ground
    if (this.flying && this.onGround && input.isDown('descend')) this.flying = false;

    // world bounds
    this.pos.x = clamp(this.pos.x, 1, SX - 1);
    this.pos.z = clamp(this.pos.z, 1, SZ - 1);
    if (this.pos.y > MOVE.maxAltitude) {
      this.pos.y = MOVE.maxAltitude;
      this.vel.y = Math.min(this.vel.y, 0);
    }

    // body facing
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.flying && hs > 2) {
      this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 10, dt);
    } else if (this.flying) {
      this.yaw = dampAngle(this.yaw, camYaw + Math.PI, 6, dt);
    } else if (hs > 0.5 && (ix || iz)) {
      this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 12, dt);
    }

    const target = this.boosting ? Math.min(1, this.vel.length() / MOVE.boost) : 0;
    this.boostAmount += (target - this.boostAmount) * (1 - Math.exp(-6 * dt));
  }

  get mode() {
    if (this.flying) return 'fly';
    if (this.inWater) return 'swim';
    return this.onGround ? 'ground' : 'air';
  }

  // ---------- collision ----------

  overlaps() {
    const w = this.world;
    const x0 = Math.floor(this.pos.x - HALF_W), x1 = Math.floor(this.pos.x + HALF_W - EPS);
    const y0 = Math.floor(this.pos.y), y1 = Math.floor(this.pos.y + HEIGHT - EPS);
    const z0 = Math.floor(this.pos.z - HALF_W), z1 = Math.floor(this.pos.z + HALF_W - EPS);
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (w.isSolid(x, y, z)) return true;
    return false;
  }

  /** Move along one axis; snap back to the block face on collision. Returns true if blocked. */
  moveAxis(axis, d) {
    if (d === 0) return false;
    this.pos[axis] += d;
    if (!this.overlaps()) return false;
    if (axis === 'y') {
      this.pos.y = d > 0 ? Math.floor(this.pos.y + HEIGHT) - HEIGHT - EPS : Math.floor(this.pos.y) + 1;
    } else {
      this.pos[axis] = d > 0 ? Math.floor(this.pos[axis] + HALF_W) - HALF_W - EPS : Math.floor(this.pos[axis] - HALF_W) + 1 + HALF_W + EPS;
    }
    return true;
  }

  /** Horizontal move with a one-block auto step-up when walking. */
  moveHorizontal(axis, d) {
    const before = this.pos[axis];
    if (!this.moveAxis(axis, d)) return;
    if (this.flying || !this.onGround || this.vel.y > 0) {
      this.vel[axis] = 0;
      return;
    }
    // try stepping up one block
    const saved = this.pos.clone();
    this.pos[axis] = before;
    this.pos.y += 1.01;
    if (!this.overlaps() && !this.moveAxis(axis, d)) {
      this.stepped = true;
      return;
    }
    this.pos.copy(saved);
    this.vel[axis] = 0;
  }

  move(dt) {
    const dx = this.vel.x * dt, dy = this.vel.y * dt, dz = this.vel.z * dt;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.4));
    const wasGround = this.onGround;
    this.onGround = false;
    this.stepped = false;
    for (let i = 0; i < steps; i++) {
      if (this.moveAxis('y', dy / steps)) {
        if (dy < 0) this.onGround = true;
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
}
