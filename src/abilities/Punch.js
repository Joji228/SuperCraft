// Left mouse: three-hit punch combo with knockback. Smashes small blocks and props, dents cars.
import * as THREE from 'three';
import { B, PUNCH_BREAKABLE, SOLID, LASER_PROOF } from '../world/Blocks.js';
import { CITY } from '../world/CityGenerator.js';

const COMBO = [
  { dmg: 18, knock: 7, lift: 2, cooldown: 0.22, shake: 0.25 },
  { dmg: 24, knock: 9, lift: 3, cooldown: 0.22, shake: 0.3 },
  { dmg: 45, knock: 24, lift: 8, cooldown: 0.5, shake: 0.6 },
];

const BLOCK_DEBRIS = {
  [B.LEAVES]: 0x3e9234,
  [B.LOG]: 0x6b4c30,
  [B.PLANKS]: 0xb68c58,
  [B.LAMP]: 0xfff0b0,
  [B.HAZARD]: 0xf6c420,
  [B.ICE]: 0xbfe8ff,
};

export class Punch {
  constructor(game) {
    this.game = game;
    this.combo = 0;
    this.cooldown = 0;
    this.window = 0;
    this.origin = new THREE.Vector3();
    this.center = new THREE.Vector3();
    this.knock = new THREE.Vector3();
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.window = Math.max(0, this.window - dt);
    if (this.window === 0) this.combo = 0;
  }

  trigger(aim) {
    if (this.cooldown > 0) return;
    const g = this.game;
    const p = g.player;
    this.combo = this.combo >= 3 ? 1 : this.combo + 1;
    const step = COMBO[this.combo - 1];
    // a bigger hero hits harder and a little slower, from higher up and further out
    const kit = g.heroKit;
    const power = kit?.punchPower ?? 1;
    // (Tether keeps the first hits light so the target stays in reach for the combo)
    const knockMul = kit?.punchKnockSeq?.[this.combo - 1] ?? kit?.punchKnock ?? 1;
    const big = !!kit && !kit.lunge; // Granite: a big, heavy hitter
    this.cooldown = kit?.lunge ? [0.2, 0.32, 0.45][this.combo - 1] : step.cooldown * (big ? 1.35 : 1);
    this.window = 0.75;
    p.aimTimer = 0.45;
    g.hero.punch(this.combo);
    g.audio.play('whoosh');
    // an agile hero dashes in to an enemy a few metres away, then strikes
    if (kit?.lunge) {
      const target = g.entities.raycast(new THREE.Vector3(p.pos.x, p.pos.y + 1.2, p.pos.z), aim.dir, 7, (e) => e.punchable && !e.carried && e.team === 'enemy' && e.alive)?.entity ||
        g.entities.nearest(p.pos, 6, (e) => e.team === 'enemy' && e.alive && e.punchable && !e.carried && (e.pos.x - p.pos.x) * aim.dir.x + (e.pos.z - p.pos.z) * aim.dir.z > 0);
      if (target && Math.hypot(target.pos.x - p.pos.x, target.pos.z - p.pos.z) > 1.8) {
        const combo = this.combo;
        kit.dashTo(target, () => {
          const to = new THREE.Vector3(target.pos.x - p.pos.x, target.pos.y + target.height * 0.5 - (p.pos.y + 1.35), target.pos.z - p.pos.z).normalize();
          this.strike({ dir: to }, COMBO[combo - 1], power, knockMul, false, combo);
        });
        return;
      }
    }
    this.strike(aim, step, power, knockMul, big, this.combo);
  }

  /** Land the hit: enemies in reach take damage and knock-back; otherwise the block in front. */
  strike(aim, step, power, knockMul, big, combo) {
    const g = this.game;
    const p = g.player;
    this.combo = combo;
    const dir = aim.dir;
    this.origin.set(p.pos.x, p.pos.y + (big ? 1.8 : 1.35), p.pos.z);
    this.center.copy(this.origin).addScaledVector(dir, big ? 1.9 : 1.5);
    // entities in the fist's reach, plus whatever the crosshair touches just beyond
    const hits = g.entities.query(this.center, big ? 2.3 : 1.7, (e) => e.punchable && !e.carried && e.team !== 'civ' && !e.removed);
    const far = g.entities.raycast(this.origin, dir, big ? 4 : 3.2, (e) => e.punchable && !e.carried && e.team !== 'civ');
    if (far && !hits.includes(far.entity)) hits.push(far.entity);
    // big shields: a punch lands if the fist reaches the bubble's surface
    for (const e of g.entities.list) {
      const sp = !e.removed && e.sphere?.();
      if (sp && !hits.includes(e) && this.center.distanceTo(sp.c) < sp.r + 1.8) hits.push(e);
    }

    if (hits.length) {
      for (const e of hits) {
        this.knock.copy(dir).setY(0).normalize().multiplyScalar(step.knock * knockMul);
        this.knock.y = step.lift * knockMul;
        if (e.mass > 3) this.knock.multiplyScalar(Math.min(1, 6 / e.mass) + 0.4 * knockMul);
        if (big && e.kind === 'car') e.driving = false;
        const wasAlive = e.alive;
        const dealt = e.damage(step.dmg * power, { type: 'punch', knock: this.knock, source: p });
        const at = e.centerInto(new THREE.Vector3());
        g.effects.impact(at, dir, this.combo === 3 ? 1.6 : 1);
        if (dealt > 0) g.markers.damageNumber(at, dealt, this.combo === 3 ? '#ffd34d' : '#ffffff');
        if (wasAlive && !e.alive) g.hud.hitMarker(true);
        else g.hud.hitMarker(false);
      }
      g.audio.play(this.combo === 3 ? 'punchHeavy' : 'punchHit');
      g.hitStop((this.combo === 3 ? 0.09 : 0.045) * (big ? 1.4 : 1));
      g.rig.shake = Math.max(g.rig.shake, step.shake * (big ? 1.4 : 1));
      return;
    }

    // nothing alive in reach: try the block in front of the fist
    const hit = g.world.raycast(this.origin.x, this.origin.y, this.origin.z, dir.x, dir.y, dir.z, big ? 3.6 : 2.8);
    if (hit) {
      const pos = new THREE.Vector3(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      if (big && hit.y >= CITY.G && !LASER_PROOF.has(hit.block)) {
        this.smashWall(hit, dir);
      } else if (PUNCH_BREAKABLE.has(hit.block)) {
        this.smash(hit, pos);
      } else {
        g.effects.impact(pos.addScaledVector(dir, -0.5), dir, 0.6);
        g.audio.play('thud');
        g.rig.shake = Math.max(g.rig.shake, 0.15);
      }
    }
  }

  /** A big hero's punch knocks a chunk out of any wall (bigger on the third hit). */
  smashWall(hit, dir) {
    const g = this.game;
    const w = g.world;
    const r = this.combo === 3 ? 2 : 1;
    let glass = false;
    for (let y = -r; y <= r; y++) {
      for (let a = -r; a <= r; a++) {
        for (let d = 0; d <= 1; d++) {
          // ragged edges: corners and the far layer only sometimes give way
          if ((Math.abs(a) === r && Math.abs(y) === r) || (d === 1 && Math.random() < 0.5)) continue;
          // spread sideways across the wall, and a little into it
          const sx = Math.abs(dir.z) > Math.abs(dir.x) ? a : 0;
          const sz = Math.abs(dir.z) > Math.abs(dir.x) ? 0 : a;
          const x = hit.x + sx + Math.round(dir.x) * d, z = hit.z + sz + Math.round(dir.z) * d, yy = hit.y + y;
          const b = w.get(x, yy, z);
          if (!SOLID[b] || LASER_PROOF.has(b) || yy < CITY.G) continue;
          if ((b >= B.GLASS_BLUE && b <= B.GLASS_DARK) || b === B.DOOR) glass = true;
          w.edit(x, yy, z, B.AIR);
        }
      }
    }
    const pos = new THREE.Vector3(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    g.effects.debris(pos, 0xa8a49c, 22, 8);
    g.effects.dust(pos, 10, 1.2);
    g.audio.play('crunch');
    if (glass) g.audio.play('glass');
    g.hitStop(0.05);
    g.rig.shake = Math.max(g.rig.shake, this.combo === 3 ? 0.6 : 0.35);
  }

  smash(hit, pos) {
    const g = this.game;
    const isGlass = hit.block >= B.GLASS_BLUE && hit.block <= B.GLASS_DARK || hit.block === B.DOOR;
    g.world.edit(hit.x, hit.y, hit.z, hit.block === B.FLOWERS ? B.GRASS : B.AIR);
    if (isGlass) {
      g.effects.debris(pos, 0xbfe3ff, 18, 6);
      g.audio.play('glass');
    } else {
      g.effects.debris(pos, BLOCK_DEBRIS[hit.block] ?? 0xcccccc, 14, 6);
      g.audio.play('crunch');
    }
    g.rig.shake = Math.max(g.rig.shake, 0.2);
  }
}
