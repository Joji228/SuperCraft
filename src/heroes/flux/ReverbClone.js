// Reverb's clones: little copies of him that run at the nearest enemy and blast it
// with short sonic bursts. They're on your side, can't be hurt, and fade after a while.
import * as THREE from 'three';
import { Entity } from '../../entities/Entity.js';

const tmp = new THREE.Vector3();

export class ReverbClone extends Entity {
  constructor(game, x, y, z, life = 16) {
    super(game, { halfW: 0.28, height: 1.2, health: 9999, team: 'ally', kind: 'clone' });
    this.pos.set(x, y, z);
    this.life = life;
    this.cd = Math.random() * 0.5;
    this.punchable = false;
    this.pushable = false;
    this.aimable = false;
    this.phase = Math.random() * 6;
    const W = 0xf4f8ff, K = 0x1d2a3a;
    this.boxes = [
      { y: 0.25, x: 0.1, w: 0.12, h: 0.46, d: 0.14, color: K }, // legs
      { y: 0.25, x: -0.1, w: 0.12, h: 0.46, d: 0.14, color: K },
      { y: 0.72, w: 0.44, h: 0.48, d: 0.28, color: K },
      { y: 0.74, z: 0.15, w: 0.24, h: 0.24, d: 0.03, color: W },
      { y: 0.92, x: 0.28, w: 0.15, h: 0.15, d: 0.15, color: W },
      { y: 0.92, x: -0.28, w: 0.15, h: 0.15, d: 0.15, color: W },
      { y: 1.1, w: 0.38, h: 0.32, d: 0.34, color: W },
      { y: 1.15, z: 0.18, x: 0.08, w: 0.05, h: 0.05, d: 0.02, color: 0x4dc3ff, glow: true },
      { y: 1.15, z: 0.18, x: -0.08, w: 0.05, h: 0.05, d: 0.02, color: 0x4dc3ff, glow: true },
      { y: 0.74, z: 0.17, w: 0.09, h: 0.09, d: 0.02, color: 0x8fe36a, glow: true },
    ];
    this.legs = this.boxes.slice(0, 2);
  }

  get canFreeze() {
    return false;
  }

  damage() {
    return 0;
  }

  update(dt) {
    const g = this.game;
    this.age += dt;
    this.life -= dt;
    this.cd -= dt;
    if (this.life <= 0) {
      for (let i = 0; i < 12; i++) g.particles.emit({ x: this.pos.x, y: this.pos.y + 0.7, z: this.pos.z, vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 4, life: 0.5, size: 0.2, grow: 2, alpha: 0.8, r: 0.9, g: 0.97, b: 1, drag: 2 });
      this.remove();
      return;
    }
    // go for the nearest enemy near Reverb; otherwise trot along beside him
    const p = g.player;
    const target = g.entities.nearest(p.pos, 30, (e) => e.team === 'enemy' && e.alive && !e.removed);
    let gx, gz, want;
    if (target) {
      gx = target.pos.x;
      gz = target.pos.z;
      want = 2.2;
    } else {
      const a = this.phase + this.id;
      gx = p.pos.x + Math.cos(a) * 2;
      gz = p.pos.z + Math.sin(a) * 2;
      want = 0.6;
    }
    tmp.set(gx - this.pos.x, 0, gz - this.pos.z);
    const d = tmp.length();
    const k = 1 - Math.exp(-8 * dt);
    if (d > want) {
      tmp.divideScalar(d);
      const sp = Math.min(9, d * 2);
      this.vel.x += (tmp.x * sp - this.vel.x) * k;
      this.vel.z += (tmp.z * sp - this.vel.z) * k;
      this.yaw = Math.atan2(tmp.x, tmp.z);
    } else {
      this.vel.x *= 1 - k;
      this.vel.z *= 1 - k;
    }
    if (this.hitWall && this.onGround) this.vel.y = 8;
    if (d > 40) this.pos.set(p.pos.x, p.pos.y + 0.5, p.pos.z); // left behind: catch up
    // little legs
    this.phase += dt * 12;
    const sw = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 4) * 0.12;
    this.legs[0].z = Math.sin(this.phase) * sw;
    this.legs[1].z = -Math.sin(this.phase) * sw;
    // sonic burst at close range
    if (target && d < 3.2 && this.cd <= 0) {
      this.cd = 0.55;
      this.yaw = Math.atan2(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
      const dir = tmp.set(target.pos.x - this.pos.x, 0, target.pos.z - this.pos.z).normalize();
      const dealt = target.damage(7, { type: 'impact', knock: dir.clone().multiplyScalar(4).setY(2), source: p });
      if (dealt > 0) g.markers.damageNumber(target.centerInto(new THREE.Vector3()), dealt, '#cfe9ff');
      g.rings?.spawn({ pos: new THREE.Vector3(this.pos.x, this.pos.y + 0.9, this.pos.z).addScaledVector(dir, 0.4), normal: dir, r0: 0.1, r1: 1.2, life: 0.2, opacity: 0.7, color: 0xcfe9ff });
      if (Math.random() < 0.4) g.audio.play('zap', this.pos);
    }
    this.physics(dt);
  }
}
