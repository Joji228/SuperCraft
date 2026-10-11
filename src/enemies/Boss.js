// Human-sized bosses: the Brute (free-roam mini-boss), Rook (Bank Job) and Skyhook (Bridge Collapse).
import * as THREE from 'three';
import { Thug } from './Thug.js';
import { Drone } from './Drone.js';
import { toward, steer, faceTowards, heroChest } from './AI.js';
import { CITY } from '../world/CityGenerator.js';
import { SX, SZ } from '../world/World.js';

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

/** Big bruiser: ground slams and charges. */
export class Brute extends Thug {
  constructor(game, x, y, z, opts = {}) {
    super(game, x, y, z, {
      health: opts.health || 360,
      scale: 1.55,
      weapon: 'fists',
      kind: 'brute',
      speed: 3.6,
      look: { skin: 0x8d5a3a, hair: 0x111111, shirt: 0x5d6d7e, pants: 0x283747, hat: 0xd35400, sleeves: 0x8d5a3a },
      ...opts,
    });
    this.boss = true;
    this.bossName = opts.name || 'THE BRUTE';
    this.noFlee = true;
    this.mass = 6;
    this.windup = 0;
    this.charging = 0;
    this.chargeCd = 4;
    this.persistent = true;
  }

  damage(amount, opts) {
    // bosses only flinch from big hits
    const dealt = super.damage(amount, opts ? { ...opts, knock: opts.knock && opts.knock.clone().multiplyScalar(0.25) } : opts);
    this.stun = 0;
    return dealt;
  }

  fight(dt, heroDist, toHero) {
    const g = this.game;
    const p = g.player;
    this.enraged = this.health < this.maxHealth * 0.5;
    const speed = this.enraged ? 5.2 : this.speed;
    this.chargeCd -= dt;
    if (this.windup > 0) {
      // arms raised before the slam
      this.windup -= dt;
      this.armsUp = true;
      steer(this, 0, 0, 0, dt);
      if (this.windup <= 0) {
        this.armsUp = false;
        this.slam();
      }
      return;
    }
    if (this.charging > 0) {
      this.charging -= dt;
      steer(this, this.chargeDir.x, this.chargeDir.z, 13, dt, 12);
      this.yaw = Math.atan2(this.chargeDir.x, this.chargeDir.z);
      if (toward(this, p.pos).d < 2.4 && Math.abs(p.pos.y - this.pos.y) < 2.5) {
        g.hurtPlayer(12, this.pos, 'melee');
        p.vel.addScaledVector(this.chargeDir, 18).setY(8);
        this.charging = 0;
      }
      if (this.hitWall) {
        this.charging = 0;
        this.stun = 1.2; // dazed after hitting a wall
        g.effects.dust(this.pos, 20, 1.5);
        g.rig.shake = Math.max(g.rig.shake, 0.4);
      }
      return;
    }
    faceTowards(this, p.pos.x, p.pos.z, dt, 8);
    if (heroDist < 4.5 && this.cooldown <= 0) {
      this.windup = this.enraged ? 0.45 : 0.7;
      this.cooldown = this.enraged ? 1.6 : 2.4;
      return;
    }
    if (this.chargeCd <= 0 && toHero.d > 7 && toHero.d < 28 && Math.abs(p.pos.y - this.pos.y) < 4) {
      this.chargeCd = this.enraged ? 4 : 6.5;
      this.charging = 1.3;
      this.chargeDir = toHero.dir.clone();
      g.audio.play('alert', this.pos);
      return;
    }
    if (toHero.d > 2.5) steer(this, toHero.dir.x, toHero.dir.z, speed, dt);
    if (this.hitWall && this.onGround) this.vel.y = 10;
  }

  slam() {
    const g = this.game;
    const p = g.player;
    const r = 5;
    g.effects.shockwave(this.pos, r);
    g.audio.play('stomp', this.pos);
    g.rig.shake = Math.max(g.rig.shake, 0.7);
    const t = toward(this, p.pos);
    if (t.d < r && p.pos.y - this.pos.y < 3) {
      g.hurtPlayer(15, this.pos, 'melee');
      p.vel.addScaledVector(t.dir, 16).setY(10);
      p.onGround = false;
    }
    for (const e of g.entities.query(this.pos, r, (x) => x !== this && x.team !== 'enemy' && !x.carried)) {
      e.damage(10, { type: 'explosion', knock: toward(this, e.pos).dir.clone().multiplyScalar(10).setY(6) });
    }
  }
}

/** Gang leader: shotgun blasts; at half health throws grenades and calls backup. */
export class Rook extends Thug {
  constructor(game, x, y, z, opts = {}) {
    super(game, x, y, z, {
      health: opts.health || 520,
      scale: 1.3,
      weapon: 'gun',
      kind: 'rook',
      speed: 3.8,
      look: { skin: 0xe2a77e, hair: 0x111111, shirt: 0x4a148c, pants: 0x1a1a1a, hat: 0xf1c40f, sleeves: 0x4a148c },
      ...opts,
    });
    this.boss = true;
    this.bossName = 'ROOK, GANG LEADER';
    this.noFlee = true;
    this.mass = 4;
    this.grenadeCd = 3;
    this.calledBackup = false;
    this.persistent = true;
  }

  damage(amount, opts) {
    const dealt = super.damage(amount, opts ? { ...opts, knock: opts.knock && opts.knock.clone().multiplyScalar(0.4) } : opts);
    if (this.stun > 0) this.stun = Math.min(this.stun, 0.15);
    return dealt;
  }

  fight(dt, heroDist, toHero) {
    const g = this.game;
    const p = g.player;
    this.enraged = this.health < this.maxHealth * 0.5;
    faceTowards(this, p.pos.x, p.pos.z, dt, 10);
    const want = 9;
    if (toHero.d > want + 3) steer(this, toHero.dir.x, toHero.dir.z, this.speed, dt);
    else if (toHero.d < want - 4) steer(this, -toHero.dir.x, -toHero.dir.z, this.speed, dt);
    else steer(this, -toHero.dir.z * 0.6, toHero.dir.x * 0.6, 2.5, dt);
    if (this.hitWall && this.onGround) this.vel.y = 9;
    const eye = tmpA.set(this.pos.x, this.pos.y + 1.9, this.pos.z);
    const chest = heroChest(g, tmpB);
    if (this.cooldown <= 0 && heroDist < 32) {
      this.cooldown = this.enraged ? 1.2 : 1.7;
      this.attackAnim = 1;
      for (let i = 0; i < 6; i++) g.projectiles.fire('pellet', eye, chest, this, 0.09);
      g.audio.play('gunshot', this.pos);
      g.audio.play('punchHit', this.pos);
      g.addDanger(this.pos, 22, 2);
    }
    if (this.enraged) {
      if (!this.calledBackup) {
        this.calledBackup = true;
        g.hud.toast('Rook: "Boys, get over here!"', 'warn');
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          const t = new Thug(g, this.pos.x + Math.cos(a) * 6, this.pos.y + 1, this.pos.z + Math.sin(a) * 6, { weapon: 'gun' });
          t.unstick();
          t.tags.add('bank');
          t.alert();
          g.entities.add(t);
        }
      }
      this.grenadeCd -= dt;
      if (this.grenadeCd <= 0 && heroDist < 30) {
        this.grenadeCd = 3.5;
        g.projectiles.fire('grenade', eye, chest, this, 0.05);
        g.audio.play('throw', this.pos);
      }
    }
  }
}

/** Jetpack villain: flies, fires missiles, drops drones, and tries to escape when hurt. */
export class Skyhook extends Thug {
  constructor(game, x, y, z, opts = {}) {
    super(game, x, y, z, {
      health: opts.health || 480,
      scale: 1.15,
      weapon: 'jet',
      kind: 'skyhook',
      speed: 14,
      look: { skin: 0xf1c7a4, hair: 0xc9a35a, shirt: 0x1e8449, pants: 0x145a32, hat: 0x7f8c8d, sleeves: 0x1e8449 },
      ...opts,
    });
    this.boss = true;
    this.bossName = 'SKYHOOK';
    this.noFlee = true;
    this.flying = true;
    this.mass = 3;
    this.missileCd = 2.5;
    this.boltCd = 1;
    this.droppedDrones = false;
    this.escaping = false;
    this.escapeTarget = new THREE.Vector3();
    this.taunted = false;
    this.persistent = true;
    this.carryable = false;
    // jetpack and flame on his back
    this.visualScale = 1.15;
    this.boxes = [
      { y: 1.05, z: -0.3, w: 0.5, h: 0.6, d: 0.26, color: 0x7f8c8d },
      { y: 0.72, z: -0.3, x: 0.14, w: 0.14, h: 0.12, d: 0.14, color: 0x333333 },
      { y: 0.72, z: -0.3, x: -0.14, w: 0.14, h: 0.12, d: 0.14, color: 0x333333 },
      { y: 0.5, z: -0.3, x: 0.14, w: 0.12, h: 0.35, d: 0.12, color: 0xffa020, glow: true },
      { y: 0.5, z: -0.3, x: -0.14, w: 0.12, h: 0.35, d: 0.12, color: 0xffa020, glow: true },
    ];
  }

  get canFreeze() {
    return this.alive;
  }

  onDefeated() {
    super.onDefeated();
    this.flying = false;
    this.boxes[3].hidden = this.boxes[4].hidden = true;
  }

  damage(amount, opts) {
    const dealt = super.damage(amount, opts ? { ...opts, knock: opts.knock && opts.knock.clone().multiplyScalar(0.5) } : opts);
    this.stun = Math.min(this.stun, 0.2);
    return dealt;
  }

  update(dt) {
    if (this.alive && this.frozen > 0) this.flying = false;
    else if (this.alive) this.flying = true;
    super.update(dt);
    // jet flame flicker
    const f = 0.25 + Math.random() * 0.2;
    this.boxes[3].h = this.boxes[4].h = this.alive && this.flying ? f : 0.01;
    if (this.alive && this.flying && Math.random() < 0.6) this.game.effects.smoke(tmpA.set(this.pos.x, this.pos.y + 0.3, this.pos.z), 1, 0.25, 0.5);
  }

  animate(dt) {
    super.animate(dt);
    if (this.alive && this.flying) {
      this.pose.legL = this.pose.legR = 0.15;
      this.pose.armL = 0.3;
    }
  }

  fight(dt) {
    const g = this.game;
    const p = g.player;
    const frac = this.health / this.maxHealth;
    this.enraged = frac < 0.6;
    if (frac < 0.6 && !this.droppedDrones) {
      this.droppedDrones = true;
      g.hud.toast('Skyhook launches drones!', 'warn');
      for (let i = 0; i < 3; i++) {
        const d = new Drone(g, this.pos.x + (i - 1) * 2, this.pos.y + 1, this.pos.z);
        d.tags.add('bridge');
        g.entities.add(d);
      }
    }
    if (frac < 0.35 && !this.taunted) {
      this.taunted = true;
      this.escaping = true;
      this.pickEscape();
      g.hud.toast('Skyhook is getting away! Chase him!', 'warn', 4);
      g.audio.play('alert');
    }
    const heroDist = this.pos.distanceTo(p.pos);
    let target;
    if (this.escaping) {
      target = this.escapeTarget;
      if (this.pos.distanceTo(target) < 8) this.pickEscape();
    } else {
      // circle above the hero
      const a = this.age * 0.4;
      target = tmpB.set(p.pos.x + Math.cos(a) * 18, Math.max(p.pos.y + 10, CITY.G + 18), p.pos.z + Math.sin(a) * 18);
    }
    const sp = this.escaping ? 21 : 14;
    const k = 1 - Math.exp(-2.5 * dt);
    const dx = target.x - this.pos.x, dy = target.y - this.pos.y, dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    this.vel.x += ((dx / d) * sp - this.vel.x) * k;
    this.vel.y += ((dy / d) * sp - this.vel.y) * k;
    this.vel.z += ((dz / d) * sp - this.vel.z) * k;
    if (this.escaping) this.yaw = Math.atan2(this.vel.x, this.vel.z);
    else faceTowards(this, p.pos.x, p.pos.z, dt, 8);
    this.pose.tilt = this.escaping ? -0.6 : 0;

    const eye = tmpA.set(this.pos.x, this.pos.y + 1.7, this.pos.z);
    const chest = heroChest(g);
    this.missileCd -= dt;
    this.boltCd -= dt;
    if (heroDist < 60) {
      if (this.missileCd <= 0) {
        this.missileCd = this.escaping ? 2.2 : 3.2;
        for (let i = 0; i < (this.enraged ? 3 : 2); i++) g.projectiles.fire('missile', eye, chest, this, 0.25);
        g.audio.play('throw', this.pos);
      }
      if (this.boltCd <= 0) {
        this.boltCd = 0.9;
        g.projectiles.fire('bolt', eye, chest, this, 0.04);
        g.audio.play('zap', this.pos);
      }
    }
  }

  pickEscape() {
    const a = Math.random() * Math.PI * 2;
    const r = 90 + Math.random() * 60;
    this.escapeTarget.set(
      Math.min(SX - 20, Math.max(20, 256 + Math.cos(a) * r)),
      CITY.G + 25 + Math.random() * 25,
      Math.min(SZ - 20, Math.max(20, 256 + Math.sin(a) * r)),
    );
  }
}
