// Runs a campaign mission described as data (see missions.js): stages of objectives,
// fail conditions, HUD objectives, map pins, ring checkpoints and the end-of-mission rating.
import * as THREE from 'three';
import { load, save } from '../save/Save.js';

const RING_GEO = new THREE.TorusGeometry(3.4, 0.35, 8, 40);

export function loadProgress() {
  return load('progress', { unlocked: 1, stars: {}, best: {} });
}

export function saveProgress(p) {
  save('progress', p);
}

class Objective {
  constructor(run, def) {
    this.run = run;
    this.def = def;
    this.done = false;
    this.progress = 0;
    this.total = def.count || 1;
    const g = run.game;
    const t = def.type;
    if (t === 'destroy' || t === 'defeat') {
      this.total = def.count || g.entities.count((e) => e.tags.has(def.tag) && e.alive);
      this.counted = new Set();
    }
    if (t === 'extinguish') this.total = Math.max(1, g.fires.count(def.tag));
    if (t === 'rescue') {
      this.total = def.count || g.entities.count((e) => e.tags.has(def.tag) && !e.saved);
      this.zone = g.zones.add(def.at, {
        radius: def.radius || 4,
        label: def.zoneLabel || 'Safe zone',
        accepts: (e) => e.tags.has(def.tag) && (e.alive || e.kind === 'car'),
      });
    }
    if (t === 'rings') {
      this.total = def.points.length;
      this.rings = def.points.map((p, i) => {
        const m = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.9, depthWrite: false }));
        m.position.copy(p);
        const next = def.points[i + 1] || def.points[i - 1];
        if (next) m.lookAt(next);
        g.scene.add(m);
        return m;
      });
    }
    if (t === 'action' && def.action === 'land') this.wasFlying = false;
  }

  get label() {
    const d = this.def;
    const prog = this.total > 1 ? ` (${Math.min(this.progress, this.total)}/${this.total})` : '';
    if (d.type === 'protect') return `${d.label} (lost ${this.run.lost}/${d.maxLost})`;
    if (d.type === 'extinguish') {
      const left = this.run.game.fires.count(d.tag);
      return `${d.label} (${left} left)`;
    }
    return d.label + prog;
  }

  onEvent(name, e) {
    const d = this.def;
    if (this.done) return;
    if (name === 'defeated' && (d.type === 'destroy' || d.type === 'defeat') && e.tags.has(d.tag) && !this.counted.has(e)) {
      this.counted.add(e);
      this.progress++;
    }
    if (name === 'rescued' && d.type === 'rescue' && e.tags.has(d.tag)) this.progress++;
    if (name === 'pickedUp' && d.type === 'find' && e.tags.has(d.tag)) this.progress = 1;
  }

  update(dt) {
    const g = this.run.game;
    const d = this.def;
    const p = g.player;
    switch (d.type) {
      case 'reach':
        if (Math.hypot(p.pos.x - d.at.x, p.pos.z - d.at.z) < (d.radius || 3) && Math.abs(p.pos.y - d.at.y) < (d.height || 4)) this.progress = 1;
        break;
      case 'action':
        if (d.action === 'jump' && !p.flying && !p.onGround && p.vel.y > 3) this.progress = 1;
        if (d.action === 'fly' && p.flying) this.progress = 1;
        if (d.action === 'senses' && g.abilities.senses.active) this.progress = 1;
        if (d.action === 'supersonic' && p.supersonic) this.progress = 1;
        if (d.action === 'land') {
          if (p.flying) this.wasFlying = true;
          if (!p.flying && p.onGround && (!d.at || p.pos.distanceTo(d.at) < (d.radius || 30))) this.progress = 1;
        }
        break;
      case 'rings': {
        const ring = this.rings[this.progress];
        if (ring && p.pos.clone().setY(p.pos.y + 1).distanceTo(ring.position) < 4.2) {
          ring.visible = false;
          this.progress++;
          g.audio.play('ring');
          g.effects.confetti(ring.position.clone().setY(ring.position.y - 1.5), 12);
        }
        this.rings.forEach((r, i) => {
          r.material.opacity = i === this.progress ? 0.95 : 0.3;
          r.scale.setScalar(i === this.progress ? 1 + Math.sin(performance.now() / 150) * 0.05 : 0.8);
        });
        break;
      }
      case 'extinguish':
        this.progress = this.total - g.fires.count(d.tag);
        if (g.fires.count(d.tag) === 0) this.progress = this.total;
        break;
      case 'defeat':
        this.progress = g.entities.count((e) => e.tags.has(d.tag) && e.alive) === 0 ? 1 : 0;
        this.total = 1;
        break;
      case 'protect':
        this.progress = 1;
        break;
      case 'custom': {
        const r = d.check(this.run.ctx, dt);
        this.progress = r.progress ?? (r.done ? 1 : 0);
        this.total = r.total ?? 1;
        break;
      }
    }
    if (!this.done && this.progress >= this.total && d.type !== 'protect') {
      this.done = true;
      if (!d.silent) g.audio.play('objective');
    }
    if (d.type === 'protect') this.done = true;
  }

  /** Where to put the HUD pin for this objective (or null). */
  pin() {
    const g = this.run.game;
    const d = this.def;
    if (this.done || d.noPin) return null;
    if (d.type === 'reach' || (d.type === 'action' && d.at)) return d.at.clone().setY(d.at.y + 1.5);
    if (d.type === 'find') return null; // super senses put their own marker and beam on it
    if (d.type === 'rings') return this.rings[this.progress]?.position.clone() || null;
    if (d.type === 'extinguish') {
      const n = g.fires.nearest(g.player.pos);
      const f = g.fires.list.filter((x) => x.tag === d.tag).sort((a, b) => a.pos.distanceTo(g.player.pos) - b.pos.distanceTo(g.player.pos))[0];
      return f ? f.pos.clone().setY(f.pos.y + 1.5) : n ? null : null;
    }
    if (d.type === 'destroy' || d.type === 'defeat' || d.type === 'rescue') {
      const e = g.entities.nearest(g.player.pos, 2000, (x) => x.tags.has(d.tag) && (d.type === 'rescue' ? !x.saved && !x.carried && (x.alive || x.kind === 'car') : x.alive));
      return e ? e.pos.clone().setY(e.pos.y + e.height + 1) : null;
    }
    return null;
  }

  cleanup() {
    const g = this.run.game;
    if (this.zone) g.zones.remove(this.zone);
    if (this.rings) for (const r of this.rings) g.scene.remove(r);
  }
}

export class MissionRun {
  constructor(game, def, index) {
    this.game = game;
    this.def = def;
    this.index = index;
    this.population = def.population ?? true;
    this.time = 0;
    this.lost = 0;
    this.stage = -1;
    this.objectives = [];
    this.offs = [];
    this.finished = false;
  }

  start() {
    const g = this.game;
    const def = this.def;
    this.ctx = { g, run: this, a: def.anchors(g), data: {} };
    if (def.timeOfDay != null) g.setTimeOfDay(def.timeOfDay);
    if (def.lockPowers) g.lockPowers(def.lockPowers);
    const s = this.ctx.a.start;
    g.placeHero(s.x, s.y, s.z, s.yaw ?? 0);
    const ev = (name) => (e) => this.objectives.forEach((o) => o.onEvent(name, e));
    this.offs.push(
      g.events.on('defeated', ev('defeated')),
      g.events.on('rescued', ev('rescued')),
      g.events.on('pickedUp', ev('pickedUp')),
      g.events.on('civilianLost', (e) => {
        if (e.tags.has('mission') || e.tags.has(def.protectTag || 'mission') || [...e.tags].some((t) => def.protectTags?.includes(t))) this.lose(e);
      }),
    );
    g.hud.toast(def.name, 'good', 3);
    this.nextStage();
  }

  lose(what, msg) {
    this.lost++;
    if (msg) this.game.hud.toast(msg, 'warn');
  }

  nextStage() {
    for (const o of this.objectives) o.cleanup();
    this.stage++;
    const st = this.def.stages[this.stage];
    if (!st) {
      this.complete();
      return;
    }
    if (st.unlock) this.game.unlockPowers(st.unlock);
    st.start?.(this.ctx);
    this.objectives = st.objectives.map((d) => new Objective(this, typeof d === 'function' ? d(this.ctx) : d));
    this.stageTime = 0;
    if (st.toast) this.game.hud.toast(st.toast, 'info', 4);
  }

  update(dt) {
    if (this.finished) return;
    const g = this.game;
    this.time += dt;
    this.stageTime += dt;
    const st = this.def.stages[this.stage];
    st?.update?.(this.ctx, dt);
    for (const o of this.objectives) o.update(dt);

    // pins
    this.objectives.forEach((o, i) => {
      const p = o.pin();
      if (p) g.markers.setPin('obj' + i, p, o.def.pinLabel || '', o.def.type === 'defeat' ? 'boss' : 'objective');
    });

    // HUD
    const limit = this.def.timeLimit;
    g.hud.setObjectives({
      title: this.def.name,
      timer: limit ? limit - this.time : null,
      items: this.objectives.filter((o) => !o.def.hidden).map((o) => ({ text: o.label, done: o.done && o.def.type !== 'protect' })),
    });

    // failure
    const protect = this.objectives.find((o) => o.def.type === 'protect');
    const maxLost = protect ? protect.def.maxLost : this.def.maxLost;
    if (maxLost != null && this.lost > maxLost) return this.fail('Too many people were hurt.');
    if (limit && this.time > limit) return this.fail('You ran out of time.');
    const reason = st?.fail?.(this.ctx);
    if (reason) return this.fail(reason);

    if (this.objectives.every((o) => o.done)) this.nextStage();
  }

  rating() {
    const r = this.def.rating;
    const g = this.game;
    const dmg = Math.round(g.meters.damageTaken);
    const criteria = [
      { label: `Time under ${fmt(r.par)}`, ok: this.time <= r.par, value: fmt(this.time) },
      { label: r.lostMax != null ? `No more than ${r.lostMax} people hurt` : 'Civilians safe', ok: this.lost <= (r.lostMax ?? 0), value: `${this.lost} hurt` },
      { label: `Damage taken under ${r.damage}`, ok: dmg <= r.damage, value: `${dmg} taken` },
    ];
    const stars = Math.max(1, criteria.filter((c) => c.ok).length);
    return { stars, criteria, time: this.time };
  }

  complete() {
    if (this.finished) return;
    this.finished = true;
    const res = this.rating();
    const prog = loadProgress();
    const id = this.def.id;
    prog.stars[id] = Math.max(prog.stars[id] || 0, res.stars);
    prog.best[id] = Math.min(prog.best[id] || Infinity, Math.round(res.time));
    prog.unlocked = Math.max(prog.unlocked, this.index + 2);
    saveProgress(prog);
    this.game.missionComplete(this, res);
  }

  fail(reason) {
    if (this.finished) return;
    this.finished = true;
    this.game.missionFailed(this, reason);
  }

  end() {
    for (const o of this.objectives) o.cleanup();
    for (const off of this.offs) off();
    this.offs = [];
    this.def.cleanup?.(this.ctx);
  }

  /** Where the gold light beam goes: the first objective with a target. */
  beaconPos() {
    for (const o of this.objectives) {
      if (o.def.type === 'find' || o.def.type === 'rings') continue;
      const p = o.pin();
      if (p) return p.setY(p.y - 2);
    }
    return null;
  }

  markers() {
    const out = [];
    for (const o of this.objectives) {
      const p = o.pin();
      if (p) out.push({ x: p.x, z: p.z, color: o.def.type === 'defeat' ? '#ff4d4d' : '#ffd34d', shape: 'diamond', size: 5, edge: true });
    }
    for (const z of this.game.zones.list) out.push({ x: z.pos.x, z: z.pos.z, color: '#3dff8a', shape: 'ring', size: 5, edge: true });
    return out;
  }

  onPlayerDefeated() {
    this.fail('Aegis was knocked out.');
  }

  pauseInfo() {
    return `<p class="small">${this.def.name} &middot; ${fmt(this.time)}</p>`;
  }
}

export function fmt(t) {
  t = Math.max(0, Math.round(t));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
