// Free Roam fun: walk up to any car, press R to steal it and drive around GTA-style.
// Arcade handling (grip, handbrake drifts, nitro on the SPEED bar), and the car is a
// weapon: it bowls people over, shoves traffic aside and smashes through walls.
import * as THREE from 'three';
import { B, SOLID, LASER_PROOF } from '../world/Blocks.js';
import { CITY } from '../world/CityGenerator.js';
import { Civilian } from '../npc/Civilians.js';

export const CAR = {
  maxSpeed: 34, // m/s (about 120 km/h)
  nitroSpeed: 52, // with Shift (about 190 km/h)
  accel: 14,
  nitroAccel: 26,
  brake: 36,
  reverse: 10,
  maxReverse: 12,
  rolling: 3, // coasting slowdown
  grip: 10, // how fast sideways sliding is killed
  driftGrip: 1.4, // with the handbrake
  steer: 2.4, // turn rate (rad/s) at moderate speed
  enterRange: 3.8,
  health: 300,
};

const tmp = new THREE.Vector3();

export class Driving {
  constructor(game) {
    this.game = game;
    this.car = null;
    this.steer = 0;
    this.nitro = false;
    this.lookIdle = 9;
    this.hits = new Map(); // entity -> seconds until it can be hit again
    this.dangerTimer = 0;
    this.hornTimer = 0;
    this.f = new THREE.Vector3();
    this.r = new THREE.Vector3();
  }

  get active() {
    return !!this.car;
  }

  /** Forward speed (signed, m/s) of the car being driven. */
  get speed() {
    return this.car ? this.car.vel.x * Math.sin(this.car.yaw) + this.car.vel.z * Math.cos(this.car.yaw) : 0;
  }

  /** The car you could steal right now (Free Roam, on foot, hands free), or null. */
  findCar() {
    const g = this.game;
    const p = g.player;
    if (this.car || !g.mode?.allowDriving || p.flying || g.abilities.carry.held || g.koTimer > 0) return null;
    return g.entities.nearest(p.pos, CAR.enterRange, (e) => e.kind === 'car' && e.alive && !e.removed && !e.carried && !e.persistent && Math.abs(e.pos.y - p.pos.y) < 2.5);
  }

  /** Context prompt for Free Roam ("Press R to steal the car"). */
  prompt() {
    const c = this.findCar();
    if (!c) return null;
    return c.driving ? 'Press <b>R</b> to steal the car' : 'Press <b>R</b> to get in the car';
  }

  enter(car) {
    const g = this.game;
    // whoever was driving gets thrown out and runs for it
    if (car.driving) {
      const side = tmp.set(Math.cos(car.yaw), 0, -Math.sin(car.yaw));
      const civ = g.entities.add(new Civilian(g, car.pos.x + side.x * 1.8, car.pos.y, car.pos.z + side.z * 1.8));
      civ.unstick();
      civ.panic(car.pos, 8);
      g.audio.play('scream', car.pos);
      const nodes = g.traffic.nodes;
      if (car.heldKey != null && nodes.get(car.heldKey) === car) nodes.delete(car.heldKey);
      car.heldKey = null;
    }
    car.driving = false;
    car.playerDriven = true;
    car.persistent = true;
    car.canStep = true; // hop curbs
    car.carryable = false;
    car.thrown = false;
    car.halfW = 1.05;
    // a superhero's getaway car takes a beating (same dents, more hit points)
    if (!car.tough) {
      car.tough = true;
      car.health = (car.health / car.maxHealth) * CAR.health;
      car.maxHealth = CAR.health;
    }
    this.car = car;
    this.justEntered = true;
    this.steer = 0;
    this.lookIdle = 9;
    this.hits.clear();
    g.abilities.reset();
    const p = g.player;
    p.flying = false;
    p.boosting = p.supersonic = p.sprinting = false;
    // swing the camera round behind the car
    g.rig.yaw = car.yaw + Math.PI;
    g.rig.pitch = -0.2;
    g.audio.play('click');
    g.audio.play('thud', car.pos);
    if (!this.toldControls) {
      this.toldControls = true;
      g.hud.toast('W/S drive · A/D steer · SHIFT nitro · SPACE handbrake · H horn · R get out', 'info', 6);
    }
  }

  /** Get out (or jump out at speed). fly: take straight off into the air. */
  exit({ fly = false } = {}) {
    const g = this.game;
    const car = this.car;
    if (!car) return;
    this.car = null;
    car.playerDriven = false;
    car.persistent = false;
    car.canStep = false;
    car.carryable = true;
    car.roll = 0;
    car.pitch = 0;
    car.halfW = 1.0;
    g.audio.stopLoop('engine');
    const p = g.player;
    // out of the driver's door (left side), or onto the roof if that's blocked
    const side = tmp.set(Math.cos(car.yaw), 0, -Math.sin(car.yaw));
    p.pos.set(car.pos.x + side.x * 2, car.pos.y + 0.05, car.pos.z + side.z * 2);
    if (p.overlaps()) p.pos.set(car.pos.x, car.pos.y + car.height + 0.2, car.pos.z);
    p.unstick();
    p.vel.copy(car.vel).multiplyScalar(0.4);
    p.yaw = car.yaw + Math.PI;
    if (fly && g.allowed('fly')) {
      p.setFlying(true);
      p.vel.y = 10;
    }
    g.audio.play('click');
  }

  /** Mode change / restart: forget the car without touching the hero. */
  reset() {
    if (this.car) {
      this.car.playerDriven = false;
      this.car.persistent = false;
    }
    this.car = null;
    this.game.audio.stopLoop('engine');
  }

  /** Per frame while driving (instead of the hero's own movement). */
  update(dt, input, look) {
    const g = this.game;
    const car = this.car;
    const p = g.player;
    if (!car.alive || car.removed) {
      // wrecked: the explosion throws Aegis clear
      this.exit({ fly: false });
      p.vel.set(0, 9, 0);
      return;
    }
    // (the R press that got us in is still "pressed" this frame)
    const fresh = this.justEntered;
    this.justEntered = false;
    if (!fresh && input.pressed('fly')) return this.exit({ fly: true });
    if (!fresh && input.pressed('enter')) return this.exit();
    this.lookIdle = look > 1 ? 0 : this.lookIdle + dt;

    const yaw0 = car.yaw;
    const f = this.f.set(Math.sin(yaw0), 0, Math.cos(yaw0));
    const r = this.r.set(-Math.cos(yaw0), 0, Math.sin(yaw0));
    const v = car.vel;
    let vf = v.x * f.x + v.z * f.z;
    let vl = v.x * r.x + v.z * r.z;
    const throttle = input.isDown('forward') ? 1 : 0;
    const brake = input.isDown('back') ? 1 : 0;
    const handbrake = input.isDown('jump');
    const steerIn = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    this.steer += (steerIn - this.steer) * (1 - Math.exp(-7 * dt));
    const m = g.meters;
    this.nitro = throttle && input.isDown('boost') && vf > 2 && (this.nitro ? m.speed > 0 : m.speed > 12);

    if (car.onGround) {
      const top = this.nitro ? CAR.nitroSpeed : CAR.maxSpeed;
      if (throttle) {
        if (vf < top) vf = Math.min(top, vf + (this.nitro ? CAR.nitroAccel : CAR.accel) * (1 - Math.max(0, vf) / (top * 1.6)) * dt);
        else vf += (top - vf) * (1 - Math.exp(-1.5 * dt)); // nitro ran out: ease back down
      } else if (brake) {
        if (vf > 0.5) vf = Math.max(0, vf - CAR.brake * dt);
        else vf = Math.max(-CAR.maxReverse, vf - CAR.reverse * dt);
      } else {
        vf -= Math.sign(vf) * Math.min(Math.abs(vf), CAR.rolling * dt);
      }
      if (handbrake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 7 * dt);
      // tyres kill sideways sliding (much less with the handbrake on: that's a drift)
      vl *= Math.exp(-(handbrake ? CAR.driftGrip : CAR.grip) * dt);
      v.x = f.x * vf + r.x * vl;
      v.z = f.z * vf + r.z * vl;
      // steering: needs some speed, gets gentler the faster you go, reverses when reversing.
      // The body turns first; the velocity catches up through the grip above next frame.
      const grip = Math.min(1, Math.abs(vf) / 6) / (1 + Math.abs(vf) / 45);
      car.yaw -= this.steer * CAR.steer * grip * Math.sign(vf || 1) * (handbrake ? 1.7 : 1) * dt;
    }
    if (this.nitro) m.drainSpeed(dt);
    v.y = Math.max(-60, v.y - 32 * dt);

    // move, then deal with whatever we ran into
    const before = Math.hypot(v.x, v.z);
    const prevX = v.x, prevZ = v.z;
    car.move(dt);
    const after = Math.hypot(v.x, v.z);
    if (car.hitWall && before - after > 7) this.crash(before - after, prevX, prevZ);
    if (before > 4) this.ram(dt, before);

    // ploughing into the river: bail out and let it sink
    const under = g.world.get(Math.floor(car.pos.x), Math.floor(car.pos.y) - 1, Math.floor(car.pos.z));
    if (car.onGround && (under === B.WATER || under === B.ICE)) {
      g.hud.toast('Splash! The car is sinking...', 'warn', 2.5);
      g.effects.steam(car.pos, 16);
      this.exit({ fly: true });
      return;
    }

    // people scatter out of the way of a speeding car
    this.dangerTimer -= dt;
    if (before > 9 && this.dangerTimer <= 0) {
      this.dangerTimer = 0.25;
      g.addDanger(tmp.copy(car.pos).addScaledVector(f, 7), 6, 0.6);
    }
    this.hornTimer -= dt;
    if (input.pressed('horn') && this.hornTimer <= 0) {
      this.hornTimer = 0.35;
      g.audio.play('horn');
      g.addDanger(tmp.copy(car.pos).addScaledVector(f, 6), 8, 1);
    }

    // body lean: roll into turns, nose dips under braking
    const lean = -this.steer * Math.min(1, Math.abs(vf) / 22) * 0.09;
    car.roll = (car.roll || 0) + (lean - (car.roll || 0)) * (1 - Math.exp(-6 * dt));
    const dip = brake && vf > 2 ? 0.05 : throttle ? -0.025 : 0;
    car.pitch = (car.pitch || 0) + (dip - (car.pitch || 0)) * (1 - Math.exp(-6 * dt));
    car.age += dt;
    car.hitFlash = Math.max(0, car.hitFlash - dt);
    if (car.health < car.maxHealth * 0.35 && Math.random() < dt * 6) g.effects.smoke(tmp.copy(car.pos).addScaledVector(f, 1.8).setY(car.pos.y + 1.1), 1, 0.5, 0.2);
    if (this.nitro && Math.random() < dt * 30) {
      const back = tmp.copy(car.pos).addScaledVector(f, -2.3).setY(car.pos.y + 0.4);
      g.particles.emit({ x: back.x, y: back.y, z: back.z, vx: -f.x * 6, vy: 0.5, vz: -f.z * 6, life: 0.3, size: 0.35, grow: 0.3, alpha: 0.9, r: 0.4, g: 0.7, b: 1, drag: 2 });
    }

    // the hero rides along (everything else in the game keeps using the hero's position)
    p.pos.copy(car.pos);
    p.vel.copy(v);
    p.onGround = car.onGround;
    p.flying = false;
    p.boosting = p.supersonic = p.sprinting = false;
    p.boostAmount += ((this.nitro ? 0.7 : 0) - p.boostAmount) * (1 - Math.exp(-4 * dt));

    // engine note follows the speed
    const rpm = Math.min(1, Math.abs(vf) / CAR.nitroSpeed);
    g.audio.setLoopLevel('engine', 0.55 + rpm * 0.45 + (throttle ? 0.1 : 0), 0.1);
    g.audio.loops.engine?.nodes.rpm?.(rpm + (throttle ? 0.08 : 0) + (this.nitro ? 0.15 : 0));
  }

  /** Slammed into a wall: damage, shake, and at speed the wall gives way. */
  crash(lost, vx, vz) {
    const g = this.game;
    const car = this.car;
    car.damage(lost * 0.7, { type: 'impact' });
    g.audio.play('crunch', car.pos);
    g.rig.shake = Math.max(g.rig.shake, Math.min(0.9, lost / 30));
    g.effects.dust(car.pos, 14, 1.5);
    if (lost < 14) return;
    // smash a car-sized hole in whatever is in front
    const w = g.world;
    const len = Math.hypot(vx, vz) || 1;
    const dx = vx / len, dz = vz / len;
    const sx = -dz, sz = dx;
    let broke = 0;
    for (let d = 1; d <= 2.6; d += 0.8) {
      for (let s = -1.2; s <= 1.2; s += 0.6) {
        for (let y = Math.max(CITY.G, Math.floor(car.pos.y)); y <= car.pos.y + 2; y++) {
          const bx = Math.floor(car.pos.x + dx * d + sx * s), bz = Math.floor(car.pos.z + dz * d + sz * s);
          const b = w.get(bx, y, bz);
          if (!SOLID[b] || LASER_PROOF.has(b)) continue;
          w.edit(bx, y, bz, B.AIR);
          if (broke++ % 3 === 0) g.effects.debris(new THREE.Vector3(bx + 0.5, y + 0.5, bz + 0.5), 0x9aa0a8, 5, 7);
        }
      }
    }
    if (broke) {
      // burst through and keep some of the speed
      car.vel.x = vx * 0.55;
      car.vel.z = vz * 0.55;
      g.audio.play('glass', car.pos);
      g.audio.play('thud', car.pos);
      g.addDanger(car.pos, 12, 1.5);
    }
  }

  /** Bowl over anything in the car's path. */
  ram(dt, speed) {
    const g = this.game;
    const car = this.car;
    for (const [e, t] of this.hits) {
      if (t - dt <= 0) this.hits.delete(e);
      else this.hits.set(e, t - dt);
    }
    const c = car.centerInto(tmp);
    for (const e of g.entities.query(c, 2.7, (x) => x !== car && !x.removed && !x.carried && !this.hits.has(x))) {
      if (e.kind === 'drone' || e.kind === 'cat') continue;
      if (e.pos.y > car.pos.y + 2.2) continue;
      // only things roughly in front of or beside the car, not behind it
      const ahead = (e.pos.x - car.pos.x) * car.vel.x + (e.pos.z - car.pos.z) * car.vel.z;
      if (ahead < -0.5 * speed) continue;
      this.hits.set(e, 0.6);
      const dir = car.vel.clone().setY(0).normalize();
      if (e.kind === 'car') {
        // shove the other car aside, both get dented
        e.driving = false;
        const knock = dir.multiplyScalar(speed * 0.85 * e.mass).setY((3 + speed * 0.12) * e.mass);
        e.damage(speed * 1.6, { type: 'impact', knock });
        car.damage(speed * 0.35, { type: 'impact' });
        car.vel.x *= 0.55;
        car.vel.z *= 0.55;
        g.audio.play('crunch', e.pos);
        g.rig.shake = Math.max(g.rig.shake, 0.4);
        g.effects.sparks(e.centerInto(new THREE.Vector3()), 10);
        continue;
      }
      if (!e.alive && e.kind !== 'prop') continue;
      const knock = dir.multiplyScalar(speed * 0.9 * Math.max(1, e.mass)).setY((5 + speed * 0.25) * Math.max(1, e.mass));
      const dealt = e.damage(speed * 2.6, { type: 'impact', knock, source: g.player });
      if (dealt > 0) g.markers.damageNumber(e.centerInto(new THREE.Vector3()), dealt, '#ffd34d');
      g.audio.play(speed > 15 ? 'punchHeavy' : 'thud', e.pos);
      g.effects.impact(e.centerInto(new THREE.Vector3()), null, Math.min(1.5, speed / 20));
      if (speed > 15) g.hitStop(0.04);
      car.vel.x *= e.boss ? 0.3 : 0.92;
      car.vel.z *= e.boss ? 0.3 : 0.92;
      if (e.boss) car.damage(speed * 0.6, { type: 'impact' });
    }
  }
}
