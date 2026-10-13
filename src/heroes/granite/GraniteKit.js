// Granite's powers: hold Space to charge a giant leap (landing slams the ground),
// heavier punches that break walls, and Q for a thunder clap shockwave.
// No flight, laser, breath or senses.
import * as THREE from 'three';
import { B, SOLID, LASER_PROOF } from '../../world/Blocks.js';
import { CITY } from '../../world/CityGenerator.js';

export const GRANITE = {
  body: { halfW: 0.55, height: 2.6 },
  stats: { walk: 6, run: 11, sprint: 22, jump: 13 },
  eye: 2.45, // camera focus height
  camScale: 1.3, // camera further back
  palette: { suit: 0x6f8a5c, accent: 0x4f6641, belt: 0x3d3a36 },
  chargeTime: 1.1, // seconds to a full leap
  clapCost: 22, // energy
  clapCooldown: 1.4,
  clapRange: 17,
  clapCone: Math.cos(0.62),
  punchPower: 2.2,
  punchKnock: 1.7,
};

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

export class GraniteKit {
  constructor(game) {
    this.game = game;
    this.id = 'granite';
    this.disallow = new Set(['fly', 'laser', 'breath', 'senses']);
    this.charge = 0;
    this.charging = false;
    this.leapK = 0;
    this.clapT = 9;
    this.clapFired = true;
    this.clapCd = 0;
    this.lastVy = 0;
    this.punchPower = GRANITE.punchPower;
    this.punchKnock = GRANITE.punchKnock;
  }

  reset() {
    const p = this.game.player;
    this.charge = 0;
    this.charging = false;
    this.clapT = 9;
    this.clapFired = true;
    this.clapCd = 0;
    p.leaping = false;
    p.charging = false;
  }

  /** Called every frame after the hero has moved. */
  update(dt, input, canAct) {
    const g = this.game;
    const p = g.player;
    this.clapCd = Math.max(0, this.clapCd - dt);

    // a leap that ends in a soft landing (hard ones come through onLand from the player)
    if (p.leaping && p.onGround) this.onLand(-this.lastVy);
    if (!p.onGround) this.lastVy = p.vel.y;

    // wading through water: splashes around the legs
    if (p.wading && Math.hypot(p.vel.x, p.vel.z) > 1.5 && Math.random() < dt * 25) {
      g.particles.emit({ x: p.pos.x + (Math.random() - 0.5), y: p.pos.y + 1.2, z: p.pos.z + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 3, vy: 3 + Math.random() * 3, vz: (Math.random() - 0.5) * 3, life: 0.5, size: 0.25, grow: 1.5, alpha: 0.7, r: 0.85, g: 0.93, b: 1, gravity: 12, drag: 1 });
    }

    // ---- charged leap: hold Space on the ground, release to jump ----
    const holding = canAct && input.isDown('jump') && g.allowed('jump');
    if (this.charging) {
      if (holding && p.onGround) {
        this.charge = Math.min(1, this.charge + dt / GRANITE.chargeTime);
        if (Math.random() < dt * 20 * this.charge) g.effects.dust(tmp.set(p.pos.x, p.pos.y + 0.1, p.pos.z), 1, 1.2);
        if (this.charge >= 1 && !this.fullRumble) {
          this.fullRumble = true;
          g.audio.play('thud');
          g.rig.shake = Math.max(g.rig.shake, 0.15);
        }
      } else {
        this.launch();
      }
    } else if (holding && p.onGround && input.pressed('jump')) {
      this.charging = true;
      this.charge = 0;
      this.fullRumble = false;
    }
    p.charging = this.charging;

    // ---- thunder clap ----
    if (canAct && input.pressed('breath') && !g.abilities.carry.held) {
      if (this.clapCd > 0) {
        // still recovering: ignore
      } else if (g.meters.energy < GRANITE.clapCost) {
        g.hud.toast('Not enough energy to clap', 'warn', 1);
      } else {
        g.meters.drain(GRANITE.clapCost);
        this.clapCd = GRANITE.clapCooldown;
        this.clapT = 0;
        this.clapFired = false;
        p.aimTimer = 0.6;
        g.audio.play('whoosh');
      }
    }
    this.clapT += dt;
    if (!this.clapFired && this.clapT >= 0.13) {
      this.clapFired = true;
      this.clap();
    }
  }

  /** Let go of Space: a little hop for a tap, a huge leap for a full charge. */
  launch() {
    const g = this.game;
    const p = g.player;
    const k = this.charge;
    this.charging = false;
    this.charge = 0;
    if (!p.onGround) return;
    p.onGround = false;
    if (k < 0.15) {
      p.vel.y = GRANITE.stats.jump;
      return;
    }
    // leap where the camera looks (looking up throws the leap higher)
    const yaw = g.rig.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const up = Math.max(-0.1, Math.sin(g.rig.pitch));
    const h = 6 + 26 * k;
    p.vel.set(fx * h * (1 - up * 0.5), 16 + 30 * k + up * 14 * k, fz * h * (1 - up * 0.5));
    p.leaping = true;
    p.leapVel.x = p.vel.x;
    p.leapVel.z = p.vel.z;
    this.leapK = k;
    this.lastVy = p.vel.y;
    g.effects.dust(tmp.set(p.pos.x, p.pos.y + 0.1, p.pos.z), 10 + 20 * k, 1.5);
    g.effects.shockwave(tmp.set(p.pos.x, p.pos.y + 0.1, p.pos.z), 1.5 + 2 * k);
    g.audio.play(k > 0.6 ? 'land' : 'thud');
    g.rig.shake = Math.max(g.rig.shake, 0.2 + 0.3 * k);
    this.crack(p.pos, k > 0.5 ? 1 : 0);
  }

  /** Touchdown (from a leap or any fall): the harder he lands, the bigger the slam. */
  onLand(speed) {
    const g = this.game;
    const p = g.player;
    const k = Math.max(p.leaping ? this.leapK * 0.8 : 0, Math.min(1, (speed - 14) / 50));
    p.leaping = false;
    if (k <= 0.05) return;
    p.landT = 0.35 + 0.25 * k;
    const at = tmp.set(p.pos.x, p.pos.y + 0.1, p.pos.z);
    g.audio.play('land');
    if (k > 0.55) g.audio.play('stomp');
    g.rig.shake = Math.max(g.rig.shake, 0.3 + 0.5 * k);
    g.effects.dust(at, 20 + 40 * k, 2 + 2 * k);
    g.effects.shockwave(at, 3 + 5 * k);
    g.addDanger(p.pos, 10 + 10 * k, 1.5);
    if (k > 0.3) g.hitStop(0.05);
    this.crack(p.pos, Math.round(1 + 2 * k));
    // knock everything nearby off its feet
    const r = 3 + 5 * k;
    for (const e of g.entities.query(tmp2.set(p.pos.x, p.pos.y + 0.5, p.pos.z), r + 1, (x) => !x.carried && !x.removed)) {
      const c = e.centerInto(new THREE.Vector3());
      const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z);
      if (d > r || Math.abs(c.y - p.pos.y) > 4) continue;
      const f = 1 - d / r;
      const dir = new THREE.Vector3(c.x - p.pos.x, 0, c.z - p.pos.z).normalize();
      const m = Math.max(1, e.mass);
      if (e.kind === 'car') e.driving = false;
      const dmg = e.team === 'civ' ? 4 * f : (15 + 45 * k) * (0.4 + 0.6 * f);
      const dealt = e.damage(dmg, { type: 'impact', knock: dir.multiplyScalar((6 + 14 * k) * f * m).setY((5 + 8 * k) * f * m), source: p });
      if (dealt > 1 && e.team !== 'civ') g.markers.damageNumber(c, dealt, '#ffd34d');
    }
  }

  /** Cracked, scorched pavement around a point (radius in blocks). */
  crack(pos, radius) {
    const w = this.game.world;
    const x0 = Math.floor(pos.x), y = Math.floor(pos.y - 0.5), z0 = Math.floor(pos.z);
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dz * dz > radius * radius + 0.5) continue;
        if ((dx || dz) && Math.random() < 0.4) continue;
        const b = w.get(x0 + dx, y, z0 + dz);
        if (SOLID[b] && !LASER_PROOF.has(b) && b !== B.ICE && b !== B.SCORCH) w.edit(x0 + dx, y, z0 + dz, B.SCORCH);
      }
    }
  }

  /** Thunder clap: a cone of air that flattens enemies, shoves cars, blows out fires and windows. */
  clap() {
    const g = this.game;
    const p = g.player;
    const dir = g.rig.forward(new THREE.Vector3());
    const origin = new THREE.Vector3(p.pos.x, p.pos.y + 2.0, p.pos.z).addScaledVector(tmp.set(dir.x, 0, dir.z).normalize(), 0.8);
    const R = GRANITE.clapRange;
    g.audio.play('clap');
    g.rig.shake = Math.max(g.rig.shake, 0.55);
    g.rig.fovPunch = 8;
    g.hitStop(0.05);
    g.addDanger(origin, R, 1.5);
    // the visible blast: a ring at the hands and a fan of dust flying forward
    g.effects.shockwave(origin.clone().addScaledVector(dir, 1.5), 3);
    for (let i = 0; i < 60; i++) {
      const spread = 0.55;
      const vx = dir.x + (Math.random() - 0.5) * spread * 2, vy = dir.y + (Math.random() - 0.5) * spread, vz = dir.z + (Math.random() - 0.5) * spread * 2;
      const s = 22 + Math.random() * 14;
      const c = 0.82 + Math.random() * 0.15;
      g.particles.emit({ x: origin.x, y: origin.y, z: origin.z, vx: vx * s, vy: vy * s, vz: vz * s, life: 0.45 + Math.random() * 0.25, size: 0.35, grow: 5, alpha: 0.45, r: c, g: c, b: c * 0.95, drag: 3 });
    }

    for (const e of g.entities.query(origin, R + 3)) {
      if (e.carried || e.removed) continue;
      // big shields (the Iron Tyrant): the blast cracks them like a freeze does
      const sp = e.sphere?.();
      if (sp) {
        tmp2.copy(sp.c).sub(origin);
        const dc = tmp2.length();
        if (dc - sp.r < R && tmp2.divideScalar(dc).dot(dir) > 0.5) e.onBreath?.(0.6, 1);
        continue;
      }
      const c = e.centerInto(tmp2);
      const to = c.clone().sub(origin);
      const d = to.length();
      if (d > R || d < 0.01) continue;
      if (d > 2.5 && to.divideScalar(d).dot(dir) < GRANITE.clapCone) continue;
      if (!e.alive && e.kind !== 'car' && e.kind !== 'prop') continue;
      const f = 1 - d / R;
      const m = Math.max(1, e.mass);
      const car = e.kind === 'car';
      const knock = dir.clone().multiplyScalar((10 + 22 * f) * m * (car ? 1.4 : 1));
      knock.y += (car ? 7 + 6 * f : 4 + 6 * f) * m;
      if (e.kind === 'car') e.driving = false;
      const dmg = e.team === 'civ' ? 0 : e.kind === 'car' ? 12 * f : 14 + 30 * f;
      const dealt = e.damage(dmg || 0.01, { type: 'impact', knock, source: p });
      if (dealt > 1 && e.team !== 'civ') g.markers.damageNumber(c.clone(), dealt, '#ffffff');
      if (e.canFreeze) e.stun = Math.max(e.stun || 0, 1.2 * f + 0.4);
    }
    // the gust snuffs out fires in front of him
    g.fires.extinguishCone(origin, dir, R, GRANITE.clapCone, 2.5);
    // and blows in windows along the way
    const w = g.world;
    let broke = 0;
    for (let i = 0; i < 18; i++) {
      const a = (Math.random() - 0.5) * 1.1, b = (Math.random() - 0.5) * 0.7;
      const ray = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
      ray.y += b;
      ray.normalize();
      const hit = w.raycast(origin.x, origin.y, origin.z, ray.x, ray.y, ray.z, 11);
      if (hit && ((hit.block >= B.GLASS_BLUE && hit.block <= B.GLASS_DARK) || hit.block === B.DOOR) && hit.y >= CITY.G) {
        w.edit(hit.x, hit.y, hit.z, B.AIR);
        if (broke++ < 3) g.effects.debris(new THREE.Vector3(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5), 0xbfe3ff, 8, 6);
      }
    }
    if (broke) g.audio.play('glass');
  }

  /** Ability bar state. */
  hud(hud) {
    hud.ab.laser.classList.toggle('active', this.charging);
    hud.ab.breath.classList.toggle('active', this.clapT < 0.3);
    hud.ab.breath.classList.toggle('disabled', this.clapCd > 0 || this.game.meters.energy < GRANITE.clapCost);
  }
}
