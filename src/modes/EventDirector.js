// Free Roam random events: robberies, car crashes, building fires, drone attacks and a mini-boss.
import * as THREE from 'three';
import { Thug } from '../enemies/Thug.js';
import { Drone } from '../enemies/Drone.js';
import { Brute } from '../enemies/Boss.js';
import { Civilian } from '../npc/Civilians.js';
import { Car } from '../npc/Traffic.js';
import { Ambulance } from '../npc/Ambulance.js';
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
    // how it's marked: ground events get the light beam; fires and drones get their own look
    this.beacon = true;
    this.pinKind = 'event';
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

class Robbery extends GameEvent {
  constructor(game, pos) {
    super(game, pos);
    this.title = 'Robbery';
    this.desc = 'Thieves are robbing someone! Stop them.';
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
    // clear traffic out of the crash site so nothing overlaps
    for (const e of game.entities.query(pos, 10, (x) => x.kind === 'car' && !x.persistent)) e.remove();
    this.title = 'Car crash';
    const g = game;
    // only heroes who can put fires out get a burning wreck; the rest get a smoking one
    this.burning = g.heroCan('douse');
    this.carrier = g.heroCan('carry');
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
    this.wreck = a;
    if (this.burning) this.fire = g.fires.ignite(new THREE.Vector3(pos.x - 1.2, pos.y + 1.3, pos.z), { intensity: 1, size: 1.3, tag: this.tag, persistent: true });
    const driver = this.add(new Civilian(g, pos.x - 1.2 + 2, pos.y, pos.z - 1.5, { state: 'trapped' }));
    driver.carryLabel = 'Injured driver';
    driver.health = 25;
    this.driver = driver;
    // an ambulance pulls up down the street, back doors open towards the crash
    const amb = new Ambulance(g);
    amb.pos.copy(this.ambulanceSpot(g, pos));
    amb.yaw = Math.atan2(amb.pos.x - pos.x, amb.pos.z - pos.z);
    this.ambulance = this.add(amb);
    const zp = amb.dropPoint(new THREE.Vector3());
    this.zones.push(g.zones.add(zp, { radius: 2.6, label: 'Ambulance', onRescue: (e) => amb.load(e) }));
    this.desc = this.describe();
  }

  /** A clear stretch of road leading away from the crossing, on the near lane. */
  ambulanceSpot(g, pos) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => Math.random() - 0.5);
    for (const [dx, dz] of dirs) {
      const x = pos.x + dx * 15 + dz * 1.5, z = pos.z + dz * 15 - dx * 1.5;
      let ok = true;
      for (const s of [-3.5, 0, 3.5]) if (!isStreet(g.world, x + dx * s, z + dz * s)) ok = false;
      if (ok) return new THREE.Vector3(x, pos.y, z);
    }
    return findStreetSpot(g.world, pos.x, pos.z, 12, 22, 2) || pos.clone().add(new THREE.Vector3(15, 0, 0));
  }

  describe() {
    if (this.game.fires.count(this.tag) > 0) {
      const how = this.game.heroId === 'granite' ? 'thunder clap (Q)' : 'super breath (Q)';
      return `The wreck is on fire! Put it out with your ${how}.`;
    }
    if (this.driver.state === 'goto') return 'The driver is limping to the ambulance. Keep them safe.';
    if (this.carrier) return 'Carry the injured driver (G) to the ambulance.';
    return 'Get to the trapped driver and pull them out of the wreck.';
  }

  update(dt) {
    super.update(dt);
    const g = this.game;
    const fireOut = g.fires.count(this.tag) === 0;
    const d = this.driver;
    if (!this.burning && Math.random() < dt * 6) g.effects.smoke(this.wreck.center, 1, 0.8, 0.2);
    // heroes who can't carry people free the driver, who then walks to the ambulance
    if (!this.carrier && fireOut && d.alive && !d.saved && d.state === 'trapped' && d.pos.distanceTo(g.player.pos) < 3.2) {
      d.state = 'goto';
      d.goal = this.ambulance.dropPoint(new THREE.Vector3());
      d.cheer(0.6);
      d.state = 'goto';
      g.hud.toast('Driver freed!', 'good', 2);
    }
    if (d.state === 'goto' && !d.saved && d.alive) {
      const z = this.zones[0];
      if (z && g.zones.inside(z, d.pos)) g.zones.checkDrop(d);
    }
    if (!d.alive) this.status = 'failed';
    else if (fireOut && d.saved) this.status = 'done';
    this.desc = this.describe();
  }
}

class BuildingFire extends GameEvent {
  constructor(game, pos, building) {
    super(game, pos);
    this.title = 'Building fire';
    this.desc = 'A building is on fire! Put it out and rescue anyone on the roof.';
    this.timeLimit = 200;
    this.beacon = false; // the smoke plume and flame marker show where it is
    this.pinKind = 'fire';
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
    this.beacon = false; // each drone gets red target brackets instead
    this.pinKind = 'drone';
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
    for (const e of game.entities.query(pos, 10, (x) => x.kind === 'car' && !x.persistent)) e.remove();
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

// needs: what the hero must be able to do for the emergency to be possible at all
const TYPES = [
  { cls: Robbery, weight: 3 },
  { cls: CarCrash, weight: 2 },
  { cls: BuildingFire, weight: 2, needs: ['douse'] },
  { cls: DroneAttack, weight: 2 },
  { cls: MiniBoss, weight: 1, minDone: 2 },
];

export class EventDirector {
  constructor(game, stats) {
    this.game = game;
    this.stats = stats;
    this.events = [];
    this.timer = 30; // first emergency fairly soon, then every 2-3 minutes
    this.maxActive = 2;
    this.lastType = null;
  }

  pick() {
    // vary it: never the same kind of emergency twice in a row
    const g = this.game;
    const ok = TYPES.filter((t) => (!t.minDone || this.stats.events >= t.minDone) && t.cls !== this.lastType && (t.needs || []).every((c) => g.heroCan(c)));
    const total = ok.reduce((s, t) => s + t.weight, 0);
    let r = Math.random() * total;
    for (const t of ok) if ((r -= t.weight) <= 0) return t.cls;
    return Robbery;
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
      this.timer = 120 + Math.random() * 60;
      if (this.events.length < this.maxActive) {
        const cls = this.pick();
        if (this.spawn(cls)) this.lastType = cls;
        else this.timer = 10; // no good spot this time: try again shortly
      }
    }
    for (const ev of [...this.events]) {
      ev.update(dt);
      if (ev.status === 'active') {
        g.markers.setPin(ev.id, ev.pinPos(), ev.title, ev.pinKind);
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

export const EVENT_TYPES = { Robbery, CarCrash, BuildingFire, DroneAttack, MiniBoss };
