// Left mouse: three-hit punch combo with knockback. Smashes small blocks and props, dents cars.
import * as THREE from 'three';
import { B, PUNCH_BREAKABLE } from '../world/Blocks.js';

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
    this.cooldown = step.cooldown;
    this.window = 0.75;
    p.aimTimer = 0.45;
    g.hero.punch(this.combo);
    g.audio.play('whoosh');

    const dir = aim.dir;
    this.origin.set(p.pos.x, p.pos.y + 1.35, p.pos.z);
    this.center.copy(this.origin).addScaledVector(dir, 1.5);
    // entities in the fist's reach, plus whatever the crosshair touches just beyond
    const hits = g.entities.query(this.center, 1.7, (e) => e.punchable && !e.carried && e.team !== 'civ' && !e.removed);
    const far = g.entities.raycast(this.origin, dir, 3.2, (e) => e.punchable && !e.carried && e.team !== 'civ');
    if (far && !hits.includes(far.entity)) hits.push(far.entity);
    // big shields: a punch lands if the fist reaches the bubble's surface
    for (const e of g.entities.list) {
      const sp = !e.removed && e.sphere?.();
      if (sp && !hits.includes(e) && this.center.distanceTo(sp.c) < sp.r + 1.8) hits.push(e);
    }

    if (hits.length) {
      for (const e of hits) {
        this.knock.copy(dir).setY(0).normalize().multiplyScalar(step.knock);
        this.knock.y = step.lift;
        if (e.mass > 3) this.knock.multiplyScalar(Math.min(1, 6 / e.mass) + 0.4);
        const wasAlive = e.alive;
        const dealt = e.damage(step.dmg, { type: 'punch', knock: this.knock, source: p });
        const at = e.centerInto(new THREE.Vector3());
        g.effects.impact(at, dir, this.combo === 3 ? 1.6 : 1);
        if (dealt > 0) g.markers.damageNumber(at, dealt, this.combo === 3 ? '#ffd34d' : '#ffffff');
        if (wasAlive && !e.alive) g.hud.hitMarker(true);
        else g.hud.hitMarker(false);
      }
      g.audio.play(this.combo === 3 ? 'punchHeavy' : 'punchHit');
      g.hitStop(this.combo === 3 ? 0.09 : 0.045);
      g.rig.shake = Math.max(g.rig.shake, step.shake);
      return;
    }

    // nothing alive in reach: try the block in front of the fist
    const hit = g.world.raycast(this.origin.x, this.origin.y, this.origin.z, dir.x, dir.y, dir.z, 2.8);
    if (hit) {
      const pos = new THREE.Vector3(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      if (PUNCH_BREAKABLE.has(hit.block)) {
        this.smash(hit, pos);
      } else {
        g.effects.impact(pos.addScaledVector(dir, -0.5), dir, 0.6);
        g.audio.play('thud');
        g.rig.shake = Math.max(g.rig.shake, 0.15);
      }
    }
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
