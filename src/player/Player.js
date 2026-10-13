// Hero movement: walking, jumping and flight, with voxel collision.
import { SX, SZ, SEA } from '../world/World.js';
import { B } from '../world/Blocks.js';
import { Body } from '../physics/Body.js';
import { clamp, dampAngle } from '../util/math.js';

export const MOVE = {
  walk: 7,
  run: 13,
  sprint: 36, // super speed on foot (Shift), uses the SPEED bar
  jump: 12.5,
  gravity: 32,
  fly: 37.5, // about 135 km/h cruising
  boost: 62,
  supersonic: 75, // after the sonic boom
  boomDelay: 1.7, // seconds of boosting before breaking the sound barrier
  maxAltitude: 230,
  terminal: 110, // free-fall speed limit (m/s): long drops keep picking up speed
  heroLanding: 32, // landing faster than this (m/s) is a superhero landing
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
    // free fall: how long, how far to the ground, head-down dive and the landing flip
    this.fallTime = 0;
    this.groundDist = 99;
    this.diving = false;
    this.flare = false;
    this.landT = 0; // > 0 while holding the superhero-landing pose
    this.onHeroLanding = null;
    // per-hero movement (Granite is slower on foot and charges his jump instead)
    this.stats = { walk: MOVE.walk, run: MOVE.run, sprint: MOVE.sprint, jump: MOVE.jump };
    this.chargeJump = false; // Space charges a leap (handled by the hero's kit) instead of jumping
    this.wades = false; // walks through water instead of hovering over it
    this.leaping = false;
    this.leapVel = { x: 0, z: 0 };
    this.charging = false;
    this.wading = false;
    this.noTrail = false; // no super-speed running trail
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
      let vert = (input.isDown('jump') ? 1 : 0) - (input.isDown('descend') ? 1 : 0);
      if (vert > 0 && this.pos.y >= MOVE.maxAltitude - 0.5) vert = 0; // at the ceiling: nothing to climb (or boost) into
      this.sprinting = false; // on-foot super speed ends when you take off, so the SPEED bar can refill
      // Shift boosts any way you're heading: forward, or straight up/down with Space / C
      this.boosting = input.isDown('boost') && (iz > 0 || vert !== 0) && this.allowed('boost') && this.canBoost();
      this.updateSupersonic(dt);
      const speed = this.supersonic ? MOVE.supersonic : this.boosting ? MOVE.boost : MOVE.fly;
      if (this.boosting) {
        // full boost speed along the combined direction (forward + climb/dive)
        const bx = dx, by = dy + vert, bz = dz;
        const bl = Math.hypot(bx, by, bz) || 1;
        this.steer((bx / bl) * speed, (by / bl) * speed, (bz / bl) * speed, dt);
      } else {
        this.steer(dx * speed, dy * speed + vert * MOVE.fly * 0.75, dz * speed, dt);
      }
    } else {
      this.boosting = false;
      this.supersonic = false;
      this.boostTime = 0;
      // Shift on foot: super speed (if the SPEED bar allows), otherwise a normal run
      const wantsRun = input.isDown('boost') && (ix || iz);
      this.sprinting = wantsRun && this.onGround && this.allowed('boost') && this.canBoost(this.sprinting);
      const st = this.stats;
      const speed = this.charging ? 1.5 : this.sprinting ? st.sprint : wantsRun ? st.run : this.wading ? st.walk * 0.6 : st.walk;
      let wx = fx * iz + rx * ix;
      let wz = fz * iz + rz * ix;
      const wl = Math.hypot(wx, wz);
      if (wl > 1) {
        wx /= wl;
        wz /= wl;
      }
      const accel = this.sprinting ? 5 : this.onGround ? 16 : 5;
      // mid-leap there's only a little air control: the leap carries him
      const k = 1 - Math.exp(-(this.leaping ? 0.4 : accel) * dt);
      if (this.leaping) {
        // the leap carries him (even if he scrapes a wall on the way up), with a little steering
        this.vel.x = this.leapVel.x + wx * 3;
        this.vel.z = this.leapVel.z + wz * 3;
      } else {
        this.vel.x += (wx * speed - this.vel.x) * k;
        this.vel.z += (wz * speed - this.vel.z) * k;
      }

      // just landed hard: hold the superhero-landing crouch for a moment
      if (this.landT > 0) {
        this.landT = Math.max(0, this.landT - dt);
        const hold = 1 - Math.exp(-14 * dt);
        this.vel.x -= this.vel.x * hold;
        this.vel.z -= this.vel.z * hold;
      }
      this.vel.y -= MOVE.gravity * dt;
      this.vel.y = Math.max(this.vel.y, -MOVE.terminal);
      if (this.onGround && input.pressed('jump') && this.allowed('jump') && !this.chargeJump) {
        this.vel.y = this.stats.jump;
        this.onGround = false;
      }
    }

    const vyBefore = this.vel.y;
    const wasAir = !this.onGround;
    this.move(dt);
    this.updateFall(dt, vyBefore, wasAir);

    // land when holding descend on the ground (but never on water)
    const below = this.world.get(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.5), Math.floor(this.pos.z));
    if (this.flying && this.onGround && input.isDown('descend') && below !== B.WATER) this.flying = false;
    // touching the water: Aegis can't stand on it, so he hovers over it instead
    // a hero who wades walks along the bottom instead (slowly, with splashes)
    this.wading = this.wades && !this.flying && this.world.get(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.3), Math.floor(this.pos.z)) === B.WATER;
    if (!this.flying && this.onGround && below === B.WATER && !this.wades) {
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
    if (this.firstPerson) {
      this.yaw = camYaw + Math.PI;
    } else if (this.aimTimer > 0) {
      // using a power: face where the camera aims
      this.yaw = dampAngle(this.yaw, camYaw + Math.PI, 30, dt);
    } else if (this.flying && hs > 2) {
      this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 22, dt);
    } else if (this.flying) {
      this.yaw = dampAngle(this.yaw, camYaw + Math.PI, 16, dt);
    } else if (hs > 0.5 && (ix || iz)) {
      this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 24, dt);
    }

    const target = this.boosting ? Math.min(1.25, this.vel.length() / MOVE.boost) : this.sprinting ? Math.min(0.75, Math.hypot(this.vel.x, this.vel.z) / MOVE.sprint * 0.75) : 0;
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

  /**
   * Long drops: after a moment of falling Aegis tips head-first into a dive, flips
   * upright just before the ground, and a hard enough landing is a superhero landing.
   */
  updateFall(dt, vyBefore, wasAir) {
    if (this.flying || this.onGround) {
      if (!this.flying && wasAir && this.onGround && vyBefore < -MOVE.heroLanding) {
        const under = this.world.get(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.5), Math.floor(this.pos.z));
        if (under !== B.WATER) {
          this.landT = 0.65;
          this.onHeroLanding?.(-vyBefore);
        }
      }
      this.fallTime = 0;
      this.diving = this.flare = false;
      return;
    }
    if (this.vel.y < -6) this.fallTime += dt;
    else this.fallTime = 0;
    if (this.vel.y < -16) {
      const hit = this.world.raycast(this.pos.x, this.pos.y + 0.1, this.pos.z, 0, -1, 0, 250);
      this.groundDist = hit ? hit.t - 0.1 : 250;
    } else this.groundDist = 99;
    // only a proper drop turns into a dive (not hopping off a roof edge)
    this.diving = this.diving ? this.vel.y < -16 : this.fallTime > 0.45 && this.vel.y < -22 && this.groundDist > 15;
    // about a third of a second from impact: swing the feet down
    this.flare = this.diving && this.groundDist < Math.max(3, -this.vel.y * 0.3);
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
