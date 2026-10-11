// Free Roam: the open city with crowds, traffic and random events. Tracks lifetime stats.
import { EventDirector } from './EventDirector.js';
import { load, save } from '../save/Save.js';
import { spawnPoint } from '../world/CityGenerator.js';

export class FreeRoam {
  constructor(game) {
    this.game = game;
    this.population = true;
    this.stats = load('freeroam', { saved: 0, defeated: 0, events: 0 });
    this.session = { saved: 0, defeated: 0, events: 0 };
    this.director = new EventDirector(game, this.stats);
    this.offs = [];
  }

  start() {
    const g = this.game;
    const s = spawnPoint();
    g.placeHero(s.x, s.y, s.z, s.yaw);
    this.offs.push(
      g.events.on('defeated', (e) => {
        if (e.team === 'enemy' && e.kind !== 'dummy') this.bump('defeated');
      }),
      g.events.on('civilianSaved', () => this.bump('saved')),
      g.events.on('eventDone', () => {
        this.session.events++;
        this.persist();
      }),
    );
    g.hud.toast('Free Roam: keep Brightport safe!', 'good', 4);
  }

  bump(key) {
    this.stats[key]++;
    this.session[key]++;
    this.persist();
  }

  persist() {
    save('freeroam', this.stats);
  }

  end() {
    this.director.clear();
    for (const off of this.offs) off();
    this.offs = [];
    this.persist();
  }

  update(dt) {
    const g = this.game;
    this.director.update(dt);
    g.hud.setStats(`SAVED <b>${this.stats.saved}</b> &nbsp; VILLAINS <b>${this.stats.defeated}</b> &nbsp; EVENTS <b>${this.stats.events}</b>`);
    const items = this.director.items();
    g.hud.setObjectives(items.length ? { title: 'Emergencies', timer: null, items } : null);
  }

  markers() {
    return this.director.markers();
  }

  /** Light beam over the nearest emergency. */
  beaconPos() {
    const p = this.game.player.pos;
    let best = null, bd = Infinity;
    for (const ev of this.director.events) {
      const d = ev.pos.distanceTo(p);
      if (d < bd) {
        bd = d;
        best = ev.pos;
      }
    }
    return best ? best.clone() : null;
  }

  onPlayerDefeated() {
    const g = this.game;
    g.knockout('You were knocked out! Aegis recovers at the plaza...', () => {
      const s = spawnPoint();
      g.placeHero(s.x, s.y, s.z, s.yaw);
      g.meters.reset();
    });
  }

  pauseInfo() {
    const s = this.stats;
    return `<p class="small">People saved: <b>${s.saved}</b> &middot; Villains defeated: <b>${s.defeated}</b> &middot; Events handled: <b>${s.events}</b></p>`;
  }
}
