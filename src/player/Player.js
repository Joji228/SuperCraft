// Hero movement: walking, jumping and flight, with voxel collision.
import * as THREE from 'three';
import { B, SOLID } from '../world/Blocks.js';
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
  fly: 26.5,
  boost: 62,
  supersonic: 75, // after the sonic boom
  boomDelay: 1.7, // seconds of boosting before breaking the sound barrier
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
    this.lastJumpPress = -10;
    this.time = 0;
    this.boostAmount = 0; // 0..~1.2, for camera/FX
    this.boostTime = 0;
    this.supersonic = false;
    this.onSonicBoom = null;
  }

  spawn(x, y, z, yaw = 0) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw + Math.PI; // model faces +Z; camera yaw 0 looks -Z
    this.flying = false;
    this.supersonic = false;
    this.boostTime = 0;
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
      if (!this.flying && !this.onGround && this.time - this.lastJumpPress < 0.35) this.setFlying(true);
      this.lastJumpPress = this.time;
    }

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
      this.updateSupersonic(dt);
      const speed = this.supersonic ? MOVE.supersonic : this.boosting ? MOVE.boost : MOVE.fly;
      const tx = dx * speed;
      const ty = dy * speed + vert * MOVE.fly * 0.75;
      const tz = dz * speed;
      this.steer(tx, ty, tz, dt);
    } else {
      this.boosting = false;
      this.supersonic = false;
      this.boostTime = 0;
      const run = input.isDown('boost');
      const speed = run ? MOVE.run : MOVE.walk;
      let wx = fx * iz + rx * ix;
      let wz = fz * iz + rz * ix;
      const wl = Math.hypot(wx, wz);
      if (wl > 1) {
        wx /= wl;
        wz /= wl;
      }
      const accel = this.onGround ? 16 : 5;
      const k = 1 - Math.exp(-accel * dt);
      this.vel.x += (wx * speed - this.vel.x) * k;
      this.vel.z += (wz * speed - this.vel.z) * k;

      this.vel.y -= MOVE.gravity * dt;
      this.vel.y = Math.max(this.vel.y, -70);
      if (this.onGround && input.pressed('jump')) {
        this.vel.y = MOVE.jump;
        this.onGround = false;
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
      this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 22, dt);
    } else if (this.flying) {
      this.yaw = dampAngle(this.yaw, camYaw + Math.PI, 16, dt);
    } else if (hs > 0.5 && (ix || iz)) {
      this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 24, dt);
    }

    const target = this.boosting ? Math.min(1.25, this.vel.length() / MOVE.boost) : 0;
    this.boostAmount += (target - this.boostAmount) * (1 - Math.exp(-6 * dt));
  }

  /**
   * Flight steering: the direction of travel swings quickly towards where you aim,
   * while the speed itself changes more gradually (so turns don't bleed speed).
   */
  steer(tx, ty, tz, dt) {
    const v = this.vel;
    const cur = v.length();
    const want = Math.hypot(tx, ty, tz);
    if (cur < 3 || want < 3) {
      const k = 1 - Math.exp(-6 * dt);
      v.x += (tx - v.x) * k;
      v.y += (ty - v.y) * k;
      v.z += (tz - v.z) * k;
      return;
    }
    const turn = 1 - Math.exp(-(this.supersonic ? 9 : this.boosting ? 11 : 14) * dt);
    let dx = v.x / cur + (tx / want - v.x / cur) * turn;
    let dy = v.y / cur + (ty / want - v.y / cur) * turn;
    let dz = v.z / cur + (tz / want - v.z / cur) * turn;
    const dl = Math.hypot(dx, dy, dz) || 1;
    const accel = want > cur ? (this.boosting ? 2.4 : 5) : 4;
    const speed = cur + (want - cur) * (1 - Math.exp(-accel * dt));
    v.set((dx / dl) * speed, (dy / dl) * speed, (dz / dl) * speed);
  }

  /** Hold boost long enough at full speed and Aegis breaks the sound barrier. */
  updateSupersonic(dt) {
    if (!this.boosting) {
      this.boostTime = 0;
      this.supersonic = false;
      return;
    }
    this.boostTime += dt;
    const speed = this.vel.length();
    if (this.supersonic) {
      // slammed into something: drop out of supersonic
      if (speed < MOVE.boost * 0.55) {
        this.supersonic = false;
        this.boostTime = 0;
      }
    } else if (this.boostTime >= MOVE.boomDelay && speed >= MOVE.boost * 0.85) {
      this.supersonic = true;
      this.onSonicBoom?.();
    }
  }

  get mode() {
    if (this.flying) return 'fly';
    return this.onGround ? 'ground' : 'air';
  }

  // ---------- collision ----------

  /** Solid blocks and water both stop the hero (he skims over water, never sinks in). */
  overlaps() {
    const w = this.world;
    const x0 = Math.floor(this.pos.x - HALF_W), x1 = Math.floor(this.pos.x + HALF_W - EPS);
    const y0 = Math.floor(this.pos.y), y1 = Math.floor(this.pos.y + HEIGHT - EPS);
    const z0 = Math.floor(this.pos.z - HALF_W), z1 = Math.floor(this.pos.z + HALF_W - EPS);
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const b = w.get(x, y, z);
          if (SOLID[b] || b === B.WATER) return true;
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
