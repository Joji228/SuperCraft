// Cars that drive the road grid with basic lane following, turn at intersections
// and stop when something is in the way. Once knocked about, a car becomes a
// physics object you can punch, freeze, carry and throw.
import * as THREE from 'three';
import { Entity } from '../entities/Entity.js';
import { CITY } from '../world/CityGenerator.js';

const { O, CELL, NC, RIVER_ROW, BRIDGE_ROAD, G } = CITY;
const COLORS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0xecf0f1, 0x2c3e50, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xc0392b, 0x7f8c8d];
const road = (i) => O + i * CELL;
const laneX = (col, dir) => road(col) + (dir > 0 ? 2 : 6); // moving along z
const laneZ = (row, dir) => road(row) + (dir > 0 ? 6 : 2); // moving along x
const riverSeg = (col, a, b) => col !== BRIDGE_ROAD && Math.min(a, b) === RIVER_ROW && Math.max(a, b) === RIVER_ROW + 1;

export class Car extends Entity {
  constructor(game, color = COLORS[Math.floor(Math.random() * COLORS.length)]) {
    super(game, { halfW: 1.0, height: 1.5, health: 120, team: 'neutral', kind: 'car' });
    this.mass = 8;
    this.carryable = true;
    this.carryHeavy = true;
    this.throwable = true;
    this.carryLabel = 'Car';
    this.friction = 3;
    this.canStep = false;
    this.driving = false;
    this.speed = 0;
    this.cruise = 9 + Math.random() * 3;
    this.stuck = 0;
    this.ghost = 0;
    this.dent = 0;
    this.burnt = false;
    this.color = color;
    this.boxes = [
      { y: 0.62, w: 2.0, h: 0.72, d: 4.2, color },
      { y: 1.28, z: -0.25, w: 1.8, h: 0.62, d: 2.2, color: 0x23303f },
      { y: 1.62, z: -0.25, w: 1.82, h: 0.08, d: 2.0, color },
      { y: 0.32, x: 0.92, z: 1.35, w: 0.3, h: 0.64, d: 0.64, color: 0x1c1c1c },
      { y: 0.32, x: -0.92, z: 1.35, w: 0.3, h: 0.64, d: 0.64, color: 0x1c1c1c },
      { y: 0.32, x: 0.92, z: -1.35, w: 0.3, h: 0.64, d: 0.64, color: 0x1c1c1c },
      { y: 0.32, x: -0.92, z: -1.35, w: 0.3, h: 0.64, d: 0.64, color: 0x1c1c1c },
      { y: 0.7, x: 0.62, z: 2.11, w: 0.42, h: 0.2, d: 0.04, color: 0xfff6c8, glow: true },
      { y: 0.7, x: -0.62, z: 2.11, w: 0.42, h: 0.2, d: 0.04, color: 0xfff6c8, glow: true },
      { y: 0.72, x: 0.66, z: -2.11, w: 0.34, h: 0.18, d: 0.04, color: 0xff2a2a, glow: true },
      { y: 0.72, x: -0.66, z: -2.11, w: 0.34, h: 0.18, d: 0.04, color: 0xff2a2a, glow: true },
    ];
    this.sensesColor = null;
  }

  get canFreeze() {
    return false;
  }

  /** Put the car on a lane: axis 'x'|'z', dir ±1, road index, position along the axis. */
  place(axis, dir, roadIdx, s) {
    this.driving = true;
    this.axis = axis;
    this.dir = dir;
    this.road = roadIdx;
    this.L = axis === 'x' ? laneZ(roadIdx, dir) : laneX(roadIdx, dir);
    this.s = s;
    this.speed = this.cruise * 0.6;
    this.planNext();
    this.syncPos();
  }

  syncPos() {
    if (this.axis === 'x') this.pos.set(this.s, G, this.L);
    else this.pos.set(this.L, G, this.s);
    this.yaw = this.axis === 'x' ? (this.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : this.dir > 0 ? 0 : Math.PI;
  }

  /** Choose what to do at the next intersection. */
  planNext() {
    const k = Math.floor((this.s - O) / CELL);
    this.nextC = this.dir > 0 ? k + 1 : k;
    const c = this.nextC;
    const r = this.road;
    const opts = [];
    // straight on
    const c2 = c + this.dir;
    if (c2 >= 0 && c2 <= NC && !(this.axis === 'z' && riverSeg(r, c, c2))) opts.push({ straight: true }, { straight: true });
    // turns onto the cross road
    for (const d2 of [1, -1]) {
      const r2 = r + d2;
      if (r2 < 0 || r2 > NC) continue;
      if (this.axis === 'x' && riverSeg(c, r, r2)) continue; // would drive into the river
      opts.push({ axis: this.axis === 'x' ? 'z' : 'x', dir: d2 });
    }
    if (!opts.length) opts.push({ uturn: true });
    this.plan = opts[Math.floor(Math.random() * opts.length)];
    if (this.plan.axis) {
      this.turnAt = this.plan.axis === 'z' ? laneX(c, this.plan.dir) : laneZ(c, this.plan.dir);
    } else if (this.plan.uturn) {
      this.turnAt = road(c) - (this.dir > 0 ? 3 : -11);
    } else {
      this.turnAt = this.dir > 0 ? road(c) + 8 : road(c);
    }
    // if we're past (or inside) the intersection already, just go straight
    if ((this.s - this.turnAt) * this.dir > 0) {
      this.plan = { straight: true };
      this.turnAt = this.dir > 0 ? road(c) + 8 : road(c);
    }
  }

  blocked() {
    const g = this.game;
    const fx = this.axis === 'x' ? this.dir : 0, fz = this.axis === 'z' ? this.dir : 0;
    const ax = this.pos.x + fx * 4.5, az = this.pos.z + fz * 4.5;
    const p = g.player;
    if (Math.abs(p.pos.x - ax) < 2.6 && Math.abs(p.pos.z - az) < 2.6 && p.pos.y < G + 3) return 'player';
    for (const e of g.entities.list) {
      if (e === this || e.removed || e.carried) continue;
      if (e.kind !== 'car' && !e.look) continue;
      if (e.kind === 'car' && this.ghost > 0) continue;
      const dx = e.pos.x - ax, dz = e.pos.z - az;
      const r = e.kind === 'car' ? 2.6 : 1.8;
      if (Math.abs(dx) < r && Math.abs(dz) < r && Math.abs(e.pos.y - this.pos.y) < 3) return e.kind === 'car' ? 'car' : 'person';
    }
    return null;
  }

  drive(dt) {
    this.ghost = Math.max(0, this.ghost - dt);
    const b = this.blocked();
    const target = b ? 0 : this.cruise;
    this.speed += (target - this.speed) * (1 - Math.exp(-(b ? 6 : 1.5) * dt));
    if (b && this.speed < 0.5) {
      this.stuck += dt;
      if (b === 'player' && Math.random() < dt * 0.4) this.game.audio.play('horn', this.pos);
      if (b !== 'player' && this.stuck > 4) {
        this.ghost = 2;
        this.stuck = 0;
      }
    } else this.stuck = 0;

    const prev = this.s;
    this.s += this.speed * this.dir * dt;
    // reached the turning point?
    if ((this.s - this.turnAt) * this.dir >= 0 && (prev - this.turnAt) * this.dir < 0) {
      if (this.plan.axis) {
        const oldL = this.L;
        this.axis = this.plan.axis;
        this.dir = this.plan.dir;
        this.road = this.nextC;
        this.L = this.turnAt;
        this.s = oldL;
        this.speed *= 0.6;
      } else if (this.plan.uturn) {
        this.dir = -this.dir;
        this.L = this.axis === 'x' ? laneZ(this.road, this.dir) : laneX(this.road, this.dir);
      }
      this.planNext();
    }
    this.syncPos();
  }

  update(dt) {
    this.age += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.frozen > 0) this.frozen = Math.max(0, this.frozen - dt);
    // anything that shoves the car takes it off the road for good
    if (this.driving && (this.carried || this.vel.lengthSq() > 4)) this.driving = false;
    if (this.driving && this.alive) this.drive(dt);
    else this.physics(dt);
    if (this.burnt && Math.random() < dt * 4) this.game.effects.smoke(this.center, 1, 0.7, 0.15);
  }

  damage(amount, opts = {}) {
    if (opts.knock) this.driving = false;
    const dealt = super.damage(amount, opts);
    this.dent = Math.min(1, 1 - this.health / this.maxHealth);
    return dealt;
  }

  onImpact(speed) {
    this.thrown = false;
    if (speed > 10) {
      this.damage(speed * 1.5, { type: 'impact' });
      this.game.audio.play('crunch', this.pos);
      this.game.rig.shake = Math.max(this.game.rig.shake, 0.3);
      this.game.effects.dust(this.pos, 16, 1.5);
    }
  }

  onBreath(dt, fall) {
    if (fall > 0.3) this.driving = false;
  }

  onDefeated() {
    this.burnt = true;
    this.driving = false;
    this.carryLabel = 'Wrecked car';
    for (const b of this.boxes) if (b.glow) b.hidden = true;
    const c = this.centerInto(new THREE.Vector3());
    this.game.explode(c, 5, 25, this);
    this.game.fires.ignite(c.clone().setY(c.y + 0.6), { intensity: 0.8, burnout: 25 });
    this.game.events.emit('carDestroyed', this);
  }
}

export class Traffic {
  constructor(game) {
    this.game = game;
    this.target = 22;
    this.timer = 0;
  }

  /** Spawn a car on a random lane segment near (cx, cz). */
  spawnNear(cx, cz, minR, maxR) {
    const g = this.game;
    for (let tries = 0; tries < 12; tries++) {
      const axis = Math.random() < 0.5 ? 'x' : 'z';
      const dir = Math.random() < 0.5 ? 1 : -1;
      const near = axis === 'x' ? cz : cx;
      const along = axis === 'x' ? cx : cz;
      const ri = Math.round((near - O) / CELL + (Math.random() - 0.5) * 6);
      if (ri < 0 || ri > NC) continue;
      const seg = Math.floor((along - O) / CELL + (Math.random() - 0.5) * 6);
      if (seg < 0 || seg >= NC) continue;
      // no driving along the river's edge segment of non-bridge columns
      if (axis === 'z' && riverSeg(ri, seg, seg + 1)) continue;
      const s = road(seg) + 12 + Math.random() * (CELL - 20);
      const car = new Car(g);
      car.place(axis, dir, ri, s);
      const d = Math.hypot(car.pos.x - cx, car.pos.z - cz);
      if (d < minR || d > maxR) continue;
      if (g.entities.nearest(car.pos, 7, (e) => e.kind === 'car')) continue;
      return g.entities.add(car);
    }
    return null;
  }

  update(dt, focus) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.6;
    const g = this.game;
    let n = 0;
    for (const e of g.entities.list) {
      if (e.kind !== 'car' || e.removed || e.persistent) continue;
      const d = Math.hypot(e.pos.x - focus.x, e.pos.z - focus.z);
      if (d > 170 && !e.carried) e.remove();
      else if (e.driving) n++;
    }
    for (let i = n; i < this.target && i < n + 3; i++) this.spawnNear(focus.x, focus.z, n < 6 ? 25 : 60, 150);
  }
}
