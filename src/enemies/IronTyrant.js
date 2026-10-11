// The Iron Tyrant: a giant walking mech, final boss of the campaign.
// Phase 1: stomps, plasma cannon, missile volleys.
// Phase 2: energy shield. Freeze it with super breath, then drain its shield bar with any attack.
// Phase 3: core exposed (laser does double damage), sweeping beam, reinforcements.
import * as THREE from 'three';
import { Entity } from '../entities/Entity.js';
import { Drone } from './Drone.js';
import { Thug } from './Thug.js';
import { toward, heroChest } from './AI.js';
import { CITY } from '../world/CityGenerator.js';
import { B } from '../world/Blocks.js';
import { tileTexture } from '../world/Textures.js';

/** Icy shield textures: frosted, then with more and more cracks. */
function iceTexture(cracks, seed) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d');
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#cfefff';
  g.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 700; i++) {
    const v = 200 + Math.floor(rnd() * 55);
    g.fillStyle = 'rgb(' + (v - 30) + ',' + (v - 5) + ',255)';
    g.fillRect(Math.floor(rnd() * 128), Math.floor(rnd() * 64), 2, 2);
  }
  g.strokeStyle = '#ffffff';
  g.lineWidth = 1;
  for (let i = 0; i < 10; i++) {
    g.beginPath();
    let x = rnd() * 128, y = rnd() * 64;
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) g.lineTo((x += (rnd() - 0.5) * 20), (y += (rnd() - 0.5) * 12));
    g.stroke();
  }
  g.strokeStyle = '#1b4f72';
  g.lineWidth = 2;
  for (let i = 0; i < cracks * 6; i++) {
    g.beginPath();
    let x = 64 + (rnd() - 0.5) * 60, y = 32 + (rnd() - 0.5) * 30;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) g.lineTo((x += (rnd() - 0.5) * 30), (y += (rnd() - 0.5) * 18));
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  return t;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const STEEL = 0x5b6470;
const DARK = 0x2c3038;
const TRIM = 0xc0392b;

export class IronTyrant extends Entity {
  constructor(game, x, y, z, arena) {
    super(game, { halfW: 2.6, height: 10.5, health: 1800, team: 'enemy', kind: 'tyrant' });
    this.pos.set(x, y, z);
    this.arena = arena; // { x, z, r }
    this.boss = true;
    this.bossName = 'THE IRON TYRANT';
    this.persistent = true;
    this.pushable = false;
    this.flying = true; // kinematic: walks on the street level, ignores voxels
    this.mass = 100;
    this.phase = 1;
    this.state = 'walk';
    this.stateTime = 0;
    this.attackCd = 3;
    this.missileCd = 7;
    this.walkPhase = 0;
    this.shield = false;
    this.shieldIce = 0;
    this.shieldCracks = 0;
    this.shieldDown = 0;
    this.sweepAngle = 0;
    this.deathTime = 0;
    this.sensesColor = () => (this.alive ? '#ff3b3b' : null);
    this.boxes = [
      // legs (indices 0-5)
      { x: 1.2, y: 2.0, w: 1.2, h: 4.0, d: 1.4, color: STEEL },
      { x: -1.2, y: 2.0, w: 1.2, h: 4.0, d: 1.4, color: STEEL },
      { x: 1.2, y: 0.35, z: 0.3, w: 1.6, h: 0.7, d: 2.4, color: DARK },
      { x: -1.2, y: 0.35, z: 0.3, w: 1.6, h: 0.7, d: 2.4, color: DARK },
      { x: 1.2, y: 3.9, w: 1.4, h: 0.6, d: 1.6, color: TRIM },
      { x: -1.2, y: 3.9, w: 1.4, h: 0.6, d: 1.6, color: TRIM },
      // hips and torso
      { y: 4.6, w: 3.6, h: 1.0, d: 2.0, color: DARK },
      { y: 6.9, w: 5.0, h: 3.6, d: 3.0, color: STEEL },
      { y: 8.9, w: 5.4, h: 0.5, d: 3.2, color: TRIM },
      // core (index 9)
      { y: 6.8, z: 1.55, w: 1.4, h: 1.4, d: 0.2, color: 0x40e0ff, glow: true },
      // head (10-11)
      { y: 9.7, w: 1.8, h: 1.2, d: 1.8, color: DARK },
      { y: 9.75, z: 0.92, w: 1.3, h: 0.25, d: 0.1, color: 0xff2020, glow: true },
      // shoulders + arms with cannons (12-17)
      { x: 3.1, y: 8.3, w: 1.4, h: 1.4, d: 1.8, color: TRIM },
      { x: -3.1, y: 8.3, w: 1.4, h: 1.4, d: 1.8, color: TRIM },
      { x: 3.2, y: 6.2, z: 0.5, w: 1.0, h: 3.2, d: 1.0, color: STEEL },
      { x: -3.2, y: 6.2, z: 0.5, w: 1.0, h: 3.2, d: 1.0, color: STEEL },
      { x: 3.2, y: 4.6, z: 1.3, w: 0.9, h: 0.9, d: 2.0, color: DARK },
      { x: -3.2, y: 4.6, z: 1.3, w: 0.9, h: 0.9, d: 2.0, color: DARK },
      // missile pods (18-19)
      { x: 1.6, y: 9.5, z: -0.8, w: 1.2, h: 0.9, d: 1.2, color: DARK },
      { x: -1.6, y: 9.5, z: -0.8, w: 1.2, h: 0.9, d: 1.2, color: DARK },
    ];
    this.legs = [this.boxes[0], this.boxes[1], this.boxes[2], this.boxes[3], this.boxes[4], this.boxes[5]];
    this.core = this.boxes[9];

    // shield bubble
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(7.5, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0x60d0ff, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.shieldMesh.visible = false;
    game.scene.add(this.shieldMesh);
    // frozen look: chunky pixel-art ice blocks wrapped round the bubble, with cracks drawn over it
    this.iceTile = tileTexture('ice');
    this.iceTile.repeat.set(14, 7);
    this.crackTex = iceTexture(2, 4321);
    this.shieldFrozen = 0; // seconds the frozen shield stays frozen
    this.shieldHP = 0; // the blue bar under the boss bar while frozen
    this.shieldMax = 110;
    // second shell for cracks over the ice
    this.crackMesh = new THREE.Mesh(
      new THREE.SphereGeometry(7.6, 24, 16),
      new THREE.MeshBasicMaterial({ map: this.crackTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.crackMesh.visible = false;
    game.scene.add(this.crackMesh);

    // sweeping beam
    const beamGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
    this.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beam.visible = false;
    game.scene.add(this.beam);
  }

  get canFreeze() {
    return false;
  }

  /** He stands on the street and stomps through small things, so never lift him onto them. */
  unstick() {}

  remove() {
    super.remove();
    this.game.scene.remove(this.shieldMesh);
    this.game.scene.remove(this.crackMesh);
    this.game.scene.remove(this.beam);
  }

  /** Fraction for the blue shield bar (only while the shield is frozen). */
  shieldBar() {
    return this.shieldUp && this.shieldFrozen > 0 ? this.shieldHP / this.shieldMax : null;
  }

  get shieldUp() {
    return this.alive && this.shield && this.shieldDown <= 0;
  }

  /** While the shield is up, hits land on a sphere around the mech instead of its box. */
  sphere() {
    return this.shieldUp ? { c: this.shieldMesh.position, r: 7.5 } : null;
  }

  /** Hits only land when the shield is down; the core takes double laser damage in phase 3. */
  damage(amount, opts = {}) {
    const g = this.game;
    if (this.shieldUp) {
      if (this.shieldFrozen > 0) {
        // any attack chips the frozen shield; punches and thrown things hit hardest
        const mult = opts.type === 'punch' || opts.type === 'impact' ? 1.6 : 1;
        this.shieldHP -= amount * mult;
        if (opts.type !== 'laser' || Math.random() < 0.15) {
          g.audio.play('glass', this.pos);
          g.effects.iceBurst(this.shieldMesh.position.clone().lerp(g.player.pos, 0.85), opts.type === 'laser' ? 6 : 24);
        }
        if (opts.type === 'punch') {
          g.rig.shake = Math.max(g.rig.shake, 0.35);
          g.hitStop(0.06);
        }
        g.markers.damageNumber(this.shieldMesh.position.clone().lerp(g.player.pos, 0.8), amount * mult, '#7de8ff');
        if (this.shieldHP <= 0) {
          this.shieldHP = 0;
          this.shieldDown = 15;
          this.shieldCracks = 0;
          this.shieldIce = 0;
          this.shieldFrozen = 0;
          g.hud.toast('Shield shattered! Hit him now!', 'good');
          g.effects.iceBurst(this.center, 60);
          g.audio.play('objective');
        }
      } else {
        g.audio.play('shieldHit', this.pos);
        if (!this.hintCd || this.age > this.hintCd) {
          this.hintCd = this.age + 8;
          g.hud.toast('Freeze the shield with super breath (hold Q), then hit it!', 'warn', 4);
        }
      }
      return 0;
    }
    if (opts.type === 'laser' && this.phase === 3) amount *= 2;
    const dealt = super.damage(amount, { ...opts, knock: null });
    return dealt;
  }

  onBreath(dt) {
    if (!this.shieldUp || this.shieldFrozen > 0) return;
    this.shieldIce = Math.min(1, this.shieldIce + dt * 1.1);
    if (this.shieldIce >= 1) {
      this.shieldFrozen = 12;
      this.shieldHP = this.shieldMax;
      const g = this.game;
      g.hud.toast('Shield FROZEN! Smash it before it thaws!', 'good', 3);
      g.audio.play('freeze');
      g.effects.iceBurst(this.shieldMesh.position, 50);
    }
  }

  onDefeated() {
    this.state = 'dying';
    this.deathTime = 0;
    this.shieldMesh.visible = false;
    this.crackMesh.visible = false;
    this.beam.visible = false;
    this.game.audio.stopLoop('laser');
  }

  footPos(i, out) {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const lx = i === 0 ? 1.2 : -1.2;
    const lz = this.legs[i + 2].z || 0;
    return out.set(this.pos.x + c * lx + s * lz, this.pos.y, this.pos.z - s * lx + c * lz);
  }

  /** Smash whatever small stuff stands where a foot lands. */
  crush(at, r = 2) {
    const w = this.game.world;
    for (let y = CITY.G; y < CITY.G + 6; y++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = Math.floor(at.x) + dx, z = Math.floor(at.z) + dz;
          const b = w.get(x, y, z);
          if (b !== B.AIR && b !== B.WATER) w.edit(x, y, z, B.AIR);
        }
      }
    }
  }

  setPhase(n) {
    if (this.phase === n) return;
    const g = this.game;
    this.phase = n;
    if (n === 2) {
      this.shield = true;
      g.hud.toast('The Iron Tyrant raises an energy shield!', 'warn', 4);
      g.audio.play('alert');
      for (let i = 0; i < 2; i++) {
        const d = new Drone(g, this.pos.x + (i - 0.5) * 6, this.pos.y + 12, this.pos.z, { health: 30, style: 'sentinel' });
        d.tags.add('tyrant');
        g.entities.add(d);
      }
    }
    if (n === 3) {
      this.shield = false;
      this.shieldDown = 0;
      g.hud.toast('Its core is exposed! Burn it with your laser!', 'good', 5);
      g.audio.play('alert');
      for (let i = 0; i < 2; i++) {
        const a = (i / 2) * Math.PI * 2;
        const t = new Thug(g, this.pos.x + Math.cos(a) * 9, CITY.G + 1, this.pos.z + Math.sin(a) * 9, { weapon: i % 2 ? 'gun' : 'bat' });
        t.unstick();
        t.alert();
        t.tags.add('tyrant');
        g.entities.add(t);
      }
    }
  }

  update(dt) {
    this.age += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    const g = this.game;
    const p = g.player;
    if (this.state === 'dying') {
      this.deathTime += dt;
      this.roll = Math.min(0.5, this.deathTime * 0.15);
      if (Math.random() < dt * 8) {
        const e = tmpA.set(this.pos.x + (Math.random() - 0.5) * 6, this.pos.y + Math.random() * 10, this.pos.z + (Math.random() - 0.5) * 6);
        g.effects.explosion(e, 1.2);
        g.audio.play('explosion', e);
        g.rig.shake = Math.max(g.rig.shake, 0.5);
      }
      if (this.deathTime > 3.2 && !this.finished) {
        this.finished = true;
        g.effects.explosion(this.center, 3);
        g.audio.play('boom');
        g.hud.flash(0.8);
        this.hidden = true;
        g.events.emit('tyrantDown', this);
      }
      return;
    }

    if (this.state === 'drop') {
      // falling from the sky, then a huge landing
      this.dropSpeed = (this.dropSpeed || 20) + 40 * dt;
      this.pos.y -= this.dropSpeed * dt;
      if (Math.random() < 0.8) g.effects.smoke(tmpA.set(this.pos.x + (Math.random() - 0.5) * 4, this.pos.y + 5, this.pos.z + (Math.random() - 0.5) * 4), 2, 1.2, 0.3);
      if (this.pos.y <= CITY.G) {
        this.pos.y = CITY.G;
        this.state = 'walk';
        this.attackCd = 2.5;
        g.effects.shockwave(this.pos, 14);
        g.effects.explosion(tmpA.set(this.pos.x, this.pos.y + 1, this.pos.z), 2);
        g.audio.play('stomp');
        g.audio.play('explosion', this.pos);
        g.rig.shake = 1.2;
        g.hud.flash(0.4);
        this.crush(this.pos, 3);
        const t0 = toward(this, g.player.pos);
        if (t0.d < 12) {
          g.hurtPlayer(12, this.pos, 'stomp');
          g.player.vel.addScaledVector(t0.dir, 18).setY(10);
        }
        g.hud.toast('THE IRON TYRANT HAS LANDED!', 'alert', 3);
      }
      return;
    }

    const frac = this.health / this.maxHealth;
    if (frac < 0.66 && this.phase === 1) this.setPhase(2);
    if (frac < 0.33 && this.phase === 2) this.setPhase(3);

    // shield visuals: blue energy -> frosting over -> solid cracked ice
    this.shieldDown = Math.max(0, this.shieldDown - dt);
    const shieldUp = this.shieldUp;
    this.shieldMesh.visible = shieldUp;
    this.shieldMesh.position.set(this.pos.x, this.pos.y + 5.5, this.pos.z);
    this.crackMesh.position.copy(this.shieldMesh.position);
    this.crackMesh.visible = false;
    if (shieldUp) {
      const mat = this.shieldMesh.material;
      if (this.shieldFrozen > 0) {
        this.shieldFrozen -= dt;
        if (this.shieldFrozen <= 0) {
          this.shieldIce = 0;
          g.hud.toast('The shield thawed. Freeze it again!', 'warn');
        }
        // solid, pale ice that cracks up as the shield bar drains
        mat.map = this.iceTile;
        mat.color.setRGB(1, 1, 1);
        mat.opacity = 0.92;
        this.crackMesh.visible = true;
        this.crackMesh.material.opacity = 0.25 + (1 - this.shieldHP / this.shieldMax) * 0.75;
        // flash a warning as it starts to thaw
        if (this.shieldFrozen < 3 && Math.sin(this.age * 14) > 0) mat.color.setRGB(0.6, 0.85, 1);
      } else {
        this.shieldIce = Math.max(0, this.shieldIce - dt * 0.05);
        const ice = this.shieldIce;
        // energy shield: see-through blue, frosting over while you breathe on it
        mat.map = null;
        mat.color.setRGB(0.25 + ice * 0.75, 0.75 + ice * 0.25, 1);
        mat.opacity = 0.22 + ice * 0.5 + Math.sin(this.age * 6) * 0.03;
        if (ice > 0) g.markers.setPin('tyrant-ice', this.shieldMesh.position.clone().setY(this.pos.y + 14), 'Freezing ' + Math.round(ice * 100) + '%', 'sense');
      }
      if (mat.map !== this.lastMap) {
        mat.needsUpdate = true;
        this.lastMap = mat.map;
      }
    }

    // he's solid: push the hero out of his body
    const hb = g.player.pos;
    const dxh = hb.x - this.pos.x, dzh = hb.z - this.pos.z;
    const dh = Math.hypot(dxh, dzh);
    const R = 3.1;
    if (dh < R && hb.y < this.pos.y + 10.5 && hb.y + 1.9 > this.pos.y) {
      const nx = dh > 0.01 ? dxh / dh : 1, nz = dh > 0.01 ? dzh / dh : 0;
      if (hb.y > this.pos.y + 9.5) {
        hb.y = this.pos.y + 10.5; // standing on his head
        g.player.vel.y = Math.max(0, g.player.vel.y);
      } else {
        hb.x = this.pos.x + nx * R;
        hb.z = this.pos.z + nz * R;
        const vin = g.player.vel.x * nx + g.player.vel.z * nz;
        if (vin < 0) {
          g.player.vel.x -= vin * nx;
          g.player.vel.z -= vin * nz;
        }
      }
    }
    this.core.color = this.phase === 3 ? (Math.sin(this.age * 10) > 0 ? 0xff6040 : 0xffd040) : 0x40e0ff;
    this.core.w = this.core.h = this.phase === 3 ? 1.9 : 1.4;

    const t = toward(this, p.pos);
    const want = Math.atan2(t.dir.x, t.dir.z);
    let dy = want - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * (1 - Math.exp(-1.5 * dt));

    this.stateTime += dt;
    this.attackCd -= dt;
    this.missileCd -= dt;
    const speedMul = this.phase === 3 ? 1.4 : 1;

    if (this.state === 'walk') {
      // stride towards the hero, staying inside the arena
      let moving = false;
      if (t.d > 8) {
        const nx = this.pos.x + t.dir.x * 2.2 * speedMul * dt;
        const nz = this.pos.z + t.dir.z * 2.2 * speedMul * dt;
        if (Math.hypot(nx - this.arena.x, nz - this.arena.z) < this.arena.r) {
          this.pos.x = nx;
          this.pos.z = nz;
          moving = true;
        }
      }
      if (moving) {
        const prev = Math.sin(this.walkPhase);
        this.walkPhase += dt * 2.2 * speedMul;
        const s = Math.sin(this.walkPhase);
        this.legs[0].z = this.legs[2].z = this.legs[4].z = s * 0.9;
        this.legs[1].z = this.legs[3].z = this.legs[5].z = -s * 0.9;
        this.legs[2].z += 0.3;
        this.legs[3].z += 0.3;
        if (Math.sign(prev) !== Math.sign(s)) {
          // footfall
          const foot = this.footPos(s > 0 ? 1 : 0, tmpB);
          g.effects.dust(foot, 10, 1.2);
          g.audio.play('stomp', foot);
          g.rig.shake = Math.max(g.rig.shake, Math.max(0, 0.35 - t.d / 120));
          this.crush(foot, 1);
        }
      }
      if (this.attackCd <= 0) this.chooseAttack(t);
    } else if (this.state === 'stomp') {
      // raise a leg, then slam
      this.legs[0].y = 2.0 + Math.min(1, this.stateTime / 0.8) * 1.6;
      this.legs[2].y = 0.35 + Math.min(1, this.stateTime / 0.8) * 1.6;
      if (this.stateTime > 0.9) {
        this.legs[0].y = 2.0;
        this.legs[2].y = 0.35;
        const foot = this.footPos(0, tmpB);
        g.effects.shockwave(foot, 10);
        g.effects.explosion(foot, 0.6);
        g.audio.play('stomp');
        g.rig.shake = Math.max(g.rig.shake, 0.9);
        this.crush(foot, 2);
        const r = 11;
        const ht = toward(this, p.pos);
        if (ht.d < r && p.pos.y < this.pos.y + 4) {
          g.hurtPlayer(18, this.pos, 'stomp');
          p.vel.addScaledVector(ht.dir, 20).setY(12);
          p.onGround = false;
        }
        for (const e of g.entities.query(foot, r, (x) => x !== this && x.team !== 'enemy' && !x.carried)) {
          e.damage(15, { type: 'explosion', knock: toward(this, e.pos).dir.clone().multiplyScalar(14).setY(8) });
        }
        this.state = 'walk';
        this.attackCd = 2.2 / speedMul;
      }
    } else if (this.state === 'cannon') {
      // plasma burst from both arms
      if (this.stateTime > 0.25 * (this.shots + 1)) {
        this.shots++;
        const side = this.shots % 2 ? 1 : -1;
        const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
        const muzzle = tmpA.set(this.pos.x + c * 3.2 * side + s * 2.4, this.pos.y + 4.6, this.pos.z - s * 3.2 * side + c * 2.4);
        g.projectiles.fire('plasma', muzzle, heroChest(g), this, 0.05);
        g.audio.play('zap', muzzle);
        if (this.shots >= (this.phase === 3 ? 8 : 5)) {
          this.state = 'walk';
          this.attackCd = 2.5 / speedMul;
        }
      }
    } else if (this.state === 'sweep') {
      // a beam from the visor sweeps across where the hero is
      const head = tmpA.set(this.pos.x, this.pos.y + 9.75, this.pos.z);
      const dur = 3;
      const k = this.stateTime / dur;
      const ang = this.sweepBase + (k - 0.5) * 2.2;
      const chest = heroChest(g, tmpB);
      const pitch = Math.atan2(chest.y - head.y, Math.max(1, t.d));
      const dir = new THREE.Vector3(Math.sin(ang) * Math.cos(pitch), Math.sin(pitch), Math.cos(ang) * Math.cos(pitch));
      const hit = g.world.raycast(head.x, head.y, head.z, dir.x, dir.y, dir.z, 80);
      const len = hit ? hit.t : 80;
      this.beam.visible = true;
      this.beam.position.copy(head);
      this.beam.lookAt(head.clone().add(dir));
      this.beam.scale.set(0.35 + Math.random() * 0.1, 0.35, len);
      // hurt the hero if the beam crosses him
      const toHero = chest.clone().sub(head);
      const along = toHero.dot(dir);
      if (along > 0 && along < len) {
        const off = toHero.clone().sub(dir.clone().multiplyScalar(along)).length();
        if (off < 1.2) g.hurtPlayer(30 * dt, head, 'beam');
      }
      if (hit && Math.random() < 0.5) g.effects.sparks(head.clone().addScaledVector(dir, len), 2, null, 0xff6030);
      if (k >= 1) {
        this.beam.visible = false;
        this.state = 'walk';
        this.attackCd = 2;
        g.audio.stopLoop('laser');
      }
    }

    // missile volley from the shoulder pods
    if (this.missileCd <= 0 && t.d < 70) {
      this.missileCd = this.phase === 3 ? 6 : 8;
      for (let i = 0; i < (this.phase === 1 ? 4 : 6); i++) {
        const pod = tmpA.set(this.pos.x + (i % 2 ? 1.6 : -1.6), this.pos.y + 10.2, this.pos.z);
        const up = pod.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 10, (Math.random() - 0.5) * 6));
        g.projectiles.fire('missile', pod, up, this, 0.2);
      }
      g.audio.play('throw', this.pos);
    }
    g.addDanger(this.pos, 30, 1);
  }

  chooseAttack(t) {
    const g = this.game;
    const p = g.player;
    this.stateTime = 0;
    if (t.d < 11 && p.pos.y < this.pos.y + 5) {
      this.state = 'stomp';
      g.audio.play('alert', this.pos);
    } else if (this.phase === 3 && Math.random() < 0.45) {
      this.state = 'sweep';
      this.sweepBase = Math.atan2(t.dir.x, t.dir.z);
      g.audio.startLoop('laser');
    } else {
      this.state = 'cannon';
      this.shots = 0;
    }
  }
}
