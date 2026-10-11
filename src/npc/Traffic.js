// Cars that drive the road grid with basic lane following, turn at intersections
// and stop when something is in the way. Once knocked about, a car becomes a
// physics object you can punch, freeze, carry and throw.
import * as THREE from 'three';
import { Entity } from '../entities/Entity.js';
import { CITY } from '../world/CityGenerator.js';
import { B } from '../world/Blocks.js';

const ROAD_BLOCKS = new Set([B.ASPHALT, B.LINE_X_HI, B.LINE_X_LO, B.LINE_Z_HI, B.LINE_Z_LO, B.CROSS_X, B.CROSS_Z, B.SIDEWALK, B.SCORCH]);

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

  /**
   * Junction reservation: only one car at a time inside an intersection, so crossing
   * traffic can't drive into each other. Returns false if we must wait.
   */
  claimJunction() {
    const nodes = this.game.traffic.nodes;
    // let go of the junction we've just left
    if (this.heldKey && (Math.abs(this.pos.x - this.heldX) > 8.5 || Math.abs(this.pos.z - this.heldZ) > 8.5)) {
      if (nodes.get(this.heldKey) === this) nodes.delete(this.heldKey);
      this.heldKey = null;
    }
    const c = this.nextC;
    if (c < 0 || c > NC) return true;
    const col = this.axis === 'x' ? c : this.road;
    const row = this.axis === 'x' ? this.road : c;
    const key = col * 100 + row;
    if (key === this.heldKey) return true;
    const along = (road(c) + 4 - this.s) * this.dir;
    if (along > 9.5 || along < -4) return true;
    const owner = nodes.get(key);
    if (owner && owner !== this && !owner.removed && owner.heldKey === key) return false;
    nodes.set(key, this);
    this.heldKey = key;
    this.heldX = road(col) + 4;
    this.heldZ = road(row) + 4;
    return true;
  }

  remove() {
    if (this.heldKey != null && this.game.traffic?.nodes.get(this.heldKey) === this) this.game.traffic.nodes.delete(this.heldKey);
    super.remove();
  }

  /** Anything in a cone in front of the car, using real positions (so turning cars and
   *  crashed cars are seen too). */
  blocked() {
    const g = this.game;
    const fx = this.axis === 'x' ? this.dir : 0, fz = this.axis === 'z' ? this.dir : 0;
    const test = (x, z, reach, width) => {
      const dx = x - this.pos.x, dz = z - this.pos.z;
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      return along > 0 && along < reach && side < width;
    };
    const p = g.player;
    if (p.pos.y < G + 3 && test(p.pos.x, p.pos.z, 6.5, 2.2)) return 'player';
    for (const e of g.entities.list) {
      if (e === this || e.removed || e.carried) continue;
      if (Math.abs(e.pos.y - this.pos.y) > 3) continue;
      if (e.kind === 'car') {
        if (test(e.pos.x, e.pos.z, 7.5, 2.4)) return 'car';
      } else if (e.look || e.kind === 'prop') {
        if (test(e.pos.x, e.pos.z, 5.5, 1.8)) return 'person';
      }
    }
    return null;
  }

  drive(dt) {
    // self-heal: if the planned turn point is somehow behind us, plan again from here
    if ((this.s - this.turnAt) * this.dir > 1.5) this.planNext();
    const b = this.claimJunction() ? this.blocked() : 'car';
    const target = b ? 0 : this.cruise;
    this.speed += (target - this.speed) * (1 - Math.exp(-(b ? 6 : 1.5) * dt));
    if (b && this.speed < 0.5) {
      this.stuck += dt;
      if (b === 'player' && Math.random() < dt * 0.4) this.game.audio.play('horn', this.pos);
      // gridlocked out of sight: quietly take this car off the road (it respawns elsewhere)
      const far = this.pos.distanceTo(this.game.player.pos) > 35;
      if (b !== 'player' && !this.persistent && ((this.stuck > 6 && far) || this.stuck > 15)) {
        if (!far) this.game.effects.dust(this.pos, 10, 1);
        this.remove();
      }
    } else this.stuck = 0;

    const prev = this.s;
    this.s += this.speed * this.dir * dt;
    // reached the turning point?
    if ((this.s - this.turnAt) * this.dir >= 0 && (prev - this.turnAt) * this.dir < 0) {
      if (this.plan.axis) {
        // wait if the lane we're turning into is occupied right there
        const nx = this.plan.axis === 'z' ? this.turnAt : this.L;
        const nz = this.plan.axis === 'z' ? this.L : this.turnAt;
        const clash = this.game.entities.list.some((e) => e !== this && e.kind === 'car' && !e.removed && Math.hypot(e.pos.x - nx, e.pos.z - nz) < 4.2);
        if (clash) {
          this.s = prev;
          this.speed = 0;
          this.syncPos();
          return;
        }
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
    else {
      if (this.heldKey != null) {
        if (this.game.traffic.nodes.get(this.heldKey) === this) this.game.traffic.nodes.delete(this.heldKey);
        this.heldKey = null;
      }
      this.physics(dt);
    }
    // cars can't float: one that ends up on the water sinks (missions handle their own)
    if (!this.carried && !this.persistent && this.onGround) {
      const under = this.game.world.get(Math.floor(this.pos.x), Math.floor(this.pos.y) - 1, Math.floor(this.pos.z));
      if (under === B.WATER || under === B.ICE) {
        this.sinkTime = (this.sinkTime || 0) + dt;
        this.visualLift = -this.sinkTime * 0.5;
        if (Math.random() < dt * 10) this.game.effects.steam(this.pos, 1);
        if (this.sinkTime > 3) this.remove();
      } else if (this.sinkTime) {
        this.sinkTime = 0;
        this.visualLift = 0;
      }
    }
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
    this.nodes = new Map(); // junction key -> car currently crossing it
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
      if (g.entities.nearest(car.pos, 9, (e) => e.kind === 'car')) continue;
      if (!ROAD_BLOCKS.has(g.world.get(Math.floor(car.pos.x), G - 1, Math.floor(car.pos.z)))) continue;
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
      else if (e.driving && !ROAD_BLOCKS.has(g.world.get(Math.floor(e.pos.x), G - 1, Math.floor(e.pos.z)))) e.remove(); // off the road somehow
      else if (e.driving) n++;
    }
    for (let i = n; i < this.target && i < n + 3; i++) this.spawnNear(focus.x, focus.z, n < 6 ? 25 : 60, 150);
  }
}
