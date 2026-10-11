// E (toggle): super senses. Tints the screen, shows enemies, people in danger and objectives
// through walls, puts on-screen markers on them (with a light beam over special targets
// like the lost cat) and widens the radar. Drains energy slowly.
import * as THREE from 'three';

const ENERGY_PER_SEC = 3;
const RANGE = 160;

export class Senses {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.special = null; // the most important sensed target (gets the beam)
  }

  toggle() {
    const g = this.game;
    if (!this.active && g.meters.energy < 5) {
      g.hud.toast('Not enough energy', 'warn');
      return;
    }
    this.set(!this.active);
  }

  set(on) {
    if (on === this.active) return;
    this.active = on;
    const g = this.game;
    g.hud.setSenses(on);
    g.audio.play(on ? 'sensesOn' : 'sensesOff');
    if (on) {
      g.audio.startLoop('senses');
      g.hud.flash(0.25, '#40e0d0');
    } else {
      g.audio.stopLoop('senses');
      this.special = null;
    }
  }

  update(dt) {
    const g = this.game;
    if (this.active && !g.meters.drain(ENERGY_PER_SEC * dt)) this.set(false);
    g.entities.updateSenses(this.active);
  }

  /** On-screen markers for sensed things (called between the HUD's pin passes). */
  pins() {
    const g = this.game;
    this.special = null;
    if (!this.active) return;
    const p = g.player.pos;
    const enemies = [];
    let bestD = Infinity;
    for (const e of g.entities.list) {
      if (e.removed || !e.alive || e.carried) continue;
      const d = Math.hypot(e.pos.x - p.x, e.pos.y - p.y, e.pos.z - p.z);
      if (d > RANGE && !e.senseLabel) continue;
      const top = new THREE.Vector3(e.pos.x, e.pos.y + e.height + 0.8, e.pos.z);
      if (e.senseLabel) {
        // special targets (the cat, hostages...) get a labelled pin and the beam
        g.markers.setPin('sense' + e.id, top, e.senseLabel, 'sense');
        if (d < bestD) {
          bestD = d;
          this.special = e.pos;
        }
      } else if (e.team === 'enemy' && e.kind !== 'dummy') enemies.push([d, e, top]);
      else if (e.kind === 'civilian' && e.inDanger && d < 90) g.markers.setPin('sense' + e.id, top, 'Help!', 'help');
    }
    enemies.sort((a, b) => a[0] - b[0]);
    for (const [, e, top] of enemies.slice(0, 8)) g.markers.setPin('sense' + e.id, top, e.boss ? e.bossName : '', 'enemy');
  }

  beaconTarget() {
    return this.active ? this.special : null;
  }
}
