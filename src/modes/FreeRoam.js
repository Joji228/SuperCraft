// Free Roam: the open city with crowds, traffic and random events. Tracks lifetime stats.
import { EventDirector } from './EventDirector.js';
import { load, save } from '../save/Save.js';
import * as THREE from 'three';
import { spawnPoint, lotOrigin, CITY } from '../world/CityGenerator.js';
import { IronTyrant } from '../enemies/IronTyrant.js';

export class FreeRoam {
  constructor(game) {
    this.game = game;
    this.population = true;
    this.stats = load('freeroam', { saved: 0, defeated: 0, events: 0 });
    this.session = { saved: 0, defeated: 0, events: 0 };
    this.director = new EventDirector(game, this.stats);
    this.offs = [];
    this.tyrant = null;
  }

  /** Glowing red circle on the plaza: stand in it and press T to summon the Iron Tyrant. */
  makeSummonCircle() {
    const g = this.game;
    const [x0, z0] = lotOrigin(5, 3);
    this.arena = { x: x0 + 16, z: z0 + 16, r: 20 };
    this.circlePos = new THREE.Vector3(x0 + 16, CITY.G + 0.05, z0 + 25);
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    group.add(new THREE.Mesh(new THREE.RingGeometry(2.6, 3, 40).rotateX(-Math.PI / 2), mat));
    group.add(new THREE.Mesh(new THREE.RingGeometry(1.2, 1.5, 6).rotateX(-Math.PI / 2), mat));
    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 3, 32, 1, true).translate(0, 1.5, 0),
      new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    group.add(glow);
    group.position.copy(this.circlePos);
    g.scene.add(group);
    this.circle = group;
    this.circleGlow = glow;
    // the boss fight becomes available after a minute and a half of patrolling
    this.circle.visible = false;
    this.circleReady = false;
    this.roamTime = 0;
  }

  summonTyrant() {
    const g = this.game;
    const a = this.arena;
    this.director.timer = 9999; // no random events during the boss fight
    this.director.clear();
    const t = new IronTyrant(g, a.x, CITY.G + 90, a.z - 13, a);
    t.state = 'drop';
    t.tags.add('frtyrant');
    t.persistent = true;
    g.entities.add(t);
    this.tyrant = t;
    this.circle.visible = false;
    g.hud.toast('Something huge is falling from the sky...', 'alert', 3);
    g.audio.play('alert');
  }

  /** Tidy up after the fight (won or abandoned): remove him and his minions, re-arm the circle. */
  endTyrant() {
    const g = this.game;
    if (this.tyrant && !this.tyrant.removed) this.tyrant.remove();
    for (const e of g.entities.list) if (e.tags.has('tyrant') && !e.removed && e.alive) e.remove();
    this.tyrant = null;
    this.circle.visible = true;
    this.director.timer = 20;
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
    this.makeSummonCircle();
    this.offs.push(
      g.events.on('tyrantDown', (t) => {
        if (t !== this.tyrant) return;
        g.hud.toast('You defeated the Iron Tyrant! Brightport cheers!', 'good', 5);
        g.effects.confetti(g.player.pos, 60);
        g.audio.melody([[0, 1], [4, 1], [7, 1], [12, 3]], { bpm: 420 });
        setTimeout(() => this.tyrant === t && this.endTyrant(), 4000);
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
    if (this.circle) this.game.scene.remove(this.circle);
    for (const off of this.offs) off();
    this.offs = [];
    this.persist();
  }

  update(dt) {
    const g = this.game;
    this.director.update(dt);
    // the Iron Tyrant summoning circle
    const p = g.player.pos;
    this.roamTime += dt;
    if (!this.circleReady) {
      if (this.roamTime >= 90) {
        this.circleReady = true;
        this.circle.visible = true;
        g.hud.toast('BOSS FIGHT AVAILABLE! Go to the red circle at the plaza and press T to face the Iron Tyrant', 'alert', 7);
        g.audio.play('alert');
      }
    } else if (!this.tyrant) {
      this.circleGlow.material.opacity = 0.14 + Math.sin(performance.now() / 300) * 0.08;
      const inside = Math.hypot(p.x - this.circlePos.x, p.z - this.circlePos.z) < 3.2 && Math.abs(p.y - this.circlePos.y) < 4;
      g.hud.setPrompt(inside ? 'Press <b>T</b> to summon the <b>Iron Tyrant</b>' : null);
      if (inside && g.input.pressed('summon')) {
        g.hud.setPrompt(null);
        this.summonTyrant();
      }
    } else if (this.tyrant.removed || (this.tyrant.alive && this.tyrant.pos.distanceTo(p) > 450)) {
      if (this.tyrant.alive) g.hud.toast('The Iron Tyrant stomps off...', 'info', 3);
      this.endTyrant();
    }
    g.hud.setStats(`SAVED <b>${this.stats.saved}</b> &nbsp; VILLAINS <b>${this.stats.defeated}</b> &nbsp; EVENTS <b>${this.stats.events}</b>`);
    const items = this.director.items();
    g.hud.setObjectives(items.length ? { title: 'Emergencies', timer: null, items } : null);
  }

  markers() {
    const out = this.director.markers();
    if (this.circleReady && !this.tyrant && this.circlePos) out.push({ x: this.circlePos.x, z: this.circlePos.z, color: '#ff3a2a', shape: 'ring', size: 5, edge: false });
    return out;
  }

  /** Light beam over the nearest emergency (or the Tyrant during that fight). */
  beaconPos() {
    if (this.tyrant && this.tyrant.alive && this.tyrant.state !== 'drop') return this.tyrant.pos.clone();
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
