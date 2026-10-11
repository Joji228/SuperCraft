// The campaign, as data. Each mission lists anchors (named places), stages and objectives.
// Objective types: reach, action, rings, destroy, defeat, extinguish, rescue, find, protect, custom.
// To add a mission, append an entry here: it shows up in mission select automatically.
import * as THREE from 'three';
import { CITY, lotOrigin, spawnPoint, riverZ } from '../world/CityGenerator.js';
import { B } from '../world/Blocks.js';
import { Thug } from '../enemies/Thug.js';
import { Drone } from '../enemies/Drone.js';
import { Rook, Skyhook } from '../enemies/Boss.js';
import { IronTyrant } from '../enemies/IronTyrant.js';
import { Civilian } from '../npc/Civilians.js';
import { Car } from '../npc/Traffic.js';
import { Dummy, Target, Cat } from '../entities/Props.js';
import { findStreetSpot, buildingsNear, facadePoints } from '../modes/spots.js';

const G = CITY.G;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- shared helpers ----------

function plaza() {
  const [x0, z0] = lotOrigin(5, 3);
  return { x0, z0, cx: x0 + 16, cz: z0 + 16 };
}

function add(ctx, e, tag) {
  if (tag) e.tags.add(tag);
  e.persistent = true;
  e.unstick?.();
  return ctx.g.entities.add(e);
}

function crowd(ctx, center, n, spread, tag = 'mission', panic = true) {
  for (let i = 0; i < n; i++) {
    const p = findStreetSpot(ctx.g.world, center.x, center.z, 3, spread, 0) || center;
    const c = add(ctx, new Civilian(ctx.g, p.x, G, p.z), tag);
    if (panic) c.panic(center, 20);
  }
}

function heroStart(p, yaw = 0) {
  return { x: p.x, y: p.y, z: p.z, yaw };
}

/** Ring checkpoints circling downtown, nudged out of buildings. */
function ringPath(g, startFrom) {
  const c = V(252, 0, 122);
  const pts = [];
  let a0 = Math.atan2(startFrom.z - c.z, startFrom.x - c.x);
  for (let i = 0; i < 8; i++) {
    const a = a0 - (i / 8) * Math.PI * 1.7;
    let r = 40;
    const y = G + 22 + i * 7;
    let p;
    for (let k = 0; k < 12; k++, r += 6) {
      p = V(c.x + Math.cos(a) * r, y, c.z + Math.sin(a) * r);
      let clear = true;
      for (let dy = -4; dy <= 4 && clear; dy += 2) for (let dx = -4; dx <= 4 && clear; dx += 2) for (let dz = -4; dz <= 4 && clear; dz += 2) if (g.world.isSolid(Math.floor(p.x + dx), Math.floor(p.y + dy), Math.floor(p.z + dz))) clear = false;
      if (clear) break;
    }
    pts.push(p);
  }
  return pts;
}

/** Tallest tower near downtown. */
function tallestTower(g) {
  const list = buildingsNear(g.world, 250, 125, 90, (b) => b.top > G + 40);
  list.sort((a, b) => b.top - a.top);
  return list[0];
}

function buildBalcony(g, fp) {
  const w = g.world;
  const y = fp.y - 1;
  const ax = fp.nz !== 0 ? 1 : 0, az = fp.nx !== 0 ? 1 : 0; // along the wall
  for (let k = -1; k <= 1; k++) {
    for (let o = 0; o <= 1; o++) {
      const x = Math.floor(fp.pos.x) + ax * k + fp.nx * o;
      const z = Math.floor(fp.pos.z) + az * k + fp.nz * o;
      if (w.get(x, y, z) === B.AIR) w.edit(x, y, z, B.CONCRETE_DARK);
    }
  }
}

// ---------- missions ----------

export const MISSIONS = [
  {
    id: 'first-flight',
    name: 'First Flight',
    tagline: 'Tutorial',
    briefing:
      'Welcome to Brightport, Aegis. Before the city needs you for real, let\'s make sure you know what you can do. Walk, jump, take to the sky, then try out your fists, your laser eyes, your freezing breath and your super senses. Oh, and Mrs. Alvarez lost her cat again.',
    timeOfDay: 0.36,
    population: true,
    rating: { par: 330, damage: 15, lostMax: 0 },
    anchors(g) {
      const pz = plaza();
      const s = spawnPoint();
      return {
        start: heroStart(V(s.x, s.y, s.z), 0),
        plazaNorth: V(pz.cx, G, pz.z0 + 6),
        plazaCenter: V(pz.cx, G, pz.cz),
        plazaZone: V(pz.cx - 8, G, pz.cz + 8),
      };
    },
    stages: [
      { objectives: [(c) => ({ type: 'reach', at: c.a.plazaNorth, radius: 2.5, label: 'Walk to the marker (WASD)' })] },
      { objectives: [{ type: 'action', action: 'jump', label: 'Jump (Space)' }] },
      { objectives: [{ type: 'action', action: 'fly', label: 'Take off (F)' }] },
      {
        toast: 'Fly through the rings! Shift to boost.',
        objectives: [(c) => ({ type: 'rings', points: ringPath(c.g, c.g.player.pos), label: 'Fly through the rings' })],
      },
      { objectives: [(c) => ({ type: 'action', action: 'land', at: c.a.plazaCenter, radius: 30, label: 'Land back at the plaza (hold C)' })] },
      {
        toast: 'Punch with the left mouse button. Three hits make a combo!',
        start(c) {
          const pz = plaza();
          for (let i = 0; i < 3; i++) add(c, new Dummy(c.g, pz.cx - 6 + i * 6, G, pz.z0 + 24, Math.PI), 'dummy');
        },
        objectives: [{ type: 'destroy', tag: 'dummy', label: 'Punch the training dummies (LMB)' }],
      },
      {
        toast: 'Hold the right mouse button to fire your laser eyes. Watch the heat meter!',
        start(c) {
          const pz = plaza();
          const pts = [[pz.x0 + 3, pz.z0 + 3], [pz.x0 + 29, pz.z0 + 3], [pz.x0 + 29, pz.z0 + 29]];
          for (const [x, z] of pts) {
            const t = add(c, new Target(c.g, x + 0.5, G, z + 0.5), 'target');
            t.yaw = Math.atan2(pz.cx - x, pz.cz - z);
          }
        },
        objectives: [{ type: 'destroy', tag: 'target', label: 'Burn the targets with laser eyes (hold RMB)' }],
      },
      {
        toast: 'Hold Q to use your freezing super breath.',
        start(c) {
          const pz = plaza();
          c.g.fires.ignite(V(pz.x0 + 6.5, G + 0.2, pz.cz + 0.5), { intensity: 1, size: 1.4, tag: 'tut', persistent: true });
          c.g.fires.ignite(V(pz.x0 + 7.5, G + 0.2, pz.cz + 1.5), { intensity: 1, size: 1.1, tag: 'tut', persistent: true });
        },
        objectives: [{ type: 'extinguish', tag: 'tut', label: 'Put out the fire (hold Q)' }],
      },
      {
        toast: 'Press E for super senses: you can see through walls.',
        start(c) {
          // hide the cat on a nearby rooftop
          const g = c.g;
          const cands = buildingsNear(g.world, plaza().cx, plaza().cz, 80, (b) => b.top > G + 6 && b.top < G + 35);
          const b = cands[Math.floor(Math.random() * cands.length)] || g.world.buildings[0];
          const t = b.tiers[b.tiers.length - 1];
          const x = t[0] + 2.5, z = t[1] + 2.5;
          const y = g.world.surfaceY(Math.floor(x), Math.floor(z)) + 1;
          add(c, new Cat(g, x, y, z), 'cat');
        },
        objectives: [
          { type: 'action', action: 'senses', label: 'Use super senses (E)' },
          { type: 'find', tag: 'cat', label: 'Find the lost cat and pick it up (G)' },
        ],
      },
      { objectives: [(c) => ({ type: 'rescue', tag: 'cat', at: c.a.plazaZone, radius: 4, zoneLabel: 'Mrs. Alvarez', label: 'Bring the cat back to the plaza' })] },
    ],
  },

  {
    id: 'bank-job',
    name: 'Bank Job',
    tagline: 'The Rook Gang',
    briefing:
      'The Rook Gang is robbing the First Brightport Bank downtown. Thugs with bats and guns are terrorising the street while their boss, Rook, empties the vault. Take down the gang, keep the bystanders safe, and stop Rook before he gets away.',
    timeOfDay: 0.42,
    population: true,
    rating: { par: 240, damage: 40, lostMax: 0 },
    anchors() {
      const [x0, z0] = lotOrigin(6, 2);
      const front = V(x0 + 16, G, z0 + 31 + 4);
      return { start: heroStart(V(x0 + 16, G + 30, z0 + 80), 0), bank: front, door: V(x0 + 16, G, z0 + 29) };
    },
    stages: [
      {
        toast: 'Stop the robbers!',
        start(c) {
          const g = c.g;
          const b = c.a.bank;
          const van = add(c, new Car(g, 0x1b1b1b), 'van');
          van.pos.set(b.x + 6, G, b.z + 2);
          van.yaw = Math.PI / 2;
          for (let i = 0; i < 8; i++) {
            const p = findStreetSpot(g.world, b.x, b.z, 2, 14, 0) || b;
            const t = add(c, new Thug(g, p.x, G, p.z, { weapon: i % 3 === 0 ? 'bat' : 'gun', aggro: 40 }), 'gang');
            t.home.copy(b);
          }
          crowd(c, b, 10, 24);
        },
        objectives: [
          { type: 'destroy', tag: 'gang', label: 'Take down the gang' },
          { type: 'protect', maxLost: 4, label: 'Keep bystanders safe' },
        ],
      },
      {
        toast: 'Rook is coming out of the bank!',
        start(c) {
          const g = c.g;
          const d = c.a.door;
          const r = add(c, new Rook(g, d.x, G, d.z + 2), 'rook');
          r.alert();
          for (let i = 0; i < 2; i++) add(c, new Thug(g, d.x + (i ? 3 : -3), G, d.z + 3, { weapon: 'gun' }), 'gang').alert();
        },
        objectives: [
          { type: 'defeat', tag: 'rook', label: 'Defeat Rook', pinLabel: 'Rook' },
          { type: 'protect', maxLost: 4, label: 'Keep bystanders safe' },
        ],
      },
    ],
  },

  {
    id: 'tower-inferno',
    name: 'Tower Inferno',
    tagline: 'Race the flames',
    briefing:
      'A fire has broken out in the Meridian Tower, the tallest building in Brightport. Office workers are trapped on balconies high above the street, and the flames are spreading. Put out the fires with your super breath and fly everyone down to the ambulance before it\'s too late.',
    timeOfDay: 0.68,
    timeLimit: 300,
    population: true,
    rating: { par: 210, damage: 30, lostMax: 0 },
    anchors(g) {
      const b = tallestTower(g);
      const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
      const amb = findStreetSpot(g.world, cx, cz, (b.x1 - b.x0) / 2 + 6, (b.x1 - b.x0) / 2 + 22, 2) || V(cx, G, b.z1 + 8);
      return { start: heroStart(V(amb.x, G + 0.5, amb.z + 4), Math.atan2(amb.x - cx, amb.z - cz)), tower: b, ambulance: amb };
    },
    stages: [
      {
        toast: 'Put out the fires and rescue the trapped workers!',
        start(c) {
          const g = c.g;
          const b = c.a.tower;
          const pts = facadePoints(g.world, b, 14, G + 6, b.top - 6);
          for (const p of pts) g.fires.ignite(p.pos, { intensity: 1, size: 1.3, spread: true, tag: 'inferno', persistent: true });
          const balconies = facadePoints(g.world, b, 5, G + 14, b.top - 4);
          for (const fp of balconies) {
            buildBalcony(g, fp);
            const civ = add(c, new Civilian(g, fp.pos.x + fp.nx * 0.5, fp.y, fp.pos.z + fp.nz * 0.5, { state: 'trapped' }), 'trapped');
            civ.yaw = Math.atan2(fp.nx, fp.nz);
            civ.fireproof = true; // they're scared, not burning: the timer is the danger
          }
          crowd(c, c.a.ambulance, 6, 20, 'bystander', false);
        },
        objectives: [
          { type: 'extinguish', tag: 'inferno', label: 'Put out the fires (Q)' },
          (c) => ({ type: 'rescue', tag: 'trapped', at: c.a.ambulance, radius: 4.5, zoneLabel: 'Ambulance', label: 'Fly the workers to the ambulance' }),
        ],
      },
    ],
    cleanup(c) {
      // stop the tower fire from lingering after the mission
      c.g.fires.clear();
    },
  },

  {
    id: 'bridge-collapse',
    name: 'Bridge Collapse',
    tagline: 'Skyhook strikes',
    briefing:
      'Skyhook, a jet-pack mercenary, has blown a hole in the Harbor Bridge at rush hour. Cars are tumbling into the river and his drones are attacking anyone who tries to help. Pull the cars out before they sink, get the stranded commuters to the riverbank, then take Skyhook down. He\'ll run when he\'s losing, so don\'t let him escape.',
    timeOfDay: 0.3,
    population: true,
    rating: { par: 300, damage: 40, lostMax: 0 },
    anchors() {
      const bx = CITY.O + CITY.BRIDGE_ROAD * CITY.CELL;
      const [rz0, rz1] = riverZ();
      return {
        start: heroStart(V(bx + 4, G + 25, rz0 - 40), Math.PI),
        bx,
        rz0,
        rz1,
        bridge: V(bx + 4, G, (rz0 + rz1) / 2),
        bank: V(bx - 16, G, rz0 - 6),
      };
    },
    stages: [
      {
        toast: 'The bridge is collapsing! Save the cars before they sink!',
        start(c) {
          const g = c.g;
          const { bx, rz0, bridge } = c.a;
          // blow out the middle of the deck
          const z0 = rz0 + 10, z1 = rz0 + 18;
          for (let z = z0; z < z1; z++) for (let x = bx - 2; x < bx + CITY.ROAD + 2; x++) for (let y = G - 3; y < G; y++) g.world.edit(x, y, z, y === G - 1 ? B.AIR : B.WATER);
          g.explode(V(bridge.x, G, (z0 + z1) / 2), 6, 0, null);
          g.rig.shake = 1;
          // cars on the deck near the gap, sliding in one by one
          c.data.cars = [];
          const spots = [[bx + 2, z0 - 3], [bx + 6, z1 + 2], [bx + 2, z0 - 9], [bx + 6, z1 + 8]];
          spots.forEach(([x, z], i) => {
            const car = add(c, new Car(g), 'bridgecar');
            car.pos.set(x, G, z);
            car.yaw = z < z0 ? 0 : Math.PI;
            car.fallAt = 3 + i * 5;
            car.target = V(x, G, (z0 + z1) / 2);
            car.sink = 0;
            car.carryLabel = 'Car (with driver)';
            car.sensesColor = '#ffd34d';
            c.data.cars.push(car);
          });
          for (let i = 0; i < 3; i++) {
            const civ = add(c, new Civilian(g, bx + 1 + i * 3, G, z1 + 4 + i, { state: 'trapped' }), 'bridgeciv');
            civ.carryLabel = 'Commuter';
          }
          for (let i = 0; i < 6; i++) add(c, new Drone(g, bridge.x + (i - 3) * 4, G + 12, bridge.z + (i % 2 ? 8 : -8)), 'bridgedrone');
        },
        update(c, dt) {
          const g = c.g;
          for (const car of c.data.cars) {
            if (car.removed || car.saved || car.carried) continue;
            if (car.fallAt != null && c.run.stageTime > car.fallAt) {
              // slide towards the gap
              const d = car.target.clone().sub(car.pos).setY(0);
              if (d.length() > 0.5 && car.onGround && g.world.get(Math.floor(car.pos.x), G - 1, Math.floor(car.pos.z)) !== B.WATER) car.vel.addScaledVector(d.normalize(), 8 * dt);
            }
            const under = g.world.get(Math.floor(car.pos.x), Math.floor(car.pos.y) - 1, Math.floor(car.pos.z));
            if (under === B.WATER && car.onGround) {
              if (car.sink === 0) {
                g.hud.toast('A car is sinking! Grab it (G)!', 'warn');
                g.effects.steam(car.pos, 20);
              }
              car.sink += dt;
              car.visualLift = -car.sink * 0.06;
              if (Math.random() < dt * 8) g.effects.steam(car.pos, 2);
              if (car.sink > 16) {
                car.remove();
                c.run.lose(car, 'A car sank into the river!');
              }
            } else if (car.sink > 0 && car.carried) {
              car.visualLift = 0;
            }
          }
        },
        objectives: [
          (c) => ({ type: 'rescue', tag: 'bridgecar', at: c.a.bank, radius: 7, zoneLabel: 'Riverbank', label: 'Pull the cars to the riverbank' }),
          { type: 'destroy', tag: 'bridgedrone', label: 'Destroy the drones' },
          (c) => ({ type: 'rescue', tag: 'bridgeciv', at: c.a.bank, radius: 7, zoneLabel: 'Riverbank', label: 'Carry the commuters to safety' }),
          { type: 'protect', maxLost: 2, label: 'Lives at risk' },
        ],
      },
      {
        toast: 'Skyhook is here! Take him down!',
        start(c) {
          const g = c.g;
          const s = add(c, new Skyhook(g, c.a.bridge.x, G + 20, c.a.bridge.z), 'skyhook');
          s.alert();
          g.hud.toast('Skyhook: "You\'ll never catch me, hero!"', 'warn', 4);
        },
        objectives: [
          { type: 'defeat', tag: 'skyhook', label: 'Defeat Skyhook', pinLabel: 'Skyhook' },
          { type: 'protect', maxLost: 2, label: 'Lives at risk' },
        ],
      },
    ],
  },

  {
    id: 'iron-tyrant',
    name: 'Iron Tyrant',
    tagline: 'The final battle',
    briefing:
      'A giant war machine has marched into the heart of Brightport. The Iron Tyrant is smashing the plaza with its minions at its side. Its shield can be frozen and shattered, and its core will glow when it\'s exposed. Use every power you have. The whole city is watching.',
    timeOfDay: 0.74,
    population: true,
    rating: { par: 420, damage: 60, lostMax: 1 },
    anchors() {
      const pz = plaza();
      return { start: heroStart(V(pz.cx, G + 20, pz.cz + 60), 0), arena: { x: pz.cx, z: pz.cz, r: 20 }, center: V(pz.cx, G, pz.cz) };
    },
    stages: [
      {
        toast: 'Stop the Iron Tyrant!',
        start(c) {
          const g = c.g;
          const a = c.a.arena;
          const t = add(c, new IronTyrant(g, a.x, G, a.z - 8, a), 'tyrant');
          t.yaw = 0;
          for (let i = 0; i < 3; i++) add(c, new Thug(g, a.x + (i - 1) * 6, G, a.z + 6, { weapon: i === 1 ? 'bat' : 'gun' }), 'minion').alert();
          for (let i = 0; i < 3; i++) add(c, new Drone(g, a.x + (i - 1) * 8, G + 14, a.z), 'minion');
          crowd(c, c.a.center, 12, 40);
          c.data.down = false;
          c.data.off = g.events.on('tyrantDown', () => (c.data.down = true));
        },
        objectives: [
          { type: 'custom', label: 'Defeat the Iron Tyrant', check: (c) => ({ done: c.data.down }) },
          { type: 'protect', maxLost: 5, label: 'Protect the citizens' },
        ],
      },
    ],
    cleanup(c) {
      c.data.off?.();
    },
    finale: true,
  },
];
