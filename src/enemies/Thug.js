// Street thugs: melee (bats) or guns. Patrol, chase, attack, flee at low health.
import * as THREE from 'three';
import { Humanoid } from '../entities/Humanoid.js';
import { toward, steer, faceTowards, canSee, heroChest } from './AI.js';

const LOOKS = [
  { skin: 0xc68a62, hair: 0x111111, shirt: 0x2b2b2b, pants: 0x1f3a5f, hat: 0xc0392b },
  { skin: 0xf1c7a4, hair: 0x5a3a22, shirt: 0x4a235a, pants: 0x222222, hat: 0x222222 },
  { skin: 0x9a6440, hair: 0x111111, shirt: 0x7b241c, pants: 0x2c2c2c, hat: 0x7b241c },
  { skin: 0xe2a77e, hair: 0x2b1d14, shirt: 0x1c2833, pants: 0x4d4d4d, hat: 0xf39c12 },
];

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

export class Thug extends Humanoid {
  constructor(game, x, y, z, opts = {}) {
    const look = { ...LOOKS[Math.floor(Math.random() * LOOKS.length)], scale: opts.scale || 1, ...(opts.look || {}) };
    super(game, { health: opts.health || 60, team: 'enemy', kind: opts.kind || 'thug', look });
    this.pos.set(x, y, z);
    this.home = new THREE.Vector3(x, y, z);
    this.weapon = opts.weapon || (Math.random() < 0.5 ? 'gun' : 'bat');
    this.state = 'patrol';
    this.aggro = opts.aggro ?? 32;
    this.cooldown = 1 + Math.random();
    this.wanderTarget = null;
    this.speed = opts.speed || 4.2;
    this.dmgMul = opts.dmgMul || 1;
    this.victim = null;
    this.alerted = false;
    this.koTime = 0;
    this.carryLabel = 'Knocked-out thug';
    this.carryable = false;
    this.carryWhenDown = true;
    this.throwable = true;
    this.mass = 1.2 * (opts.scale || 1);
    this.sensesColor = () => (this.alive ? '#ff3b3b' : null);
    this.dangerCd = 0;
  }

  onDefeated() {
    this.state = 'ko';
    this.down = true;
    this.carryable = true;
    this.koTime = 0;
    this.game.audio.play('ko', this.pos);
    this.game.effects.sparks(this.center, 8, null, 0xffffff);
  }

  damage(amount, opts) {
    const dealt = super.damage(amount, opts);
    if (this.alive && dealt > 0) {
      this.alerted = true;
      if (opts?.type === 'punch') this.stun = 0.35;
    }
    return dealt;
  }

  alert() {
    this.alerted = true;
  }

  update(dt) {
    if (!this.alive) {
      this.koTime += dt;
      this.vel.x *= 0.9;
      this.vel.z *= 0.9;
      super.update(dt);
      if (this.koTime > 45 && !this.persistent && !this.carried) this.remove();
      return;
    }
    if (this.frozen > 0 || this.stun > 0 || this.carried) {
      super.update(dt);
      return;
    }
    const g = this.game;
    const p = g.player;
    const toHero = toward(this, p.pos);
    const heroDist = Math.hypot(toHero.d, p.pos.y - this.pos.y);
    this.cooldown -= dt;
    this.dangerCd -= dt;

    if (!this.alerted && heroDist < this.aggro) this.alerted = true;
    if (this.health < this.maxHealth * 0.22 && this.state !== 'flee' && !this.noFlee) this.state = 'flee';
    else if (this.alerted && this.state !== 'flee') this.state = 'fight';

    if (this.state === 'flee') {
      const d = toHero.dir;
      steer(this, -d.x, -d.z, this.speed * 1.2, dt);
      this.yaw = Math.atan2(this.vel.x, this.vel.z);
      if (this.hitWall && this.onGround) this.vel.y = 7;
      if (heroDist > 70 && !this.persistent) this.remove();
    } else if (this.state === 'fight') {
      this.fight(dt, heroDist, toHero);
    } else {
      this.patrol(dt);
    }
    if (this.dangerCd <= 0 && this.alerted) {
      g.addDanger(this.pos, 9, 1.2);
      this.dangerCd = 1;
    }
    super.update(dt);
  }

  patrol(dt) {
    if (this.victim && !this.victim.removed && this.victim.alive) {
      // menacing the victim (muggings)
      const t = toward(this, this.victim.pos);
      if (t.d > 1.8) steer(this, t.dir.x, t.dir.z, 1.6, dt);
      else steer(this, 0, 0, 0, dt);
      faceTowards(this, this.victim.pos.x, this.victim.pos.z, dt);
      if (Math.random() < dt * 0.5) this.attackAnim = 1;
      return;
    }
    if (!this.wanderTarget || toward(this, this.wanderTarget).d < 1 || Math.random() < dt * 0.1) {
      this.wanderTarget = this.home.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10));
    }
    const t = toward(this, this.wanderTarget);
    steer(this, t.dir.x, t.dir.z, 1.4, dt);
    if (this.vel.lengthSq() > 0.1) this.yaw = Math.atan2(this.vel.x, this.vel.z);
  }

  fight(dt, heroDist, toHero) {
    const g = this.game;
    const p = g.player;
    faceTowards(this, p.pos.x, p.pos.z, dt, 12);
    const eye = tmpA.set(this.pos.x, this.pos.y + 1.5 * this.scale, this.pos.z);
    const chest = heroChest(g, tmpB);
    if (this.weapon === 'bat') {
      if (toHero.d > 1.6) steer(this, toHero.dir.x, toHero.dir.z, this.speed, dt);
      else steer(this, 0, 0, 0, dt);
      if (this.hitWall && this.onGround && toHero.d > 2) this.vel.y = 8;
      if (heroDist < 2.3 && this.cooldown <= 0) {
        this.cooldown = 1.1;
        this.attackAnim = 1;
        g.audio.play('whoosh', this.pos);
        setTimeout(() => {
          if (this.alive && !this.frozen && toward(this, g.player.pos).d < 2.6 && Math.abs(g.player.pos.y - this.pos.y) < 2.5) {
            g.hurtPlayer(7 * this.dmgMul, this.pos, 'melee');
          }
        }, 180);
      }
    } else {
      // keep a shooting distance
      const want = 11;
      if (toHero.d > want + 4) steer(this, toHero.dir.x, toHero.dir.z, this.speed, dt);
      else if (toHero.d < want - 5) steer(this, -toHero.dir.x, -toHero.dir.z, this.speed * 0.7, dt);
      else steer(this, -toHero.dir.z * 0.4, toHero.dir.x * 0.4, 1.5, dt); // strafe
      if (this.cooldown <= 0 && heroDist < 45 && canSee(g.world, eye, chest)) {
        this.cooldown = 1.1 + Math.random() * 0.8;
        this.attackAnim = 0.6;
        g.projectiles.fire('bullet', eye, chest, this, 0.045);
        g.audio.play('gunshot', this.pos);
        g.effects.sparks(eye.clone().addScaledVector(toHero.dir, 0.6), 3, toHero.dir, 0xffe08a);
        g.addDanger(this.pos, 20, 2);
      }
    }
  }
}
