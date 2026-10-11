// Hero movement: walking, jumping and flight, with voxel collision.
import { SX, SZ, SEA } from '../world/World.js';
import { B } from '../world/Blocks.js';
import { Body } from '../physics/Body.js';
import { clamp, dampAngle } from '../util/math.js';

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

export class Player extends Body {
  constructor(world) {
    super(world, 0.38, 1.9);
    this.yaw = 0; // facing of the body
    this.boosting = false;
    this.lastJumpPress = -10;
    this.time = 0;
    this.boostAmount = 0; // 0..~1.2, for camera/FX
    this.boostTime = 0;
    this.supersonic = false;
    this.onSonicBoom = null;
    this.aimTimer = 0;
    // hooks set by the game: locked powers (tutorial) and the speed bar for boosting
    this.allowed = () => true;
    this.canBoost = () => true;
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
    const canFly = this.allowed('fly');
    if (input.pressed('fly') && (canFly || this.flying)) this.setFlying(!this.flying);
    if (input.pressed('jump')) {
      if (canFly && !this.flying && !this.onGround && this.time - this.lastJumpPress < 0.35) this.setFlying(true);
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
      this.boosting = input.isDown('boost') && iz > 0 && this.allowed('boost') && this.canBoost();
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
      if (this.onGround && input.pressed('jump') && this.allowed('jump')) {
        this.vel.y = MOVE.jump;
        this.onGround = false;
      }
    }

    this.move(dt);

    // land when holding descend on the ground (but never on water)
    const below = this.world.get(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.5), Math.floor(this.pos.z));
    if (this.flying && this.onGround && input.isDown('descend') && below !== B.WATER) this.flying = false;
    // touching the water: Aegis can't stand on it, so he hovers over it instead
    if (!this.flying && this.onGround && below === B.WATER) {
      this.flying = true;
      this.vel.y = 3;
    }

    // world bounds
    this.pos.x = clamp(this.pos.x, 1 - SEA, SX + SEA - 1);
    this.pos.z = clamp(this.pos.z, 1 - SEA, SZ + SEA - 1);
    if (this.pos.y > MOVE.maxAltitude) {
      this.pos.y = MOVE.maxAltitude;
      this.vel.y = Math.min(this.vel.y, 0);
    }

    // body facing
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.aimTimer = Math.max(0, this.aimTimer - dt);
    if (this.aimTimer > 0) {
      // using a power: face where the camera aims
      this.yaw = dampAngle(this.yaw, camYaw + Math.PI, 30, dt);
    } else if (this.flying && hs > 2) {
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
}
