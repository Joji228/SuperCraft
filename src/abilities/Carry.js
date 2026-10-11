// G: pick up / carry / drop people, props and even cars. Left mouse throws what you hold.
import * as THREE from 'three';

const REACH = 3.4;

export class Carry {
  constructor(game) {
    this.game = game;
    this.held = null;
    this.fwd = new THREE.Vector3();
    this.probe = new THREE.Vector3();
  }

  toggle(aim) {
    if (this.held) this.drop();
    else this.pickup(aim);
  }

  pickup(aim) {
    const g = this.game;
    const p = g.player;
    // prefer what's in front of the hero
    this.probe.set(p.pos.x, p.pos.y + 1, p.pos.z).addScaledVector(aim.dir, 1.4);
    const e = g.entities.nearest(this.probe, REACH, (x) => x.carryable && !x.carried && !x.removed && (x.alive || x.carryWhenDown));
    if (!e) {
      g.hud.toast('Nothing to pick up here', 'info', 1.2);
      return;
    }
    this.held = e;
    e.carried = true;
    e.thrown = false;
    e.vel.set(0, 0, 0);
    e.onPickedUp?.();
    g.audio.play('pickup');
    g.hud.setCarry(e.carryLabel || 'Object');
    g.events.emit('pickedUp', e);
  }

  /** Where the held thing sits relative to the hero. */
  holdPoint(out) {
    const p = this.game.player;
    const e = this.held;
    this.fwd.set(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    if (e.carryHeavy) return out.set(p.pos.x, p.pos.y + p.height + 0.15, p.pos.z);
    return out.set(p.pos.x + this.fwd.x * 0.75, p.pos.y + 0.55, p.pos.z + this.fwd.z * 0.75);
  }

  update() {
    const e = this.held;
    if (!e) return;
    if (e.removed || !e.carried) {
      this.release();
      return;
    }
    this.holdPoint(e.pos);
    e.yaw = this.game.player.yaw + (e.carryHeavy ? Math.PI / 2 : 0);
    e.vel.set(0, 0, 0);
  }

  release() {
    this.held = null;
    this.game.hud.setCarry(null);
  }

  drop() {
    const e = this.held;
    if (!e) return;
    const g = this.game;
    const p = g.player;
    this.fwd.set(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    e.pos.set(p.pos.x + this.fwd.x * 1.3, p.pos.y + 0.2, p.pos.z + this.fwd.z * 1.3);
    e.carried = false;
    e.unstick();
    e.vel.copy(p.vel).multiplyScalar(0.3);
    this.release();
    g.audio.play('drop');
    e.onDropped?.();
    g.events.emit('dropped', e);
  }

  throw(aim) {
    const e = this.held;
    if (!e) return;
    if (!e.throwable) {
      this.drop();
      return;
    }
    const g = this.game;
    e.carried = false;
    e.thrown = true;
    e.unstick();
    e.vel.copy(aim.dir).multiplyScalar(e.carryHeavy ? 26 : 32).add(g.player.vel);
    e.vel.y += 4;
    e.thrownBy = g.player;
    this.release();
    g.player.aimTimer = 0.4;
    g.hero.punch(3);
    g.audio.play('throw');
    e.onThrown?.();
  }
}
