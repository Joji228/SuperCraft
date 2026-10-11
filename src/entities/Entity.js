// Base class for everything that lives in the city: people, cars, props, enemies, bosses.
import * as THREE from 'three';
import { Body } from '../physics/Body.js';

let nextId = 1;
const tmp = new THREE.Vector3();

export class Entity extends Body {
  constructor(game, { halfW = 0.4, height = 1.8, health = 50, team = 'neutral', kind = 'entity' } = {}) {
    super(game.world, halfW, height);
    this.id = nextId++;
    this.game = game;
    this.kind = kind;
    this.team = team; // 'civ' | 'enemy' | 'neutral'
    this.health = health;
    this.maxHealth = health;
    this.alive = true; // false once defeated/broken (may still be visible)
    this.removed = false; // true once taken out of the world
    this.yaw = 0;
    this.gravity = 32;
    this.friction = 8; // ground friction when not driving itself
    this.frozen = 0; // seconds left frozen
    this.freezeBuild = 0; // 0..1 from super breath exposure
    this.hitFlash = 0;
    this.stun = 0;
    this.carryable = false;
    this.carried = false;
    this.carryHeavy = false; // carried overhead (cars)
    this.thrown = false; // flying after being thrown by the hero
    this.mass = 1;
    this.pushable = true;
    this.punchable = true;
    this.tags = new Set();
    this.sensesColor = null; // highlight colour for super senses, or null
    this.age = 0;
    this.persistent = false; // never auto-despawned (mission entities)
  }

  get center() {
    return tmp.set(this.pos.x, this.pos.y + this.height * 0.5, this.pos.z);
  }

  centerInto(v) {
    return v.set(this.pos.x, this.pos.y + this.height * 0.5, this.pos.z);
  }

  /** Default physics: gravity + ground friction. Subclasses call this or drive themselves. */
  physics(dt) {
    if (this.carried) return;
    if (!this.flying) this.vel.y = Math.max(this.vel.y - this.gravity * dt, -60);
    if (this.onGround) {
      const k = Math.exp(-this.friction * dt);
      this.vel.x *= k;
      this.vel.z *= k;
    }
    this.move(dt);
    if (this.thrown) this.thrownHits();
    if (this.thrown && (this.onGround || this.hitWall) && this.impact > 6) this.onImpact(this.impact);
    if (this.thrown && this.onGround && Math.hypot(this.vel.x, this.vel.z) < 1) this.thrown = false;
  }

  /** A thrown object smacks the first enemy it flies into. */
  thrownHits() {
    const speed = this.vel.length();
    if (speed < 8) return;
    const victims = this.game.entities.query(this.center, this.halfW + 1.1, (e) => e !== this && e.team === 'enemy' && e.alive && !e.carried);
    if (!victims.length) return;
    const dmg = 20 + 25 * Math.min(3, Math.sqrt(this.mass));
    for (const v of victims) {
      const knock = this.vel.clone().multiplyScalar(0.5);
      knock.y += 5;
      const dealt = v.damage(dmg, { type: 'impact', knock, source: this.thrownBy });
      this.game.markers?.damageNumber(v.centerInto(new THREE.Vector3()), dealt, '#ffd34d');
    }
    this.game.effects?.impact(this.center, null, 1.4);
    this.game.audio?.play('punchHeavy', this.pos);
    this.vel.multiplyScalar(0.2);
    this.onImpact(20);
  }

  /** Called when the entity slams into something after being thrown or knocked back. */
  onImpact(speed) {
    this.thrown = false;
    if (speed > 12) this.damage(speed * 1.2, { type: 'impact' });
  }

  update(dt) {
    this.age += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.stun = Math.max(0, this.stun - dt);
    if (this.frozen > 0) {
      this.frozen = Math.max(0, this.frozen - dt);
      if (this.frozen === 0) this.game.effects?.iceShatter(this.center, 6);
    }
    this.freezeBuild = Math.max(0, this.freezeBuild - dt * 0.4);
    this.physics(dt);
  }

  /**
   * opts: { type: 'punch'|'laser'|'impact'|'fire'|'explosion'|'bullet', knock: Vector3, source }
   * Returns the damage actually dealt.
   */
  damage(amount, opts = {}) {
    if (!this.alive || amount <= 0) return 0;
    if (this.frozen > 0 && opts.type === 'punch') amount *= 2; // shatter bonus
    this.health -= amount;
    // continuous laser damage only flickers, so the target doesn't just turn white
    if (opts.type !== 'laser' && opts.type !== 'fire') this.hitFlash = 0.12;
    else if (Math.random() < 0.2) this.hitFlash = 0.04;
    if (opts.knock && this.pushable && !this.carried) {
      this.vel.addScaledVector(opts.knock, 1 / this.mass);
      if (opts.knock.lengthSq() > 64) this.thrown = true;
      this.onGround = false;
    }
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.onDefeated(opts);
      this.game.events?.emit('defeated', this, opts);
    }
    return amount;
  }

  onDefeated() {}

  /** Super breath exposure; strength ~ seconds of breath. */
  chill(amount) {
    if (!this.alive) return;
    this.freezeBuild += amount;
    if (this.freezeBuild >= 1 && this.frozen <= 0 && this.canFreeze) {
      this.frozen = this.freezeTime || 3.5;
      this.freezeBuild = 0;
      this.game.effects?.iceBurst(this.center);
      this.game.audio?.play('freeze', this.pos);
    }
  }

  get canFreeze() {
    return this.team === 'enemy';
  }

  remove() {
    this.removed = true;
  }
}
