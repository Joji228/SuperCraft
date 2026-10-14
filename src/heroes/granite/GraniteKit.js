// Granite's powers: hold Space to charge a giant leap (landing slams the ground),
// heavier punches that break walls, Q for a thunder clap shockwave and right
// mouse for Granite Smash: both fists into the ground (or, in mid-air, a dive slam).
// No flight, laser, breath or senses.
import * as THREE from 'three';
import { B, SOLID, LASER_PROOF } from '../../world/Blocks.js';
import { CITY } from '../../world/CityGenerator.js';
import { LeapPreview } from './LeapPreview.js';

export const GRANITE = {
  body: { halfW: 0.55, height: 2.6 },
  stats: { walk: 6, run: 11, sprint: 22, jump: 13 },
  eye: 2.45, // camera focus height
  camScale: 1.3, // camera further back
  palette: { suit: 0x6f8a5c, accent: 0x4f6641, belt: 0x3d3a36 },
  chargeTime: 1.1, // seconds to a full leap
  clapCost: 22, // energy
  clapCooldown: 1.4,
  clapRange: 22,
  clapCone: Math.cos(0.66),
  smashCost: 30,
  smashCooldown: 2.2,
  smashRadius: 8.5,
  airControl: 4.5, // how much you can steer mid-leap (m/s); was 3
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
    this.heavyHitter = true;
    this.canDouse = true; // his thunder clap blows fires out
    this.punchPower = GRANITE.punchPower;
    this.punchKnock = GRANITE.punchKnock;
    this.smashT = 9;
    this.smashCd = 0;
    this.smashFired = true;
    this.diveSmash = false;
    this.preview = new LeapPreview(game.scene, game.world);
  }

  /** The launch velocity for a charge k (also used to draw the preview arc). */
  leapVelocity(k, out = new THREE.Vector3()) {
    const g = this.game;
    const yaw = g.rig.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    // leap where the camera looks (looking up throws the leap higher)
    const up = Math.max(-0.1, Math.sin(g.rig.pitch));
    const h = 6 + 26 * k;
    return out.set(fx * h * (1 - up * 0.5), 16 + 30 * k + up * 14 * k, fz * h * (1 - up * 0.5));
  }

  reset() {
    const p = this.game.player;
    this.charge = 0;
    this.charging = false;
    this.clapT = 9;
    this.clapFired = true;
    this.clapCd = 0;
    this.smashT = 9;
    this.smashCd = 0;
    this.smashFired = true;
    this.diveSmash = false;
    this.preview.hide();
    this.game.hud.setCharge(null);
    p.leaping = false;
    p.charging = false;
  }

  /** Called every frame after the hero has moved. */
  update(dt, input, canAct) {
    const g = this.game;
    const p = g.player;
    this.clapCd = Math.max(0, this.clapCd - dt);
    this.smashCd = Math.max(0, this.smashCd - dt);

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
    // charge bar and the arc of where he'll land
    if (this.charging && this.charge > 0.04) {
      const k = Math.max(0.15, this.charge);
      this.preview.show(p.pos, this.leapVelocity(k, tmp2), this.slamRadius(k * 0.8), dt);
      g.hud.setCharge(this.charge);
    } else {
      this.preview.hide();
      g.hud.setCharge(null);
    }

    // ---- Granite Smash: right mouse ----
    if (canAct && input.pressed('laser') && !g.abilities.carry.held && !this.charging) {
      if (this.smashCd > 0) {
        // recovering
      } else if (g.meters.energy < GRANITE.smashCost) {
        g.hud.toast('Not enough energy to smash', 'warn', 1);
      } else if (p.onGround) {
        g.meters.drain(GRANITE.smashCost);
        this.smashCd = GRANITE.smashCooldown;
        this.smashT = 0;
        this.smashFired = false;
        g.audio.play('whoosh');
      } else if (!this.diveSmash) {
        // in mid-air: plunge straight down and slam
        g.meters.drain(GRANITE.smashCost);
        this.smashCd = GRANITE.smashCooldown;
        this.diveSmash = true;
        p.vel.y = Math.min(p.vel.y, -45);
        p.leapVel.x *= 0.4;
        p.leapVel.z *= 0.4;
        g.audio.play('whoosh');
      }
    }
    this.smashT += dt;
    if (!this.smashFired && this.smashT >= 0.3) {
      this.smashFired = true;
      this.smash(1);
    }

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
    this.leapVelocity(k, p.vel);
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

  /** Slam radius for a landing strength k (0..1). */
  slamRadius(k) {
    return 3 + 5 * k;
  }

  /** Touchdown (from a leap or any fall): the harder he lands, the bigger the slam. */
  onLand(speed) {
    const g = this.game;
    const p = g.player;
    if (this.diveSmash) {
      // the mid-air smash: always a full-power slam
      this.diveSmash = false;
      p.leaping = false;
      p.landT = 0.6;
      this.smash(1.25);
      return;
    }
    const k = Math.max(p.leaping ? this.leapK * 0.8 : 0, Math.min(1, (speed - 14) / 50));
    p.leaping = false;
    if (k <= 0.05) return;
    p.landT = 0.35 + 0.25 * k;
    const at = tmp.set(p.pos.x, p.pos.y + 0.1, p.pos.z);
    g.audio.play('land');
    if (k > 0.55) g.audio.play('stomp');
    g.rig.shake = Math.max(g.rig.shake, 0.3 + 0.5 * k);
    g.effects.dust(at, 20 + 40 * k, 2 + 2 * k);
    g.rings.spawn({ pos: at.clone().setY(at.y + 0.1), r0: 0.5, r1: this.slamRadius(k) * 1.2, life: 0.45, opacity: 0.6, color: 0xfff1d0, thick: true });
    g.addDanger(p.pos, 10 + 10 * k, 1.5);
    if (k > 0.3) g.hitStop(0.05);
    this.crack(p.pos, Math.round(1 + 2 * k));
    this.blast(this.slamRadius(k), 15 + 45 * k, 6 + 14 * k, 5 + 8 * k);
  }

  /** Radial knock-back + damage around Granite (slams and smashes). */
  blast(r, dmgMax, out, up) {
    const g = this.game;
    const p = g.player;
    for (const e of g.entities.query(tmp2.set(p.pos.x, p.pos.y + 0.5, p.pos.z), r + 1, (x) => !x.carried && !x.removed)) {
      const sp = e.sphere?.();
      if (sp) {
        if (sp.c.distanceTo(p.pos) - sp.r < r) e.onBreath?.(0.5, 1);
        continue;
      }
      const c = e.centerInto(new THREE.Vector3());
      const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z);
      if (d > r || Math.abs(c.y - p.pos.y) > 4) continue;
      const f = 1 - d / r;
      const dir = new THREE.Vector3(c.x - p.pos.x, 0, c.z - p.pos.z).normalize();
      const m = Math.max(1, e.mass);
      if (e.kind === 'car') e.driving = false;
      const dmg = e.team === 'civ' ? 4 * f : dmgMax * (0.4 + 0.6 * f);
      const dealt = e.damage(dmg, { type: 'impact', knock: dir.multiplyScalar(out * f * m).setY(up * (0.4 + 0.6 * f) * m), source: p });
      if (dealt > 1 && e.team !== 'civ') g.markers.damageNumber(c, dealt, '#ffd34d');
    }
  }

  /** Granite Smash: both fists into the ground. power 1 = standing smash, more for the dive. */
  smash(power) {
    const g = this.game;
    const p = g.player;
    const R = GRANITE.smashRadius * power;
    const at = new THREE.Vector3(p.pos.x, p.pos.y + 0.12, p.pos.z);
    p.landT = Math.max(p.landT, 0.45);
    g.audio.play('stomp');
    g.audio.play('land');
    g.rig.shake = Math.max(g.rig.shake, 0.85);
    g.rig.fovPunch = 6;
    g.hitStop(0.08);
    g.addDanger(p.pos, R * 2.5, 2);
    // a fast bright ring, a slower wide one, and a burst of rubble
    g.rings.spawn({ pos: at, r0: 0.6, r1: R * 1.15, life: 0.4, opacity: 0.85, color: 0xffffff, thick: true });
    g.rings.spawn({ pos: at.clone().setY(at.y + 0.04), r0: 1, r1: R * 1.6, life: 0.75, opacity: 0.45, color: 0xffc27a });
    g.effects.dust(at, 70, R * 0.45);
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2, d = 1 + Math.random() * 2;
      g.effects.debris(new THREE.Vector3(p.pos.x + Math.cos(a) * d, p.pos.y + 0.3, p.pos.z + Math.sin(a) * d), 0x8d8a82, 8, 9);
    }
    this.crack(p.pos, Math.round(2 + power));
    // windows rattle out on the lower floors nearby
    const w = g.world;
    const x0 = Math.floor(p.pos.x), y0 = Math.floor(p.pos.y), z0 = Math.floor(p.pos.z);
    let glass = 0;
    for (let y = 0; y <= 3; y++) {
      for (let dz = -5; dz <= 5; dz++) {
        for (let dx = -5; dx <= 5; dx++) {
          if (dx * dx + dz * dz > 26 || Math.random() < 0.5) continue;
          const b = w.get(x0 + dx, y0 + y, z0 + dz);
          if ((b >= B.GLASS_BLUE && b <= B.GLASS_DARK) || b === B.DOOR) {
            w.edit(x0 + dx, y0 + y, z0 + dz, B.AIR);
            glass++;
          }
        }
      }
    }
    if (glass) g.audio.play('glass');
    // everything around gets thrown up into the air
    this.blast(R, 70 * power, 9, 15);
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
    g.rig.shake = Math.max(g.rig.shake, 0.7);
    g.rig.fovPunch = 10;
    g.hitStop(0.06);
    g.addDanger(origin, R, 1.5);
    // the visible blast: a flash at the hands, then rings racing forward and widening
    // like a cone of air, plus a fan of dust
    g.rings.spawn({ pos: origin.clone().addScaledVector(dir, 0.6), normal: dir, r0: 0.2, r1: 2.4, life: 0.18, opacity: 1, color: 0xffffff, thick: true });
    const coneR = R * Math.tan(Math.acos(GRANITE.clapCone));
    for (let i = 0; i < 4; i++) {
      const life = 0.42 + i * 0.07;
      g.rings.spawn({ pos: origin.clone().addScaledVector(dir, 0.8 + i * 0.6), normal: dir, r0: 0.6 + i * 0.3, r1: coneR * (1 - i * 0.12), life, speed: (R / life) * (1 - i * 0.15), opacity: 0.55 - i * 0.1, color: i % 2 ? 0xcfe9ff : 0xffffff, thick: i === 0 });
    }
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
      const knock = dir.clone().multiplyScalar((14 + 26 * f) * m * (car ? 1.4 : 1));
      knock.y += (car ? 7 + 6 * f : 4 + 6 * f) * m;
      if (e.kind === 'car') e.driving = false;
      const dmg = e.team === 'civ' ? 0 : e.kind === 'car' ? 18 * f : 22 + 40 * f;
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
    hud.ab.senses.classList.toggle('active', this.smashT < 0.6 || this.diveSmash);
    hud.ab.senses.classList.toggle('disabled', this.smashCd > 0 || this.game.meters.energy < GRANITE.smashCost);
  }
}
