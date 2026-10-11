// Free Roam random events: muggings, car crashes, building fires, drone attacks and a mini-boss.
import * as THREE from 'three';
import { Thug } from '../enemies/Thug.js';
import { Drone } from '../enemies/Drone.js';
import { Brute } from '../enemies/Boss.js';
import { Civilian } from '../npc/Civilians.js';
import { Car } from '../npc/Traffic.js';
import { CITY } from '../world/CityGenerator.js';
import { findStreetSpot, nearestIntersection, buildingsNear, facadePoints, isStreet } from './spots.js';

let nextId = 1;

class GameEvent {
  constructor(game, pos) {
    this.game = game;
    this.id = 'ev' + nextId++;
    this.pos = pos.clone();
    this.status = 'active';
    this.time = 0;
    this.timeLimit = 150;
    this.entities = [];
    this.zones = [];
    this.tag = this.id;
  }

  add(e) {
    e.tags.add(this.tag);
    e.persistent = true;
    this.entities.push(e);
    return this.game.entities.add(e);
  }

  /** Entities with this event's tag that are still standing. */
  alive(filter) {
    return this.entities.filter((e) => !e.removed && e.alive && (!filter || filter(e)));
  }

  update(dt) {
    this.time += dt;
    if (this.time > this.timeLimit) this.status = 'failed';
  }

  end() {
    for (const e of this.entities) e.persistent = false;
    for (const z of this.zones) this.game.zones.remove(z);
    this.game.markers.removePin(this.id);
  }

  pinPos() {
    return this.pos.clone().setY(this.pos.y + 3);
  }
}

class Mugging extends GameEvent {
  constructor(game, pos) {
    super(game, pos);
    this.title = 'Mugging';
    this.desc = 'A mugging is in progress!';
    const g = game;
    const victim = this.add(new Civilian(g, pos.x, pos.y, pos.z, { state: 'held' }));
    this.victim = victim;
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const t = this.add(new Thug(g, pos.x + Math.cos(a) * 2.2, pos.y, pos.z + Math.sin(a) * 2.2, { aggro: 18 }));
      t.victim = victim;
      t.unstick();
    }
  }

  update(dt) {
    super.update(dt);
    if (this.alive((e) => e.team === 'enemy').length === 0) {
      this.status = 'done';
      if (this.victim.alive) {
        this.victim.state = 'walk';
        this.victim.cheer(3);
        this.game.events.emit('civilianSaved', this.victim);
      }
    } else if (!this.victim.alive) this.status = 'failed';
  }

  end() {
    for (const e of this.entities) if (e.victim) e.victim = null;
    if (this.status === 'failed') for (const e of this.alive((x) => x.team === 'enemy')) e.state = 'flee';
    super.end();
  }
}

class CarCrash extends GameEvent {
  constructor(game, pos) {
    super(game, pos);
    this.title = 'Car crash';
    this.desc = 'A crash! Put out the fire and get the driver to safety.';
    const g = game;
    const a = this.add(new Car(g));
    a.pos.set(pos.x - 1.2, pos.y, pos.z);
    a.yaw = 0.6;
    a.dent = 0.6;
    a.health = 50;
    const b = this.add(new Car(g));
    b.pos.set(pos.x + 2.2, pos.y, pos.z + 2.6);
    b.yaw = -1.1;
    b.dent = 0.5;
    b.health = 60;
    this.fire = g.fires.ignite(new THREE.Vector3(pos.x - 1.2, pos.y + 1.3, pos.z), { intensity: 1, size: 1.3, tag: this.tag, persistent: true });
    const driver = this.add(new Civilian(g, pos.x - 1.2 + 2, pos.y, pos.z - 1.5, { state: 'trapped' }));
    driver.carryLabel = 'Injured driver';
    driver.health = 25;
    this.driver = driver;
    // ambulance zone a bit down the street
    const zp = findStreetSpot(g.world, pos.x, pos.z, 12, 22, 2) || pos.clone().add(new THREE.Vector3(14, 0, 0));
    this.zones.push(g.zones.add(zp, { radius: 3.5, label: 'Ambulance' }));
  }

  update(dt) {
    super.update(dt);
    const fireOut = this.game.fires.count(this.tag) === 0;
    if (!this.driver.alive) this.status = 'failed';
    else if (fireOut && this.driver.saved) {
      this.status = 'done';
    }
    this.desc = fireOut ? 'Carry the driver to the ambulance.' : 'Put out the fire (Q) and rescue the driver.';
  }
}

class BuildingFire extends GameEvent {
  constructor(game, pos, building) {
    super(game, pos);
    this.title = 'Building fire';
    this.desc = 'A building is on fire! Put it out and rescue anyone on the roof.';
    this.timeLimit = 200;
    const g = game;
    const pts = facadePoints(g.world, building, 7, CITY.G + 3, Math.min(building.top - 2, CITY.G + 30));
    for (const p of pts) g.fires.ignite(p.pos, { intensity: 1, size: 1.2, spread: true, tag: this.tag, persistent: true });
    this.trapped = [];
    // someone stuck on the roof
    const tier = building.tiers[building.tiers.length - 1];
    const rx = Math.floor((tier[0] + tier[2]) / 2) + 0.5, rz = Math.floor((tier[1] + tier[3]) / 2) + 0.5;
    const ry = g.world.surfaceY(Math.floor(rx), Math.floor(rz)) + 1;
    if (ry > CITY.G + 4) {
      const c = this.add(new Civilian(g, rx, ry, rz, { state: 'trapped' }));
      c.unstick();
      this.trapped.push(c);
    }
    this.pos.copy(pts[0]?.pos || pos);
    const zp = findStreetSpot(g.world, pos.x, pos.z, 6, 20, 2) || pos.clone();
    this.zones.push(g.zones.add(zp, { radius: 3.5, label: 'Safety' }));
  }

  update(dt) {
    super.update(dt);
    const left = this.game.fires.count(this.tag);
    const waiting = this.trapped.filter((c) => c.alive && !c.saved).length;
    if (this.trapped.some((c) => !c.alive)) this.status = 'failed';
    else if (left === 0 && waiting === 0) this.status = 'done';
    this.desc = `Fires left: ${left}${waiting ? ` · people on the roof: ${waiting}` : ''}`;
    const f = this.game.fires.list.find((x) => x.tag === this.tag);
    if (f) this.pos.copy(f.pos);
  }

  end() {
    if (this.status !== 'done') for (const f of this.game.fires.list) if (f.tag === this.tag) f.burnout = f.age + 10;
    super.end();
  }
}

class DroneAttack extends GameEvent {
  constructor(game, pos) {
    super(game, pos);
    this.title = 'Drone attack';
    this.desc = 'Rogue drones are attacking people!';
    const g = game;
    const victims = [];
    for (let i = 0; i < 4; i++) {
      const c = this.add(new Civilian(g, pos.x + (Math.random() - 0.5) * 8, pos.y, pos.z + (Math.random() - 0.5) * 8));
      c.unstick();
      c.panic(pos, 30);
      victims.push(c);
    }
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const d = this.add(new Drone(g, pos.x + (Math.random() - 0.5) * 10, pos.y + 8, pos.z + (Math.random() - 0.5) * 10, { target: victims[i % victims.length] }));
      d.range = 6;
    }
  }

  update(dt) {
    super.update(dt);
    if (this.alive((e) => e.kind === 'drone').length === 0) {
      this.status = 'done';
      for (const c of this.alive((e) => e.kind === 'civilian')) c.cheer(3);
    }
    const d = this.alive((e) => e.kind === 'drone')[0];
    if (d) this.pos.copy(d.pos).setY(d.pos.y - 3);
  }
}

class MiniBoss extends GameEvent {
  constructor(game, pos) {
    super(game, pos);
    this.title = 'The Brute';
    this.desc = 'A super-strong villain is smashing up the street!';
    this.timeLimit = 240;
    const g = game;
    this.boss = this.add(new Brute(g, pos.x, pos.y, pos.z));
    this.boss.unstick();
    for (let i = 0; i < 2; i++) {
      const t = this.add(new Thug(g, pos.x + (i ? 4 : -4), pos.y, pos.z + 3, { weapon: 'gun' }));
      t.unstick();
    }
    const c = this.add(new Car(g));
    c.pos.set(pos.x + 5, pos.y, pos.z - 3);
    c.yaw = 1.2;
  }

  update(dt) {
    super.update(dt);
    if (!this.boss.alive) this.status = 'done';
    if (!this.boss.removed) this.pos.copy(this.boss.pos);
  }
}

const TYPES = [
  { cls: Mugging, weight: 3 },
  { cls: CarCrash, weight: 2 },
  { cls: BuildingFire, weight: 2 },
  { cls: DroneAttack, weight: 2 },
  { cls: MiniBoss, weight: 1, minDone: 2 },
];

export class EventDirector {
  constructor(game, stats) {
    this.game = game;
    this.stats = stats;
    this.events = [];
    this.timer = 12;
    this.maxActive = 2;
  }

  pick() {
    const ok = TYPES.filter((t) => !t.minDone || this.stats.events >= t.minDone);
    const total = ok.reduce((s, t) => s + t.weight, 0);
    let r = Math.random() * total;
    for (const t of ok) if ((r -= t.weight) <= 0) return t.cls;
    return Mugging;
  }

  spawn(cls) {
    const g = this.game;
    const p = g.player.pos;
    let ev = null;
    if (cls === BuildingFire) {
      const blds = buildingsNear(g.world, p.x, p.z, 200, (b) => b.top > CITY.G + 14 && Math.hypot((b.x0 + b.x1) / 2 - p.x, (b.z0 + b.z1) / 2 - p.z) > 50);
      if (!blds.length) return null;
      const b = blds[Math.floor(Math.random() * blds.length)];
      const pos = findStreetSpot(g.world, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, (b.x1 - b.x0) / 2 + 2, (b.x1 - b.x0) / 2 + 14, 1);
      if (!pos) return null;
      ev = new BuildingFire(g, pos, b);
    } else if (cls === CarCrash) {
      const spot = findStreetSpot(g.world, p.x, p.z, 70, 170, 3);
      if (!spot) return null;
      const pos = nearestIntersection(spot.x, spot.z);
      if (!isStreet(g.world, pos.x, pos.z)) return null;
      ev = new CarCrash(g, pos);
    } else {
      const pos = findStreetSpot(g.world, p.x, p.z, 70, 170, 2);
      if (!pos) return null;
      ev = new cls(g, pos);
    }
    this.events.push(ev);
    g.hud.toast(`ALERT: ${ev.title}!`, 'alert', 4);
    g.audio.play('alert');
    return ev;
  }

  clear() {
    for (const ev of this.events) ev.end();
    this.events = [];
  }

  update(dt) {
    const g = this.game;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 25 + Math.random() * 25;
      if (this.events.length < this.maxActive) this.spawn(this.pick());
    }
    for (const ev of [...this.events]) {
      ev.update(dt);
      if (ev.status === 'active') {
        g.markers.setPin(ev.id, ev.pinPos(), ev.title, 'event');
        continue;
      }
      if (ev.status === 'done') {
        this.stats.events++;
        g.hud.toast(`${ev.title}: handled! Well done.`, 'good', 4);
        g.audio.melody([[3, 1], [7, 1], [10, 1], [15, 3]], { bpm: 480 });
        g.effects.confetti(ev.pos, 30);
        g.events.emit('eventDone', ev);
      } else {
        g.hud.toast(`${ev.title}: too late...`, 'warn', 4);
      }
      ev.end();
      this.events = this.events.filter((x) => x !== ev);
    }
    // the siren gets louder the closer you are to trouble
    let near = Infinity;
    for (const ev of this.events) near = Math.min(near, ev.pos.distanceTo(g.player.pos));
    g.audio.setLoopLevel('siren', this.events.length ? Math.max(0.15, 1 - near / 150) : 0, 0.5);
  }

  markers() {
    return this.events.map((ev) => ({ x: ev.pos.x, z: ev.pos.z, color: '#ff4d4d', shape: 'diamond', size: 5, edge: true }));
  }

  /** Lines for the objectives panel. */
  items() {
    return this.events.map((ev) => {
      const d = Math.round(ev.pos.distanceTo(this.game.player.pos));
      const left = Math.max(0, Math.ceil(ev.timeLimit - ev.time));
      return { text: `<b>${ev.title}</b> ${d} m · ${left}s<br><small>${ev.desc}</small>`, done: false };
    });
  }
}

export const EVENT_TYPES = { Mugging, CarCrash, BuildingFire, DroneAttack, MiniBoss };
