// Enemy projectiles: bullets, energy bolts, shotgun pellets, grenades and missiles.
import * as THREE from 'three';
import { B, SOLID } from '../world/Blocks.js';

const MAX = 300;

const TYPES = {
  bullet: { speed: 70, dmg: 3, size: [0.08, 0.08, 0.7], color: 0xffe08a, life: 2 },
  pellet: { speed: 55, dmg: 2.5, size: [0.08, 0.08, 0.5], color: 0xffc060, life: 1 },
  bolt: { speed: 34, dmg: 5, size: [0.2, 0.2, 0.9], color: 0xff3048, life: 3 },
  plasma: { speed: 26, dmg: 8, size: [0.45, 0.45, 0.45], color: 0x60f0ff, life: 4 },
  grenade: { speed: 18, dmg: 14, size: [0.3, 0.3, 0.3], color: 0x3a5a2a, life: 1.8, gravity: 22, explode: 4 },
  missile: { speed: 26, dmg: 14, size: [0.25, 0.25, 0.9], color: 0xdddddd, life: 6, homing: 1.6, explode: 4 },
};

export class Projectiles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    game.scene.add(this.mesh);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.s = new THREE.Vector3();
    this.c = new THREE.Color();
    this.fwd = new THREE.Vector3(0, 0, 1);
    this.tmp = new THREE.Vector3();
  }

  /** Fire from `from` towards `to` (Vector3s). spread in radians. */
  fire(type, from, to, owner, spread = 0) {
    if (this.list.length >= MAX) return;
    const t = TYPES[type];
    const dir = to.clone().sub(from).normalize();
    if (spread) {
      dir.x += (Math.random() - 0.5) * spread * 2;
      dir.y += (Math.random() - 0.5) * spread * 2;
      dir.z += (Math.random() - 0.5) * spread * 2;
      dir.normalize();
    }
    const vel = dir.multiplyScalar(t.speed);
    if (type === 'grenade') vel.y += 8;
    this.list.push({ type, t, pos: from.clone(), vel, owner, age: 0, dmg: t.dmg * (owner?.dmgMul || 1) });
  }

  clear() {
    this.list.length = 0;
    this.mesh.count = 0;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const pr = this.list[i];
      const t = pr.t;
      pr.age += dt;
      let hit = pr.age > t.life;
      if (t.gravity) pr.vel.y -= t.gravity * dt;
      if (t.homing && !hit) {
        // steer gently towards the hero
        this.tmp.set(p.pos.x, p.pos.y + 1, p.pos.z).sub(pr.pos).normalize().multiplyScalar(t.speed);
        pr.vel.lerp(this.tmp, Math.min(1, t.homing * dt));
        pr.vel.setLength(t.speed);
        if (Math.random() < 0.7) g.effects.smoke(pr.pos, 1, 0.25, 0.6);
      }
      const step = pr.vel.length() * dt;
      const sub = Math.max(1, Math.ceil(step / 0.8));
      for (let k = 0; k < sub && !hit; k++) {
        pr.pos.addScaledVector(pr.vel, dt / sub);
        // hero
        if (Math.abs(pr.pos.x - p.pos.x) < 0.6 && Math.abs(pr.pos.z - p.pos.z) < 0.6 && pr.pos.y > p.pos.y - 0.1 && pr.pos.y < p.pos.y + 2.0) {
          hit = true;
          if (!t.explode) g.hurtPlayer(pr.dmg, pr.pos.clone().sub(pr.vel), pr.type);
          break;
        }
        // civilians/props/cars in the way (not the shooter's team)
        const e = g.entities.nearest(pr.pos, 0.9, (x) => x !== pr.owner && x.alive && !x.carried && x.team !== 'enemy');
        if (e) {
          hit = true;
          if (!t.explode) e.damage(pr.dmg * (e.team === 'civ' ? 2 : 1), { type: 'bullet' });
          break;
        }
        const b = g.world.get(Math.floor(pr.pos.x), Math.floor(pr.pos.y), Math.floor(pr.pos.z));
        if (SOLID[b] || b === B.WATER) {
          hit = true;
          if (!t.explode) g.effects.sparks(pr.pos, 4, null, t.color);
        }
      }
      if (hit) {
        if (t.explode) g.explode(pr.pos, t.explode, pr.dmg, pr.owner, true);
        this.list.splice(i, 1);
        continue;
      }
      if (n < MAX) {
        this.q.setFromUnitVectors(this.fwd, this.tmp.copy(pr.vel).normalize());
        this.m.compose(pr.pos, this.q, this.s.set(t.size[0], t.size[1], t.size[2]));
        this.mesh.setMatrixAt(n, this.m);
        this.mesh.setColorAt(n, this.c.set(t.color));
        n++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}
