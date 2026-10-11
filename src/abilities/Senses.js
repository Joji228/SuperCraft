// E (toggle): super senses. Tints the screen, shows enemies, people in danger and objectives
// through walls, and puts direction markers on the HUD for distant trouble. Drains energy.
const ENERGY_PER_SEC = 4.5;

export class Senses {
  constructor(game) {
    this.game = game;
    this.active = false;
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
    if (on) g.audio.startLoop('senses');
    else g.audio.stopLoop('senses');
  }

  update(dt) {
    const g = this.game;
    if (this.active && !g.meters.drain(ENERGY_PER_SEC * dt)) this.set(false);
    g.entities.updateSenses(this.active);
  }
}
