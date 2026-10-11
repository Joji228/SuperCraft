// Civilians: walk the sidewalks, panic and flee from danger, cheer when saved.
import * as THREE from 'three';
import { Humanoid, randomLook } from '../entities/Humanoid.js';
import { B } from '../world/Blocks.js';
import { CITY } from '../world/CityGenerator.js';

const WALKABLE = new Set([B.SIDEWALK, B.STONE_BEIGE, B.CONCRETE]);
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const tmp = new THREE.Vector3();

export class Civilian extends Humanoid {
  constructor(game, x, y, z, opts = {}) {
    super(game, { health: 40, team: 'civ', kind: 'civilian', look: opts.look || randomLook() });
    this.pos.set(x, y, z);
    this.state = opts.state || 'walk'; // walk | panic | cheer | trapped | held | down | idle
    this.dir = DIRS[Math.floor(Math.random() * 4)];
    this.speed = 1.4 + Math.random() * 0.6;
    this.timer = 0;
    this.fleeFrom = new THREE.Vector3();
    this.carryLabel = 'Civilian';
    this.throwable = false;
    this.mass = 1;
    this.saved = false;
    this.screamCd = 0;
    this.carryWhenDown = true;
    this.sensesColor = () => (this.inDanger ? '#ffd34d' : null);
  }

  get canFreeze() {
    return false;
  }

  get inDanger() {
    return this.alive && (this.state === 'panic' || this.state === 'trapped' || this.state === 'held' || this.health < this.maxHealth * 0.6) && !this.saved;
  }

  cheer(seconds = 2.5) {
    if (!this.alive) return;
    this.state = 'cheer';
    this.timer = seconds;
    this.vel.x = this.vel.z = 0;
    this.game.audio.play('cheer', this.pos);
  }

  panic(from, seconds = 6) {
    if (!this.alive || this.state === 'trapped' || this.state === 'held' || this.carried || this.saved) return;
    if (this.state !== 'panic' && this.screamCd <= 0 && Math.random() < 0.3) {
      this.game.audio.play('scream', this.pos);
      this.screamCd = 4;
    }
    this.state = 'panic';
    this.timer = seconds;
    this.fleeFrom.copy(from);
  }

  onDefeated() {
    this.state = 'down';
    this.down = true;
    this.armsUp = false;
    this.game.audio.play('ko', this.pos);
    this.game.events.emit('civilianLost', this);
  }

  onPickedUp() {
    this.armsUp = true;
    if (this.state !== 'down') this.state = 'carried';
  }

  onDropped() {
    this.armsUp = false;
    if (this.alive) this.state = 'idle';
    this.timer = 1.5;
  }

  canWalk(x, z) {
    const w = this.game.world;
    const bx = Math.floor(x), bz = Math.floor(z);
    return WALKABLE.has(w.get(bx, CITY.G - 1, bz)) && w.get(bx, CITY.G, bz) === B.AIR && w.get(bx, CITY.G + 1, bz) === B.AIR;
  }

  update(dt) {
    this.screamCd -= dt;
    this.timer -= dt;
    if (this.alive && !this.carried && (this.state === 'walk' || this.state === 'idle' || this.state === 'panic')) {
      for (const d of this.game.dangers) {
        const dx = d.pos.x - this.pos.x, dz = d.pos.z - this.pos.z;
        if (dx * dx + dz * dz < d.radius * d.radius && Math.abs(d.pos.y - this.pos.y) < d.radius) {
          this.panic(d.pos);
          break;
        }
      }
    }
    let wantX = 0, wantZ = 0, speed = 0;
    this.armsUp = false;
    if (this.carried) {
      this.armsUp = true;
    } else if (!this.alive) {
      // lying on the ground
    } else if (this.frozen > 0) {
      // statue
    } else if (this.state === 'walk' && this.pos.y < CITY.G + 0.5) {
      const ax = this.pos.x + this.dir[0] * 0.9, az = this.pos.z + this.dir[1] * 0.9;
      if (!this.canWalk(ax, az) || this.hitWall || Math.random() < dt * 0.02) this.turn();
      wantX = this.dir[0];
      wantZ = this.dir[1];
      speed = this.speed;
    } else if (this.state === 'walk') {
      speed = 0; // somewhere odd (rooftop, dropped): just stand
    } else if (this.state === 'panic') {
      this.armsUp = true;
      tmp.copy(this.pos).sub(this.fleeFrom).setY(0);
      if (tmp.lengthSq() < 0.01) tmp.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      tmp.normalize();
      if (this.hitWall) {
        // dodge sideways around obstacles
        const s = Math.random() < 0.5 ? 1 : -1;
        tmp.set(-tmp.z * s, 0, tmp.x * s);
      }
      wantX = tmp.x;
      wantZ = tmp.z;
      speed = 5.5;
      if (this.timer <= 0) this.state = 'walk';
    } else if (this.state === 'cheer') {
      this.armsUp = true;
      if (this.onGround && Math.random() < dt * 3) this.vel.y = 5;
      if (this.timer <= 0) this.state = 'walk';
    } else if (this.state === 'trapped' || this.state === 'held') {
      this.armsUp = this.state === 'trapped';
      if (this.state === 'trapped' && Math.random() < dt * 0.15) this.game.audio.play('scream', this.pos);
    } else if (this.state === 'idle') {
      if (this.timer <= 0) this.state = 'walk';
    }

    if (speed > 0) {
      const k = 1 - Math.exp(-8 * dt);
      this.vel.x += (wantX * speed - this.vel.x) * k;
      this.vel.z += (wantZ * speed - this.vel.z) * k;
      this.yaw = Math.atan2(this.vel.x, this.vel.z);
    }
    super.update(dt);
    if (this.carried) this.armsUp = true;
  }

  turn() {
    const opts = DIRS.filter((d) => d !== this.dir && this.canWalk(this.pos.x + d[0] * 0.9, this.pos.z + d[1] * 0.9));
    const back = DIRS.find((d) => d[0] === -this.dir[0] && d[1] === -this.dir[1]);
    const nonBack = opts.filter((d) => d !== back);
    this.dir = nonBack.length ? nonBack[Math.floor(Math.random() * nonBack.length)] : opts[0] || back;
    // snap to the middle of the sidewalk cell so people don't hug walls
    if (this.dir[0] !== 0) this.pos.z = Math.floor(this.pos.z) + 0.5;
    else this.pos.x = Math.floor(this.pos.x) + 0.5;
  }
}

/** Keeps a crowd of pedestrians around the hero. */
export class Crowd {
  constructor(game) {
    this.game = game;
    this.target = 40;
    this.timer = 0;
  }

  spawnNear(cx, cz, minR, maxR) {
    const g = this.game;
    for (let tries = 0; tries < 20; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = minR + Math.random() * (maxR - minR);
      const x = Math.floor(cx + Math.cos(a) * r) + 0.5;
      const z = Math.floor(cz + Math.sin(a) * r) + 0.5;
      const w = g.world;
      if (WALKABLE.has(w.get(Math.floor(x), CITY.G - 1, Math.floor(z))) && w.get(Math.floor(x), CITY.G, Math.floor(z)) === B.AIR) {
        return g.entities.add(new Civilian(g, x, CITY.G, z));
      }
    }
    return null;
  }

  update(dt, focus) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    const g = this.game;
    let n = 0;
    for (const e of g.entities.list) {
      if (e.kind !== 'civilian' || e.removed || e.persistent) continue;
      const d = Math.hypot(e.pos.x - focus.x, e.pos.z - focus.z);
      if (d > 150 && !e.carried) e.remove();
      else if (!e.alive && e.age > 30 && d > 40) e.remove();
      else n++;
    }
    for (let i = n; i < this.target && i < n + 4; i++) this.spawnNear(focus.x, focus.z, n < 10 ? 15 : 45, 120);
  }
}
