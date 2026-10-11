// Routes input to the five powers and computes the shared aim ray each frame.
import * as THREE from 'three';
import { Punch } from './Punch.js';
import { Laser } from './Laser.js';
import { Breath } from './Breath.js';
import { Senses } from './Senses.js';
import { Carry } from './Carry.js';
import { LockOn } from './LockOn.js';

const AIM_RANGE = 160;

export class Abilities {
  constructor(game) {
    this.game = game;
    this.punch = new Punch(game);
    this.laser = new Laser(game);
    this.breath = new Breath(game);
    this.senses = new Senses(game);
    this.carry = new Carry(game);
    this.lockOn = new LockOn(game);
    this.aim = { origin: new THREE.Vector3(), dir: new THREE.Vector3(), point: new THREE.Vector3(), entity: null, block: null, dist: AIM_RANGE };
  }

  /** Camera ray against blocks and entities (ignoring what the hero carries). */
  computeAim() {
    const g = this.game;
    const a = this.aim;
    g.camera.getWorldPosition(a.origin);
    g.rig.forward(a.dir);
    // start the ray at the hero so things between camera and hero are ignored
    const p = g.player;
    const skip = Math.max(0, a.dir.dot(new THREE.Vector3(p.pos.x - a.origin.x, p.pos.y + 1.2 - a.origin.y, p.pos.z - a.origin.z)));
    const o = a.origin.clone().addScaledVector(a.dir, skip);
    const block = g.world.raycast(o.x, o.y, o.z, a.dir.x, a.dir.y, a.dir.z, AIM_RANGE);
    const max = block ? block.t : AIM_RANGE;
    const held = this.carry.held;
    const ent = g.entities.raycast(o, a.dir, max, (e) => e !== held && !e.carried && e.alive && e.aimable !== false);
    if (ent) {
      a.entity = ent.entity;
      a.block = null;
      a.dist = skip + ent.t;
    } else {
      a.entity = null;
      a.block = block;
      a.dist = skip + max;
    }
    a.point.copy(a.origin).addScaledVector(a.dir, a.dist);
    return a;
  }

  update(dt, input, enabled = true) {
    const aim = this.computeAim();
    this.punch.update(dt);
    if (!enabled) {
      this.laser.update(dt, false, aim);
      this.breath.update(dt, false, aim);
      this.senses.update(dt);
      this.carry.update(dt);
      return;
    }
    const g = this.game;
    // in the tutorial, powers unlock one at a time
    const ok = (name) => {
      if (g.allowed(name)) return true;
      if (input.pressed(name)) g.hud.toast('You will learn that power later in training', 'info', 1.5);
      return false;
    };
    if (ok('punch') && input.pressed('punch')) {
      if (this.carry.held) this.carry.throw(aim);
      else this.punch.trigger(aim);
    }
    if (ok('carry') && input.pressed('carry')) this.carry.toggle(aim);
    if (ok('senses') && input.pressed('senses')) this.senses.toggle();
    if (input.pressed('lock')) this.lockOn.toggle();
    this.lockOn.update(dt);
    const busy = !!this.carry.held;
    this.laser.update(dt, ok('laser') && input.isDown('laser') && !busy, aim);
    this.breath.update(dt, ok('breath') && input.isDown('breath') && !this.laser.active, aim);
    this.senses.update(dt);
    this.carry.update(dt);
  }

  reset() {
    this.lockOn.release();
    this.laser.hide();
    this.breath.stop();
    this.senses.set(false);
    if (this.carry.held) {
      this.carry.held.carried = false;
      this.carry.release();
    }
  }
}
