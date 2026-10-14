// Forge's suit systems (after the classic armoured-avenger kit: palm repulsors, a
// chest beam and shoulder micro-missiles).
//   F (or double-tap Space): toggle flight. Flies like Sky Guardian but a little
//     slower and heavier: momentum carries through turns, Shift boosts and, after a
//     couple of seconds at full thrust, kicks in the afterburner.
//     Flying fast at a building, the suit's "bumpers" glance him along the wall
//     instead of stopping dead.
//   Right mouse (hold): repulsor blasts, alternating palms (builds suit heat).
//   Q (hold): Unibeam. Charges for a moment, then a thick beam from the chest
//     (drains energy fast).
//   E: micro-missiles. Up to six homing missiles from the shoulder pods, each locked
//     on a different enemy near the crosshair (never on civilians).
//   Left mouse: punches. G: carry. R: steal cars.
// No laser eyes, breath or senses.
import * as THREE from 'three';
import { B, SOLID, LASER_PROOF, PUNCH_BREAKABLE } from '../../world/Blocks.js';
import { CITY } from '../../world/CityGenerator.js';

export const FORGE = {
  // a bit slower than Sky Guardian (fly 37.5, boost 62, supersonic 75)
  flight: { fly: 31, boost: 53, supersonic: 63, boomDelay: 2.0, turn: 0.8, accel: 0.85 },
  palette: { suit: 0x4a4f58, accent: 0xd98a2b, belt: 0x7ff3ff },
  repulsorRate: 0.17,
  repulsorSpeed: 110,
  repulsorDamage: 16,
  repulsorHeat: 7,
  uniCharge: 0.45,
  uniMax: 2.2,
  uniDps: 110,
  uniEnergy: 30, // per second while firing
  missileCount: 6,
  missileCost: 30,
  missileCooldown: 5,
  missileRange: 110,
};

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

export class ForgeKit {
  constructor(game) {
    this.game = game;
    this.id = 'forge';
    this.disallow = new Set(['laser', 'breath', 'senses']);
    this.shotCd = 0;
    this.shotHand = 1;
    this.shootT = 9;
    this.uni = 0; // 0..1 charge; >= 1 means firing
    this.uniT = 0;
    this.missileCd = 0;
    this.podT = 9;
    this.bolts = [];
    this.missiles = [];
    const s = game.scene;
    this.boltGeo = new THREE.BoxGeometry(0.16, 0.16, 1.4).translate(0, 0, -0.7);
    this.boltMat = new THREE.MeshBasicMaterial({ color: 0xbff8ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    this.missileGeo = new THREE.BoxGeometry(0.16, 0.16, 0.6);
    this.missileMat = new THREE.MeshLambertMaterial({ color: 0xd8dde4 });
    this.pool = [];
    // the Unibeam: a thick glowing box stretched from the chest to the target
    this.beam = new THREE.Group();
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
    this.beamCore = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
    this.beamGlow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x7ff3ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.beam.add(this.beamCore, this.beamGlow);
    this.beam.visible = false;
    s.add(this.beam);
    this.light = new THREE.PointLight(0x7ff3ff, 0, 14, 2);
    s.add(this.light);
  }

  reset() {
    this.uni = 0;
    this.beam.visible = false;
    this.light.intensity = 0;
    for (const b of this.bolts) b.mesh.visible = false;
    for (const m of this.missiles) m.mesh.visible = false;
    this.bolts.length = 0;
    this.missiles.length = 0;
    this.game.audio.stopLoop('laser');
    this.game.player.modeLabel = null;
  }

  mesh(kind) {
    let m = this.pool.find((x) => !x.visible && x.userData.kind === kind);
    if (!m) {
      m = kind === 'bolt' ? new THREE.Mesh(this.boltGeo, this.boltMat) : new THREE.Mesh(this.missileGeo, this.missileMat);
      m.userData.kind = kind;
      this.game.scene.add(m);
      this.pool.push(m);
    }
    m.visible = true;
    return m;
  }

  /** "Bumpers": flying fast at a wall glances him along it instead of a dead stop. */
  bumper() {
    const g = this.game;
    const p = g.player;
    if (!p.flying) return;
    const v = p.vel;
    const sp = v.length();
    if (sp < 18) return;
    const look = Math.min(12, sp * 0.22);
    const ray = (h) => g.world.raycast(p.pos.x, p.pos.y + h, p.pos.z, v.x / sp, v.y / sp, v.z / sp, look);
    // only walls steer him: the ground and rooftops below never push him back up,
    // so he can dive down and skim along the street
    const wall = (h) => (h && Math.abs(h.ny) < 0.5 ? h : null);
    const low = wall(ray(0.25)), mid = wall(ray(1)), high = wall(ray(1.75));
    // only a ledge or parapet in the way (head height is clear): lift up over it
    if (low && !mid && !high) {
      v.y = Math.max(v.y, Math.min(sp * 0.6, 22));
      return;
    }
    const hit = mid || high || low;
    if (!hit) return;
    const n = tmp.set(hit.nx, hit.ny, hit.nz);
    const into = v.dot(n);
    if (into >= 0) return;
    // turn the speed going into the wall into speed along it (carving round the
    // building, not stopping dead), more strongly the closer the wall is
    const k = Math.min(1, 0.35 + (1 - hit.t / look));
    const along = tmp2.copy(v).addScaledVector(n, -into);
    const al = along.length();
    if (al < 0.5) {
      v.addScaledVector(n, -into * k); // head-on: just brake
      return;
    }
    along.multiplyScalar(sp * 0.94 / al);
    v.lerp(along, k);
  }

  /** Per frame, after movement: weapons. */
  update(dt, input, canAct) {
    const g = this.game;
    const p = g.player;
    this.shotCd = Math.max(0, this.shotCd - dt);
    this.missileCd = Math.max(0, this.missileCd - dt);
    this.shootT += dt;
    this.podT += dt;
    const free = canAct && !g.abilities.carry.held;

    // repulsors (right mouse, hold)
    if (free && input.isDown('laser') && this.uni === 0 && this.shotCd <= 0) {
      if (g.meters.overheated) {
        if (input.pressed('laser')) g.hud.toast('Repulsors overheated!', 'warn', 1);
      } else {
        this.fireRepulsor();
      }
    }

    // Unibeam (Q, hold): charge, then fire
    const wantUni = free && input.isDown('breath') && g.meters.energy > 1;
    if (wantUni) {
      if (this.uni < 1) {
        if (this.uni === 0) g.audio.play('sensesOn');
        this.uni = Math.min(1, this.uni + dt / FORGE.uniCharge);
        if (this.uni >= 1) {
          this.uniT = 0;
          g.audio.startLoop('laser');
          g.rig.shake = Math.max(g.rig.shake, 0.3);
        }
      } else {
        this.uniT += dt;
        if (this.uniT > FORGE.uniMax || !g.meters.drain(FORGE.uniEnergy * dt)) this.stopUni();
        else this.fireUni(dt);
      }
    } else if (this.uni > 0) this.stopUni();

    // micro-missiles (E)
    if (free && input.pressed('senses')) {
      if (this.missileCd > 0) g.hud.toast('Missiles reloading', 'info', 0.8);
      else if (g.meters.energy < FORGE.missileCost) g.hud.toast('Not enough energy for missiles', 'warn', 1);
      else this.launchMissiles();
    }

    this.updateBolts(dt);
    this.updateMissiles(dt);
    p.modeLabel = this.uni >= 1 ? 'UNIBEAM' : null;
  }

  // ---------- repulsors ----------

  /** The suit's targeting: an enemy within a few degrees of the crosshair gets the shot. */
  assist(aim) {
    const g = this.game;
    if (aim.entity) return aim.entity.centerInto(new THREE.Vector3());
    const cam = g.camera.position;
    let best = null, bestCos = Math.cos(0.06);
    for (const e of g.entities.list) {
      if (e.removed || !e.alive || e.team !== 'enemy') continue;
      const c = e.centerInto(tmp2);
      const to = tmp.copy(c).sub(cam);
      const d = to.length();
      if (d > 120 || d > aim.dist + 2) continue;
      const cos = to.dot(aim.dir) / d;
      if (cos > bestCos) {
        bestCos = cos;
        best = c.clone();
      }
    }
    return best;
  }

  fireRepulsor() {
    const g = this.game;
    const p = g.player;
    this.shotCd = FORGE.repulsorRate;
    this.shotHand = -this.shotHand;
    this.shootT = 0;
    p.aimTimer = 0.4;
    g.meters.addHeat(FORGE.repulsorHeat);
    const aim = g.abilities.computeAim();
    g.hero.root.updateMatrixWorld(true);
    const from = (this.shotHand > 0 ? g.hero.handL : g.hero.handR).getWorldPosition(new THREE.Vector3());
    const to = this.assist(aim) || aim.point.clone();
    const dir = to.clone().sub(from).normalize();
    const m = this.mesh('bolt');
    m.position.copy(from);
    m.lookAt(to);
    this.bolts.push({ mesh: m, pos: from.clone(), dir, travelled: 0, max: Math.min(from.distanceTo(to) + 3, 150) });
    g.effects.sparks(from, 3, dir, 0x9ff6ff);
    g.audio.play('zap');
  }

  updateBolts(dt) {
    const g = this.game;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      const step = FORGE.repulsorSpeed * dt;
      // hit anything along this step?
      const ent = g.entities.raycast(b.pos, b.dir, step, (e) => e.alive && !e.carried);
      const blk = g.world.raycast(b.pos.x, b.pos.y, b.pos.z, b.dir.x, b.dir.y, b.dir.z, step);
      let done = false;
      if (ent && (!blk || ent.t < blk.t)) {
        const e = ent.entity;
        const at = b.pos.clone().addScaledVector(b.dir, ent.t);
        const dealt = e.damage(FORGE.repulsorDamage, { type: 'punch', knock: b.dir.clone().multiplyScalar(7).setY(3), source: g.player });
        if (dealt > 0) g.markers.damageNumber(at, dealt, '#9ff6ff');
        g.effects.impact(at, b.dir, 0.8);
        g.hud.hitMarker(!e.alive);
        done = true;
      } else if (blk) {
        const at = new THREE.Vector3(blk.x + 0.5, blk.y + 0.5, blk.z + 0.5);
        g.effects.sparks(at, 8, b.dir.clone().negate(), 0x9ff6ff);
        if (PUNCH_BREAKABLE.has(blk.block)) {
          g.world.edit(blk.x, blk.y, blk.z, B.AIR);
          g.audio.play('glass', at);
        }
        done = true;
      }
      b.pos.addScaledVector(b.dir, step);
      b.travelled += step;
      b.mesh.position.copy(b.pos);
      if (done || b.travelled > b.max) {
        b.mesh.visible = false;
        this.bolts.splice(i, 1);
      }
    }
  }

  // ---------- Unibeam ----------

  fireUni(dt) {
    const g = this.game;
    const aim = g.abilities.computeAim();
    g.player.aimTimer = 0.3;
    // targeting assist: lock the beam onto an enemy right by the crosshair
    if (!aim.entity) {
      const c = this.assist(aim);
      if (c) {
        const hit = g.entities.nearest(c, 2, (e) => e.alive && e.team === 'enemy');
        if (hit) {
          aim.entity = hit;
          aim.point.copy(c);
        }
      }
    }
    if (aim.entity) {
      const dealt = aim.entity.damage(FORGE.uniDps * dt, { type: 'laser', knock: aim.dir.clone().multiplyScalar(30 * dt), source: g.player });
      g.markers.accumulate(aim.entity, dealt, '#9ff6ff');
    } else if (aim.block) {
      // it cuts through walls like the laser eyes, only faster
      const h = aim.block;
      if (h.y >= CITY.G && SOLID[h.block] && !LASER_PROOF.has(h.block) && Math.random() < dt * 12) {
        g.world.edit(h.x, h.y, h.z, B.AIR);
        g.effects.debris(new THREE.Vector3(h.x + 0.5, h.y + 0.5, h.z + 0.5), 0xffd0a0, 6, 5);
      }
    }
    if (Math.random() < 0.7) g.effects.sparks(aim.point, 3, aim.dir.clone().negate(), 0x9ff6ff);
    g.rig.shake = Math.max(g.rig.shake, 0.12);
    this.uniPoint = aim.point.clone();
  }

  stopUni() {
    if (this.uni >= 1) this.game.audio.stopLoop('laser');
    this.uni = 0;
    this.uniPoint = null;
    this.beam.visible = false;
    this.light.intensity = 0;
  }

  // ---------- micro-missiles ----------

  launchMissiles() {
    const g = this.game;
    const p = g.player;
    g.meters.drain(FORGE.missileCost);
    this.missileCd = FORGE.missileCooldown;
    this.podT = 0;
    const aim = g.abilities.computeAim();
    const cam = g.camera.position;
    // lock on to enemies in front, nearest the crosshair first (civilians are never targeted)
    const targets = g.entities.list
      .filter((e) => !e.removed && e.alive && e.team === 'enemy' && e.kind !== 'dummy' && e.pos.distanceTo(p.pos) < FORGE.missileRange)
      .map((e) => {
        const to = e.centerInto(new THREE.Vector3()).sub(cam);
        const d = to.length();
        return { e, cos: to.dot(aim.dir) / d };
      })
      .filter((t) => t.cos > Math.cos(0.6))
      .sort((a, b) => b.cos - a.cos)
      .slice(0, FORGE.missileCount);
    g.hero.root.updateMatrixWorld(true);
    const n = targets.length ? FORGE.missileCount : 3;
    for (let i = 0; i < n; i++) {
      const t = targets.length ? targets[i % targets.length].e : null;
      const pod = g.hero.pods[i % 2].getWorldPosition(new THREE.Vector3());
      const side = i % 2 ? -1 : 1;
      const right = tmp.set(Math.cos(g.rig.yaw), 0, -Math.sin(g.rig.yaw));
      const vel = new THREE.Vector3().copy(aim.dir).multiplyScalar(14).addScaledVector(right, side * (4 + Math.random() * 4)).add(new THREE.Vector3(0, 9 + Math.random() * 4, 0));
      const m = this.mesh('missile');
      m.position.copy(pod);
      this.missiles.push({ mesh: m, pos: pod.clone(), vel, target: t, point: aim.point.clone(), t: -i * 0.06 });
    }
    g.audio.play('whoosh');
    g.hud.toast(targets.length ? `Missiles locked: ${Math.min(targets.length, FORGE.missileCount)} target${targets.length > 1 ? 's' : ''}` : 'Missiles away', 'info', 1.2);
  }

  updateMissiles(dt) {
    const g = this.game;
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.t += dt;
      if (m.t < 0) {
        // staggered launch: wait in the pod
        m.mesh.visible = false;
        continue;
      }
      m.mesh.visible = true;
      const goal = m.target && !m.target.removed && m.target.alive ? m.target.centerInto(tmp2) : m.point;
      const to = tmp.copy(goal).sub(m.pos);
      const dist = to.length();
      // home in harder as they go, accelerating up to full speed
      const speed = Math.min(70, 25 + m.t * 70);
      const turn = Math.min(1, dt * (2 + m.t * 6));
      m.vel.lerp(to.divideScalar(Math.max(dist, 0.01)).multiplyScalar(speed), turn);
      const step = m.vel.length() * dt;
      const dir = m.vel.clone().normalize();
      const blk = g.world.raycast(m.pos.x, m.pos.y, m.pos.z, dir.x, dir.y, dir.z, step);
      m.pos.addScaledVector(m.vel, dt);
      m.mesh.position.copy(m.pos);
      m.mesh.lookAt(tmp.copy(m.pos).add(m.vel));
      if (Math.random() < 0.8) g.particles.emit({ x: m.pos.x, y: m.pos.y, z: m.pos.z, vx: 0, vy: 0.5, vz: 0, life: 0.6, size: 0.25, grow: 3, alpha: 0.45, r: 0.8, g: 0.8, b: 0.8, drag: 1 });
      if (Math.random() < 0.6) g.particles.emit({ x: m.pos.x, y: m.pos.y, z: m.pos.z, vx: -dir.x * 4, vy: -dir.y * 4, vz: -dir.z * 4, life: 0.12, size: 0.25, grow: 0.5, alpha: 0.9, r: 1, g: 0.6, b: 0.2, drag: 2 });
      if (dist < 1.4 || (blk && m.t > 0.25) || m.t > 4) {
        g.explode(m.pos.clone(), 3, 32, null);
        m.mesh.visible = false;
        this.missiles.splice(i, 1);
      }
    }
  }

  // ---------- drawing (after the model and camera have moved) ----------

  place() {
    const g = this.game;
    const hero = g.hero;
    if (this.uni >= 1 && this.uniPoint) {
      hero.root.updateMatrixWorld(true);
      const from = hero.chest.getWorldPosition(tmp);
      const len = from.distanceTo(this.uniPoint);
      this.beam.position.copy(from);
      this.beam.lookAt(this.uniPoint);
      const f = 1 + Math.sin(g.time * 50) * 0.12;
      this.beamCore.scale.set(0.16 * f, 0.16 * f, len);
      this.beamGlow.scale.set(0.5 * f, 0.5 * f, len);
      this.beam.visible = true;
      this.light.position.copy(this.uniPoint);
      this.light.intensity = 10;
    } else {
      this.beam.visible = false;
      this.light.intensity = 0;
    }
    // thruster sparks from the soles while flying
    const p = g.player;
    if (p.flying && Math.random() < 0.5) {
      hero.root.updateMatrixWorld(true);
      for (const leg of [hero.legL, hero.legR]) {
        const at = leg.localToWorld(tmp.set(0, -0.9, 0));
        g.particles.emit({ x: at.x, y: at.y, z: at.z, vx: p.vel.x * 0.5 + (Math.random() - 0.5), vy: p.vel.y * 0.5 - 2, vz: p.vel.z * 0.5 + (Math.random() - 0.5), life: 0.25, size: 0.18, grow: 0.5, alpha: 0.8, r: 1, g: 0.65, b: 0.25, drag: 3 });
      }
    }
  }

  /** The afterburner kicks in (instead of Sky Guardian's sonic boom). */
  afterburner() {
    const g = this.game;
    g.rig.fovPunch = 9;
    g.rig.shake = Math.max(g.rig.shake, 0.4);
    g.audio.play('whoosh');
    g.audio.play('thud');
    g.hud.toast('Afterburner!', 'info', 0.8);
  }

  hud(hud) {
    hud.ab.laser.classList.toggle('active', this.shootT < 0.2);
    hud.ab.laser.classList.toggle('disabled', this.game.meters.overheated);
    hud.ab.breath.classList.toggle('active', this.uni > 0);
    hud.ab.senses.classList.toggle('active', this.podT < 0.6);
    hud.ab.senses.classList.toggle('disabled', this.game.meters.energy < FORGE.missileCost);
  }

  cooldowns() {
    return { senses: [this.missileCd, FORGE.missileCooldown] };
  }
}
