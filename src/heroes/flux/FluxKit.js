// Flux: Kai and the Prism band.
//   As Kai (human): walk, run (Shift), jump, swim, throw (weak) punches.
//   Hold Q: the alien wheel opens (time slows down); move the mouse towards an alien
//     and let go of G to transform. Choose the middle to turn back into Kai.
//   PRISM bar: drains while he's an alien (faster while fighting). Under 20% the band
//     beeps and flashes red; when it runs out he times out back to Kai and the band
//     goes into recharge mode until it's charged enough again. As Kai it recharges.
// The aliens (see FluxForms.js) use the energy and SPEED bars for their powers.
import * as THREE from 'three';
import { B, SOLID, LASER_PROOF, FLAMMABLE } from '../../world/Blocks.js';
import { CITY } from '../../world/CityGenerator.js';
import { FORMS, ALIENS, formPortrait } from './FluxForms.js';
import { FluxModel } from './FluxModels.js';

const PRISM = {
  drain: 0.4, // per second as an alien (a full bar lasts about 4 minutes)
  fightDrain: 0.15, // extra per second while using powers (about 3 minutes of nonstop fighting)
  recharge: 12, // per second as Kai (empty to full in about 8 seconds)
  minToTransform: 15,
  rechargeUntil: 40, // after a time-out the band is locked until it gets back here
  warnAt: 20,
};

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

export class FluxKit {
  constructor(game) {
    this.game = game;
    this.id = 'flux';
    this.form = 'human';
    this.prism = 100;
    this.recharging = false;
    this.fightT = 9;
    this.special = 9;
    this.specialCd = 0;
    this.shotT = 9;
    this.shotCd = 0;
    this.held = false; // holding a stream (flamethrower)
    this.swimming = false;
    this.wheelOpen = false;
    this.wheelVec = { x: 0, y: 0 };
    this.choice = null;
    this.warnBeep = 0;
    this.bolts = [];
    this.spikes = [];
    this.ramHits = new Map();
    // models: Kai is the game's 'flux' model, the aliens live here
    this.models = { human: game.models.flux };
    for (const a of ALIENS) {
      const m = new FluxModel(a);
      m.setVisible(false);
      game.scene.add(m.root);
      this.models[a] = m;
    }
    this.boltGeo = new THREE.BoxGeometry(1, 1, 1);
    this.boltMats = {
      fire: new THREE.MeshBasicMaterial({ color: 0xffa040 }),
      shard: new THREE.MeshLambertMaterial({ color: 0x5ff2b4, emissive: 0x135c42 }),
      zap: new THREE.MeshBasicMaterial({ color: 0x9dffb0 }),
    };
    this.pool = [];
    this.spikeGeo = new THREE.ConeGeometry(0.45, 2, 5).translate(0, 1, 0);
    this.spikeMat = new THREE.MeshLambertMaterial({ color: 0x5ff2b4, emissive: 0x135c42 });
    this.buildUi();
  }

  // ---------- form ----------

  get f() {
    return FORMS[this.form];
  }

  get canCarry() {
    return true;
  }

  /** Brawl barges cars aside, and so does Blitz at full tilt; the others bump off them. */
  get shovesCars() {
    const p = this.game.player;
    return this.form === 'brawl' || (this.form === 'blitz' && Math.hypot(p.vel.x, p.vel.z) > 25);
  }

  /** Only Brawl is strong enough to lift cars; everyone else can carry people and small things. */
  canLift(e) {
    return this.form === 'brawl' || !e.carryHeavy;
  }

  get disallow() {
    const d = new Set(this.f.disallow);
    // the forms that throw things instead of punching
    if (['fireball', 'shards', 'zap'].includes(this.f.lmb)) d.add('punch');
    return d;
  }

  get punchPower() {
    return this.f.punchPower;
  }

  get punchKnock() {
    return this.f.punchKnock;
  }

  get heavyHitter() {
    return this.form === 'brawl'; // four fists knock holes in walls
  }

  // Blitz zips in to strike, Brawl pounces: both reach drones hovering overhead
  get lunge() {
    return this.form === 'blitz' || this.form === 'brawl';
  }

  get lungeReach() {
    return this.form === 'blitz' ? 12 : 10;
  }

  get punchCooldowns() {
    return this.form === 'blitz' ? [0.08, 0.1, 0.16] : undefined;
  }

  get damageMul() {
    return this.f.damageMul;
  }

  get fireproof() {
    return !!this.f.fireproof;
  }

  get upgradesCars() {
    return this.form === 'glitch';
  }

  /** Called by the game when Flux is chosen (and after each mode starts). */
  onSelect() {
    this.prism = 100;
    this.recharging = false;
    this.setForm('human', true);
    this.prismEl.classList.remove('hidden');
  }

  reset() {
    this.climb = null;
    if (this.ladderPinned) this.pinLadder(false);
    this.closeWheel(false);
    for (const b of this.bolts) b.mesh.visible = false;
    this.bolts.length = 0;
    for (const s of this.spikes) if (s.mesh) this.game.scene.remove(s.mesh); // queued spikes have no mesh yet
    this.spikes.length = 0;
    for (const m of Object.values(this.models)) m.setVisible(false);
    this.prismEl?.classList.add('hidden');
    this.game.player.modeLabel = null;
  }

  /** Switch body, model, movement and HUD to a form. */
  setForm(id, quiet = false) {
    const g = this.game;
    const p = g.player;
    const was = this.form;
    this.form = id;
    const f = FORMS[id];
    // swap the model in place
    const old = g.hero;
    const next = this.models[id];
    if (old !== next) {
      next.setVisible(old.root.visible);
      old.setVisible(false);
      g.hero = next;
    }
    const grow = f.body.height - p.height;
    p.halfW = f.body.halfW;
    p.height = f.body.height;
    if (grow > 0) p.unstick();
    p.stats = { ...f.stats };
    p.flight = { ...p.flight, ...(f.flight || {}) };
    if (p.flying && g.heroKit === this && this.disallow.has('fly')) p.setFlying(false);
    p.noTrail = id !== 'blitz';
    p.wades = true;
    p.waterSolid = false;
    p.stepHeight = id === 'brawl' ? 2.01 : 1.01;
    g.rig.eye = f.eye;
    g.rig.distScale = f.camScale;
    if (id === 'blitz') g.flightFX.setPalette(0x4dc3ff, 0x1d2a4a, 0x8fe36a);
    g.hud.setHeroLayout('flux-' + id);
    this.special = 9;
    this.held = false;
    if (quiet) return;
    // the flash of the change
    g.hud.flash(0.55, id === 'human' && this.recharging ? '#ff4a3a' : '#5dff7a');
    g.audio.melody(id === 'human' ? [[7, 1], [3, 1], [0, 2]] : [[0, 1], [7, 1], [12, 2]], { bpm: 600, type: 'square', gain: 0.08 });
    g.audio.play('sensesOn');
    g.meters.invulnerable = Math.max(g.meters.invulnerable, 0.6);
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 6;
      g.particles.emit({ x: p.pos.x, y: p.pos.y + 1 + Math.random(), z: p.pos.z, vx: Math.cos(a) * s, vy: (Math.random() - 0.3) * 6, vz: Math.sin(a) * s, life: 0.6, size: 0.25, grow: 1.5, alpha: 0.9, r: 0.45, g: 1, b: 0.5, drag: 3 });
    }
    g.rings?.spawn({ pos: tmp.set(p.pos.x, p.pos.y + 0.1, p.pos.z).clone(), r0: 0.5, r1: 5, life: 0.4, opacity: 0.7, color: 0x5dff7a, thick: true });
    if (id !== 'human' && was === 'human') g.hud.toast(`${f.name}!`, 'good', 1.2);
  }

  // ---------- the alien wheel ----------

  buildUi() {
    const hud = document.getElementById('hud');
    // PRISM meter, under the other meters
    this.prismEl = document.createElement('div');
    this.prismEl.className = 'prism hidden';
    this.prismEl.innerHTML = '<span class="prism-label">PRISM</span><div class="prism-bar"><div class="prism-fill"></div></div><span class="prism-form"></span>';
    hud.appendChild(this.prismEl);
    this.prismFill = this.prismEl.querySelector('.prism-fill');
    this.prismForm = this.prismEl.querySelector('.prism-form');
    // the wheel: a dimmed screen, five glowing segments around a hub, and a cone of
    // light that sweeps round to whichever alien the mouse points at
    const N = ALIENS.length, R1 = 68, R2 = 214, GAP = 2.2;
    const xy = (deg, r) => [Math.cos((deg * Math.PI) / 180) * r, Math.sin((deg * Math.PI) / 180) * r].map((v) => v.toFixed(1));
    const pt = (deg, r) => xy(deg, r).join(' ');
    const segs = ALIENS.map((id, i) => {
      const mid = -90 + (i / N) * 360, a0 = mid - 180 / N + GAP, a1 = mid + 180 / N - GAP;
      return `<path class="wheel-seg" data-id="${id}" style="--c:${FORMS[id].color}" d="M ${pt(a0, R1)} L ${pt(a0, R2)} A ${R2} ${R2} 0 0 1 ${pt(a1, R2)} L ${pt(a1, R1)} A ${R1} ${R1} 0 0 0 ${pt(a0, R1)} Z"/>`;
    }).join('');
    const ticks = Array.from({ length: 60 }, (_, i) => {
      const [x1, y1] = xy(i * 6, 226), [x2, y2] = xy(i * 6, i % 5 ? 232 : 239);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    }).join('');
    const items = ALIENS.map((id, i) => {
      const [x, y] = xy(-90 + (i / N) * 360, 141);
      return `<div class="wheel-item" data-id="${id}" style="--x:${x}px; --y:${y}px; --c:${FORMS[id].color}; --d:${i * 35}ms"><img src="${formPortrait(id)}" alt=""><span>${FORMS[id].name}</span></div>`;
    }).join('');
    this.wheelEl = document.createElement('div');
    this.wheelEl.className = 'alien-wheel hidden';
    this.wheelEl.innerHTML = `<div class="wheel-backdrop"></div>
      <div class="wheel-body">
        <svg class="wheel-ticks" viewBox="-240 -240 480 480">${ticks}</svg>
        <div class="wheel-cone"></div>
        <svg class="wheel-svg" viewBox="-240 -240 480 480">
          ${segs}
          <circle class="wheel-hub-ring" r="${R1 - 6}"/>
          <circle class="wheel-prism" r="${R1 - 6}" pathLength="100"/>
        </svg>
        <div class="wheel-needle"></div>
        ${items}
        <div class="wheel-item wheel-center" data-id="human" style="--x:0px; --y:0px; --c:#8fe36a; --d:0ms"><img src="${formPortrait('human')}" alt=""><span>Kai</span></div>
      </div>
      <div class="wheel-info"></div>`;
    hud.appendChild(this.wheelEl);
    this.wheelInfo = this.wheelEl.querySelector('.wheel-info');
    this.wheelItems = [...this.wheelEl.querySelectorAll('.wheel-item')];
    this.wheelSegs = [...this.wheelEl.querySelectorAll('.wheel-seg')];
    this.wheelCone = this.wheelEl.querySelector('.wheel-cone');
    this.wheelNeedle = this.wheelEl.querySelector('.wheel-needle');
    this.wheelPrism = this.wheelEl.querySelector('.wheel-prism');
    this.coneAngle = 0;
    this.coneOn = 0;
    this.needleAngle = 0;
  }

  openWheel() {
    this.wheelOpen = true;
    this.wheelVec.x = this.wheelVec.y = 0;
    this.choice = null;
    this.coneOn = 0;
    this.wheelT = performance.now();
    this.wheelEl.classList.remove('hidden', 'open');
    void this.wheelEl.offsetWidth; // replay the opening animation
    this.wheelEl.classList.add('open');
    document.getElementById('hud').classList.add('wheel-open');
    this.wheelMouse(0, 0);
    this.game.audio.play('click');
  }

  closeWheel(apply) {
    if (!this.wheelOpen) return;
    this.wheelOpen = false;
    this.wheelEl.classList.add('hidden');
    document.getElementById('hud').classList.remove('wheel-open');
    if (!apply || !this.choice || this.choice === this.form) return;
    const g = this.game;
    if (this.choice === 'human') {
      this.setForm('human');
      return;
    }
    if (this.recharging) {
      g.hud.toast('The Prism band is recharging', 'warn', 1.2);
      g.audio.play('overheat');
      return;
    }
    if (this.prism < PRISM.minToTransform) {
      g.hud.toast('Not enough PRISM charge', 'warn', 1.2);
      return;
    }
    if (g.driving.active) g.driving.exit();
    this.setForm(this.choice);
  }

  /** Mouse movement while the wheel is open picks an alien. */
  wheelMouse(dx, dy) {
    if (!this.wheelOpen) return;
    const v = this.wheelVec;
    v.x += dx;
    v.y += dy;
    const len = Math.hypot(v.x, v.y);
    if (len > 140) {
      v.x *= 140 / len;
      v.y *= 140 / len;
    }
    let choice = 'human';
    if (Math.hypot(v.x, v.y) > 40) {
      const a = Math.atan2(v.y, v.x);
      let best = 0, bd = Infinity;
      ALIENS.forEach((id, i) => {
        const ai = -Math.PI / 2 + (i / ALIENS.length) * Math.PI * 2;
        let d = Math.abs(Math.atan2(Math.sin(a - ai), Math.cos(a - ai)));
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      choice = ALIENS[best];
    }
    if (choice !== this.choice) {
      this.choice = choice;
      for (const el of this.wheelItems) el.classList.toggle('sel', el.dataset.id === choice);
      for (const el of this.wheelSegs) el.classList.toggle('sel', el.dataset.id === choice);
      this.wheelEl.classList.toggle('kai', choice === 'human');
      const f = FORMS[choice];
      this.wheelEl.style.setProperty('--c', f.color);
      this.wheelInfo.innerHTML = `<b style="color:${f.color}">${f.name}</b><span>${f.title}</span><small>${f.abilities.join(' · ')}</small>`;
      this.wheelInfo.classList.remove('pop');
      void this.wheelInfo.offsetWidth;
      this.wheelInfo.classList.add('pop');
      this.game.audio.play('click');
    }
  }

  // ---------- per frame ----------

  /** Blitz's strikes: zip up to an enemy a few metres away, then hit. */
  dashTo(target, strike) {
    this.dash = { target, strike, t: 0 };
  }

  /** While Kai swims, mark the nearest wall ladder so he knows where to get out. */
  pinLadder(on) {
    const g = this.game;
    const l = on && g.ladders?.list.reduce((b, x) => (!b || Math.hypot(x.x - g.player.pos.x, x.z - g.player.pos.z) < Math.hypot(b.x - g.player.pos.x, b.z - g.player.pos.z) ? x : b), null);
    if (l) {
      g.markers.setPin('ladder', (this.ladderPos ||= new THREE.Vector3()).set(l.lx, CITY.G + 1.5, l.lz), 'Ladder', 'zone');
      this.ladderPinned = true;
    } else if (this.ladderPinned) {
      g.markers.removePin('ladder');
      this.ladderPinned = false;
    }
  }

  /** Hand over hand up a wall ladder, then step off onto the ground. */
  updateClimb(dt) {
    const p = this.game.player;
    const l = this.climb;
    const k = Math.min(1, dt * 10);
    p.pos.x += (l.x - l.nx * 0.4 - p.pos.x) * k;
    p.pos.z += (l.z - l.nz * 0.4 - p.pos.z) * k;
    p.pos.y += 3.6 * dt;
    p.vel.set(0, 0, 0);
    p.yaw = Math.atan2(l.nx, l.nz);
    if (p.pos.y >= CITY.G - 0.7) {
      p.pos.set(l.lx + l.nx * 0.7, CITY.G, l.lz + l.nz * 0.7);
      p.onGround = true;
      this.climb = null;
      this.swimming = false;
    }
    return true;
  }

  updateDash(dt) {
    const p = this.game.player;
    const d = this.dash;
    d.t += dt;
    // straight at the target, up into the air too if it's hovering overhead
    const chest = this.form === 'brawl' ? 1.6 : 1.1;
    const to = tmp.set(d.target.pos.x - p.pos.x, d.target.pos.y + (d.target.height || 1) * 0.5 - (p.pos.y + chest), d.target.pos.z - p.pos.z);
    const dist = to.length();
    const speed = this.form === 'brawl' ? 30 : 42;
    if (dist < 1.6 || d.t > dist / speed + 0.1 || d.t > 0.45 || d.target.removed) {
      this.dash = null;
      p.vel.x *= 0.2;
      p.vel.z *= 0.2;
      p.vel.y = Math.min(p.vel.y, 2);
      d.strike();
      return true;
    }
    to.divideScalar(dist);
    p.vel.x = to.x * speed;
    p.vel.z = to.z * speed;
    p.vel.y = Math.abs(to.y) > 0.15 ? to.y * speed : Math.max(p.vel.y - 32 * dt, -20);
    p.move(dt);
    p.yaw = Math.atan2(to.x, to.z);
    return true;
  }

  /** Movement the kit takes over: Blitz's dash-in, and swimming as Kai. */
  drives(dt, input, canAct) {
    const g = this.game;
    const p = g.player;
    const w = g.world;
    if (this.dash) return this.updateDash(dt);
    if (this.climb) return this.updateClimb(dt);
    // in the water next to one of the wall ladders: W or Space climbs out
    const feet = w.get(Math.floor(p.pos.x), Math.floor(p.pos.y + 0.2), Math.floor(p.pos.z));
    if (canAct && !p.flying && feet === B.WATER && (input.isDown('forward') || input.pressed('jump'))) {
      const lad = g.ladders?.near(p.pos);
      if (lad) {
        this.climb = lad;
        g.audio.play('click');
        return this.updateClimb(dt);
      }
    }
    const chest = w.get(Math.floor(p.pos.x), Math.floor(p.pos.y + 1.0), Math.floor(p.pos.z));
    this.swimming = this.form === 'human' && !p.flying && chest === B.WATER;
    this.pinLadder(this.swimming);
    if (!this.swimming) return false;
    // float with the head above the surface, slow front crawl
    let top = Math.floor(p.pos.y + 1.0);
    while (w.get(Math.floor(p.pos.x), top + 1, Math.floor(p.pos.z)) === B.WATER) top++;
    const targetY = top + 1 - 1.3;
    const yaw = g.rig.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const iz = canAct ? (input.isDown('forward') ? 1 : 0) - (input.isDown('back') ? 1 : 0) : 0;
    const ix = canAct ? (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0) : 0;
    let wx = fx * iz + rx * ix, wz = fz * iz + rz * ix;
    const l = Math.hypot(wx, wz);
    if (l > 1) {
      wx /= l;
      wz /= l;
    }
    const k = 1 - Math.exp(-4 * dt);
    p.vel.x += (wx * 4.5 - p.vel.x) * k;
    p.vel.z += (wz * 4.5 - p.vel.z) * k;
    p.vel.y = Math.max(-3, Math.min(4, (targetY - p.pos.y) * 5));
    // Space at the edge: haul himself out
    if (canAct && input.pressed('jump')) p.vel.y = 9;
    p.move(dt);
    if (Math.hypot(p.vel.x, p.vel.z) > 0.5) {
      p.yaw = Math.atan2(p.vel.x, p.vel.z);
      if (Math.random() < dt * 15) g.particles.emit({ x: p.pos.x, y: top + 1, z: p.pos.z, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 2, life: 0.4, size: 0.2, grow: 1.5, alpha: 0.7, r: 0.85, g: 0.93, b: 1, gravity: 10, drag: 1 });
    }
    p.modeLabel = 'SWIMMING';
    return true;
  }

  update(dt, input, canAct) {
    const g = this.game;
    const p = g.player;
    this.shotCd = Math.max(0, this.shotCd - dt);
    this.specialCd = Math.max(0, this.specialCd - dt);
    this.shotT += dt;
    this.special += dt;
    this.fightT += dt;
    if (!this.swimming && (p.modeLabel === 'SWIMMING')) p.modeLabel = null;

    // the wheel: hold Q
    if (canAct && input.isDown('breath') && !this.wheelOpen && !g.driving.active) this.openWheel();
    if (this.wheelOpen && (!input.isDown('breath') || !canAct)) this.closeWheel(canAct);

    // knocked out: the band snaps back to Kai
    if (g.koTimer > 0 && this.form !== 'human') this.setForm('human', true);

    // PRISM charge
    if (this.form === 'human') {
      this.prism = Math.min(100, this.prism + PRISM.recharge * dt);
      if (this.recharging && this.prism >= PRISM.rechargeUntil) {
        this.recharging = false;
        g.hud.toast('Prism band ready', 'good', 1.2);
        g.audio.play('objective');
      }
    } else {
      this.prism -= (PRISM.drain + (this.fightT < 2 ? PRISM.fightDrain : 0)) * dt;
      if (this.prism < PRISM.warnAt) {
        this.warnBeep -= dt;
        if (this.warnBeep <= 0) {
          this.warnBeep = this.prism < 8 ? 0.35 : 0.8;
          g.audio.play('click');
        }
      }
      if (this.prism <= 0) {
        this.prism = 0;
        this.recharging = true;
        g.hud.toast('Timed out! The Prism band is recharging', 'warn', 2);
        this.setForm('human');
      }
    }

    if (this.form !== 'human' && canAct && !this.wheelOpen) this.powers(dt, input);
    if (this.form === 'cinder') {
      // flying on flames costs energy
      if (p.flying && !g.meters.drain(7 * dt)) p.setFlying(false);
      this.cinderFire(dt);
    }
    this.updateBolts(dt);
    this.updateSpikes(dt);
    this.updateUi();
  }

  /** Cinder is always burning: flames lick off his body and head, and he flies on a roaring jet of fire. */
  cinderFire(dt) {
    const g = this.game;
    const p = g.player;
    const P = g.particles;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const count = (rate) => Math.floor(rate * dt) + (Math.random() < (rate * dt) % 1 ? 1 : 0);
    const hs = Math.hypot(p.vel.x, p.vel.z);
    // body: tongues of flame rising off his shoulders, arms and back (trailing as he moves)
    for (let i = count(110 + hs * 3); i > 0; i--) {
      const t = Math.random();
      P.emit({
        x: p.pos.x + rnd(-0.45, 0.45), y: p.pos.y + rnd(0.6, 1.9), z: p.pos.z + rnd(-0.45, 0.45),
        vx: rnd(-0.5, 0.5) + p.vel.x * 0.8, vy: rnd(1.5, 3.5) + p.vel.y * 0.8, vz: rnd(-0.5, 0.5) + p.vel.z * 0.8,
        life: rnd(0.3, 0.55), size: rnd(0.3, 0.5), grow: 0.3, alpha: 1, r: 1, g: 0.3 + t * 0.5, b: 0.04 + t * 0.1, drag: 0.4,
      });
    }
    // head: a big crown of fire
    for (let i = count(60); i > 0; i--) {
      const t = Math.random();
      P.emit({
        x: p.pos.x + rnd(-0.22, 0.22), y: p.pos.y + rnd(2.0, 2.4), z: p.pos.z + rnd(-0.22, 0.22),
        vx: rnd(-0.4, 0.4) + p.vel.x * 0.9, vy: rnd(2.5, 5) + p.vel.y * 0.9, vz: rnd(-0.4, 0.4) + p.vel.z * 0.9,
        life: rnd(0.35, 0.6), size: rnd(0.5, 0.8), grow: 0.3, alpha: 1, r: 1, g: 0.45 + t * 0.45, b: 0.08 + t * 0.15, drag: 0.4,
      });
    }
    // embers drifting up
    for (let i = count(10); i > 0; i--) {
      P.emit({ x: p.pos.x + rnd(-0.5, 0.5), y: p.pos.y + rnd(0.5, 2), z: p.pos.z + rnd(-0.5, 0.5), vx: rnd(-1, 1), vy: rnd(2, 5), vz: rnd(-1, 1), life: rnd(0.8, 1.4), size: 0.08, grow: 0.5, alpha: 1, r: 1, g: 0.7, b: 0.3, drag: 0.5 });
    }
    if (!p.flying) return;
    // flight: a roaring exhaust out of his feet, longer and hotter the faster he goes
    const sp = p.vel.length();
    const fx = p.pos.x, fy = p.pos.y + 0.1, fz = p.pos.z;
    const back = tmp.copy(p.vel).multiplyScalar(-1 / Math.max(sp, 1));
    if (sp < 3) back.set(0, -1, 0);
    else back.y -= 0.6;
    back.normalize();
    for (let i = count(300 + sp * 6); i > 0; i--) {
      const t = Math.random();
      const s = rnd(8, 13);
      // most of his own speed carries into the jet, so it stays a tight cone of fire at his feet
      P.emit({
        x: fx + rnd(-0.25, 0.25), y: fy + rnd(-0.1, 0.2), z: fz + rnd(-0.25, 0.25),
        vx: back.x * s + p.vel.x * 0.9 + rnd(-1.2, 1.2), vy: back.y * s + p.vel.y * 0.9 + rnd(-1, 1), vz: back.z * s + p.vel.z * 0.9 + rnd(-1.2, 1.2),
        life: rnd(0.25, 0.45), size: rnd(0.45, 0.7), grow: 2.2, alpha: 1, r: 1, g: 0.25 + t * 0.55, b: 0.03 + t * 0.12, drag: 0.6,
      });
    }
    // a white-hot core right at his feet, and smoke trailing off the end
    for (let i = count(60); i > 0; i--) P.emit({ x: fx + rnd(-0.12, 0.12), y: fy, z: fz + rnd(-0.12, 0.12), vx: back.x * 6 + p.vel.x * 0.8, vy: back.y * 6 + p.vel.y * 0.8, vz: back.z * 6 + p.vel.z * 0.8, life: 0.15, size: 0.6, grow: 1.4, alpha: 1, r: 1, g: 0.95, b: 0.7, drag: 2 });
    for (let i = count(14); i > 0; i--) {
      const c = 0.25 + Math.random() * 0.15;
      P.emit({ x: fx + back.x * 3 + rnd(-0.5, 0.5), y: fy + back.y * 3, z: fz + back.z * 3 + rnd(-0.5, 0.5), vx: rnd(-0.5, 0.5), vy: rnd(0.5, 1.5), vz: rnd(-0.5, 0.5), life: rnd(1, 1.6), size: 0.6, grow: 3, alpha: 0.35, r: c, g: c, b: c, drag: 1 });
    }
  }

  // ---------- alien powers ----------

  fighting() {
    this.fightT = 0;
  }

  powers(dt, input) {
    const g = this.game;
    const p = g.player;
    const f = this.f;
    if (g.abilities.carry.held) return; // hands full: left mouse throws instead
    // left mouse for the ranged forms
    if (input.isDown('punch') && this.shotCd <= 0) {
      if (f.lmb === 'fireball') this.shoot('fire', 0.32, 1);
      else if (f.lmb === 'shards') this.shoot('shard', 0.42, 3);
      else if (f.lmb === 'zap') this.shoot('zap', 0.2, 1);
    }
    if (f.lmb === 'punch' && input.pressed('punch')) this.fighting();

    // right mouse
    if (f.rmb === 'flamethrower') {
      this.held = input.isDown('laser') && g.meters.energy > 1;
      if (this.held) this.flamethrower(dt);
    } else if (input.pressed('laser')) {
      const cost = { slam: 25, cyclone: 25, spikes: 30, emp: 35 }[f.rmb];
      if (this.specialCd > 0) {
        // still recovering
      } else if (g.meters.energy < cost) {
        g.hud.toast('Not enough energy', 'warn', 1);
      } else {
        g.meters.drain(cost);
        this.specialCd = 1.8;
        this.special = 0;
        this.specialFired = false;
        this.fighting();
        if (f.rmb === 'spikes') this.spikeLine();
        else if (f.rmb === 'emp') this.emp();
        g.audio.play('whoosh');
      }
    }
    // delayed hits for the wind-up powers
    if (!this.specialFired && f.rmb === 'slam' && this.special >= 0.25) {
      this.specialFired = true;
      this.slam();
    }
    if (f.rmb === 'cyclone' && this.special < 0.7) this.cyclone(dt);

    // Blitz rams things at full speed
    if (this.form === 'blitz' && p.sprinting) this.ram(dt);
  }

  boltMesh(kind) {
    let m = this.pool.find((x) => !x.visible && x.userData.kind === kind);
    if (!m) {
      m = new THREE.Mesh(this.boltGeo, this.boltMats[kind]);
      m.userData.kind = kind;
      this.game.scene.add(m);
      this.pool.push(m);
    }
    m.visible = true;
    return m;
  }

  shoot(kind, cooldown, count) {
    const g = this.game;
    const p = g.player;
    this.shotCd = cooldown;
    this.shotT = 0;
    this.fighting();
    p.aimTimer = 0.35;
    const aim = g.abilities.computeAim();
    g.hero.root.updateMatrixWorld(true);
    const from = g.hero.handR.getWorldPosition(new THREE.Vector3());
    const target = aim.entity ? aim.entity.centerInto(new THREE.Vector3()) : aim.point.clone();
    const speed = kind === 'fire' ? 55 : kind === 'shard' ? 80 : 120;
    for (let i = 0; i < count; i++) {
      const dir = target.clone().sub(from).normalize();
      if (count > 1) dir.add(tmp.set((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.12)).normalize();
      const m = this.boltMesh(kind);
      const size = kind === 'fire' ? [0.45, 0.45, 0.45] : kind === 'shard' ? [0.14, 0.14, 0.7] : [0.08, 0.08, 1.4];
      m.scale.set(...size);
      m.position.copy(from);
      m.lookAt(tmp.copy(from).add(dir));
      this.bolts.push({ kind, mesh: m, pos: from.clone(), dir, speed, travelled: 0, max: 120 });
    }
    g.audio.play(kind === 'fire' ? 'whoosh' : kind === 'zap' ? 'zap' : 'throw');
  }

  updateBolts(dt) {
    const g = this.game;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      const step = b.speed * dt;
      const ent = g.entities.raycast(b.pos, b.dir, step, (e) => e.alive && !e.carried);
      const blk = g.world.raycast(b.pos.x, b.pos.y, b.pos.z, b.dir.x, b.dir.y, b.dir.z, step);
      let done = false;
      if (ent && (!blk || ent.t < blk.t)) {
        const e = ent.entity;
        const at = b.pos.clone().addScaledVector(b.dir, ent.t);
        const dmg = b.kind === 'fire' ? 26 : b.kind === 'shard' ? 15 : 14;
        const dealt = e.damage(dmg, { type: b.kind === 'fire' ? 'fire' : 'punch', knock: b.dir.clone().multiplyScalar(b.kind === 'fire' ? 6 : 4).setY(2), source: g.player });
        if (b.kind === 'zap' && e.kind === 'drone') e.damage(20, { type: 'impact' });
        if (dealt > 0) g.markers.damageNumber(at, dealt, b.kind === 'fire' ? '#ffb36b' : '#bfffe6');
        g.hud.hitMarker(!e.alive);
        this.burst(b.kind, at);
        done = true;
      } else if (blk) {
        const at = b.pos.clone().addScaledVector(b.dir, blk.t);
        this.burst(b.kind, at);
        if ((blk.block >= B.GLASS_BLUE && blk.block <= B.GLASS_DARK) || blk.block === B.DOOR) g.world.edit(blk.x, blk.y, blk.z, B.AIR);
        else if (b.kind === 'fire') this.burnBlock(blk);
        done = true;
      }
      b.pos.addScaledVector(b.dir, step);
      b.travelled += step;
      b.mesh.position.copy(b.pos);
      if (b.kind === 'fire') {
        b.mesh.rotation.x += dt * 12;
        if (Math.random() < 0.9) g.effects.flame(b.pos, 0.8, 0.15);
      }
      if (done || b.travelled > b.max) {
        b.mesh.visible = false;
        this.bolts.splice(i, 1);
      }
    }
  }

  burst(kind, at) {
    const g = this.game;
    if (kind === 'fire') {
      g.effects.explosion(at, 0.35);
      g.audio.play('thud', at);
    } else if (kind === 'shard') {
      g.effects.debris(at, 0x5ff2b4, 8, 4);
      g.audio.play('glass', at);
    } else {
      g.effects.sparks(at, 8, null, 0x9dffb0);
    }
  }

  flamethrower(dt) {
    const g = this.game;
    const p = g.player;
    g.meters.drain(22 * dt);
    this.fighting();
    p.aimTimer = 0.3;
    const aim = g.abilities.computeAim();
    g.hero.root.updateMatrixWorld(true);
    const from = g.hero.handR.getWorldPosition(tmp2);
    const dir = aim.dir;
    for (let i = 0; i < 6; i++) {
      const s = 16 + Math.random() * 8;
      g.particles.emit({ x: from.x, y: from.y, z: from.z, vx: (dir.x + (Math.random() - 0.5) * 0.35) * s, vy: (dir.y + (Math.random() - 0.5) * 0.35) * s, vz: (dir.z + (Math.random() - 0.5) * 0.35) * s, life: 0.45 + Math.random() * 0.2, size: 0.3, grow: 4, alpha: 0.9, r: 1, g: 0.45 + Math.random() * 0.4, b: 0.1, drag: 2 });
    }
    if (aim.block && aim.point.distanceTo(from) < 11 && Math.random() < dt * 3) this.burnBlock(aim.block);
    for (const e of g.entities.query(from, 12)) {
      if (!e.alive || e.carried) continue;
      const to = e.centerInto(tmp).sub(from);
      const d = to.length();
      if (d > 11 || to.divideScalar(d).dot(dir) < 0.85) continue;
      const dealt = e.damage(45 * dt, { type: 'fire', source: p });
      g.markers.accumulate(e, dealt, '#ffb36b');
    }
    if (!this.fireLoop) {
      this.fireLoop = true;
      g.audio.startLoop('breath');
    }
    clearTimeout(this.fireLoopOff);
    this.fireLoopOff = setTimeout(() => {
      this.fireLoop = false;
      g.audio.stopLoop('breath');
    }, 120);
  }

  /** Brawl: all four fists into the ground. */
  slam() {
    const g = this.game;
    const p = g.player;
    const at = new THREE.Vector3(p.pos.x, p.pos.y + 0.1, p.pos.z);
    g.audio.play('stomp');
    g.rig.shake = Math.max(g.rig.shake, 0.6);
    g.hitStop(0.06);
    g.effects.dust(at, 50, 3);
    g.rings?.spawn({ pos: at, r0: 0.5, r1: 8, life: 0.4, opacity: 0.8, color: 0xffd0b0, thick: true });
    g.addDanger(p.pos, 14, 1.5);
    this.radial(7, 50, 8, 12);
    this.crater(p.pos, 2, 5);
  }

  /** Cracked, scorched street under a big impact, and windows blown out nearby. */
  crater(pos, r, glassR) {
    const w = this.game.world;
    const x0 = Math.floor(pos.x), y0 = Math.floor(pos.y - 0.5), z0 = Math.floor(pos.z);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r + 1 || ((dx || dz) && Math.random() < 0.4)) continue;
        const b = w.get(x0 + dx, y0, z0 + dz);
        if (SOLID[b] && !LASER_PROOF.has(b) && b !== B.ICE) w.edit(x0 + dx, y0, z0 + dz, B.SCORCH);
      }
    }
    for (let y = 1; y <= 4; y++) {
      for (let dz = -glassR; dz <= glassR; dz++) {
        for (let dx = -glassR; dx <= glassR; dx++) {
          if (dx * dx + dz * dz > glassR * glassR || Math.random() < 0.5) continue;
          const b = w.get(x0 + dx, y0 + y, z0 + dz);
          if ((b >= B.GLASS_BLUE && b <= B.GLASS_DARK) || b === B.DOOR) w.edit(x0 + dx, y0 + y, z0 + dz, B.AIR);
        }
      }
    }
  }

  /** Fire meeting the city: wood and plants catch light, anything else is scorched black. */
  burnBlock(hit) {
    const g = this.game;
    const b = hit.block;
    const at = new THREE.Vector3(hit.x + 0.5 + (hit.nx || 0) * 0.6, hit.y + 0.5 + (hit.ny || 0) * 0.6, hit.z + 0.5 + (hit.nz || 0) * 0.6);
    if (FLAMMABLE.has(b)) {
      if (g.fires.list.length < 40 && !g.fires.list.some((f) => f.pos.distanceTo(at) < 1.5)) g.fires.ignite(at, { intensity: 0.6, spread: true, burnout: 20 });
    } else if (SOLID[b] && !LASER_PROOF.has(b) && b !== B.ICE && b !== B.SCORCH && Math.random() < 0.5) {
      g.world.edit(hit.x, hit.y, hit.z, B.SCORCH);
    }
  }

  /** Blitz: a cyclone pulling everything around him in, then flinging it out. */
  cyclone(dt) {
    const g = this.game;
    const p = g.player;
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 5;
      g.particles.emit({ x: p.pos.x + Math.cos(a) * r, y: p.pos.y + Math.random() * 3, z: p.pos.z + Math.sin(a) * r, vx: -Math.sin(a) * 14, vy: 2, vz: Math.cos(a) * 14, life: 0.4, size: 0.25, grow: 2, alpha: 0.5, r: 0.75, g: 0.9, b: 1, drag: 1 });
    }
    for (const e of g.entities.query(p.pos, 10)) {
      if (!e.alive || e.carried || e === g.driving.car) continue;
      const to = tmp.copy(e.pos).sub(p.pos);
      const d = Math.max(1, to.length());
      // swirl around and inwards
      e.vel.x += (-to.z / d * 14 - to.x / d * 6) * dt * 4 / Math.max(1, e.mass * 0.3);
      e.vel.z += (to.x / d * 14 - to.z / d * 6) * dt * 4 / Math.max(1, e.mass * 0.3);
      e.vel.y = Math.max(e.vel.y, 3);
      e.onGround = false;
      if (e.kind === 'car') e.driving = false;
    }
    if (this.special + dt >= 0.7) {
      // fling
      this.radial(9, 30, 14, 10);
      g.audio.play('whoosh');
      g.rings?.spawn({ pos: new THREE.Vector3(p.pos.x, p.pos.y + 1, p.pos.z), r0: 1, r1: 9, life: 0.35, opacity: 0.6, color: 0xcfe9ff });
    }
  }

  /** Shard: a line of crystal spikes bursting out of the ground towards the crosshair. */
  spikeLine() {
    const g = this.game;
    const p = g.player;
    const yaw = g.rig.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    for (let i = 1; i <= 10; i++) {
      this.spikes.push({ x: p.pos.x + fx * i * 1.6, z: p.pos.z + fz * i * 1.6, t: -i * 0.045, mesh: null, hit: false });
    }
  }

  updateSpikes(dt) {
    const g = this.game;
    for (let i = this.spikes.length - 1; i >= 0; i--) {
      const s = this.spikes[i];
      s.t += dt;
      if (s.t < 0) continue;
      if (!s.mesh) {
        const y = g.world.surfaceY(Math.floor(s.x), Math.floor(s.z)) + 1;
        if (y > g.player.pos.y + 3 || y < g.player.pos.y - 4) {
          this.spikes.splice(i, 1); // ran into a wall or off a ledge
          continue;
        }
        s.mesh = new THREE.Mesh(this.spikeGeo, this.spikeMat);
        s.mesh.position.set(s.x, y - 0.2, s.z);
        s.mesh.rotation.set((Math.random() - 0.5) * 0.4, Math.random() * 3, (Math.random() - 0.5) * 0.4);
        g.scene.add(s.mesh);
        s.y = y;
        g.effects.debris(new THREE.Vector3(s.x, y, s.z), 0x5ff2b4, 6, 5);
        g.audio.play('glass', s.mesh.position);
      }
      const rise = Math.min(1, s.t / 0.12);
      s.mesh.scale.set(1, rise * (1.2 + (i % 3) * 0.2), 1);
      if (!s.hit && rise >= 1) {
        s.hit = true;
        for (const e of g.entities.query(tmp.set(s.x, s.y + 1, s.z), 2.2)) {
          if (!e.alive || e.carried) continue;
          const dealt = e.damage(e.team === 'civ' ? 12 : 30, { type: 'impact', knock: tmp2.set(0, 11 * Math.max(1, e.mass), 0), source: g.player });
          if (dealt > 0) g.markers.damageNumber(e.centerInto(new THREE.Vector3()), dealt, '#bfffe6');
        }
      }
      if (s.t > 2.2) {
        s.mesh.scale.y *= 0.8;
        if (s.t > 2.6) {
          g.scene.remove(s.mesh);
          this.spikes.splice(i, 1);
        }
      }
    }
  }

  /** Glitch: an EMP pulse. Drones drop, cars die, enemies seize up. */
  emp() {
    const g = this.game;
    const p = g.player;
    g.audio.play('zap');
    g.audio.play('shieldHit');
    g.rings?.spawn({ pos: new THREE.Vector3(p.pos.x, p.pos.y + 1, p.pos.z), r0: 0.5, r1: 15, life: 0.5, opacity: 0.8, color: 0x7dff8a, thick: true });
    for (const e of g.entities.query(p.pos, 15)) {
      if (!e.alive || e.carried) continue;
      if (e.kind === 'drone') e.damage(100, { type: 'impact', source: p });
      else if (e.kind === 'car') {
        e.driving = false;
        e.vel.multiplyScalar(0.1);
      } else if (e.team === 'enemy') {
        e.stun = Math.max(e.stun || 0, e.boss ? 0.6 : 2.5);
        e.damage(10, { type: 'impact', source: p });
      }
      g.effects.sparks(e.centerInto(new THREE.Vector3()), 6, null, 0x7dff8a);
    }
  }

  /** Damage + knock-back in a ring around him (civilians just get pushed). */
  radial(r, dmg, out, up) {
    const g = this.game;
    const p = g.player;
    for (const e of g.entities.query(tmp2.set(p.pos.x, p.pos.y + 0.5, p.pos.z), r + 1)) {
      if (e.carried || e.removed || e === g.driving.car) continue;
      const c = e.centerInto(new THREE.Vector3());
      const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z);
      if (d > r || Math.abs(c.y - p.pos.y) > 4) continue;
      const k = 1 - d / r;
      const dir = new THREE.Vector3(c.x - p.pos.x, 0, c.z - p.pos.z).normalize();
      const m = Math.max(1, e.mass);
      if (e.kind === 'car') e.driving = false;
      const dealt = e.damage(e.team === 'civ' ? 6 * k + 2 : dmg * (0.4 + 0.6 * k), { type: 'impact', knock: dir.multiplyScalar(out * k * m).setY(up * (0.4 + 0.6 * k) * m), source: p });
      if (dealt > 1 && e.team !== 'civ') g.markers.damageNumber(c, dealt, '#ffd34d');
    }
  }

  /** Blitz at full speed bowls over anything he runs into. */
  ram(dt) {
    const g = this.game;
    const p = g.player;
    const hs = Math.hypot(p.vel.x, p.vel.z);
    for (const [e, t] of this.ramHits) {
      if (t - dt <= 0) this.ramHits.delete(e);
      else this.ramHits.set(e, t - dt);
    }
    if (hs < 25) return;
    for (const e of g.entities.query(tmp.set(p.pos.x, p.pos.y + 0.9, p.pos.z), 1.8)) {
      if (!e.alive || e.carried || this.ramHits.has(e)) continue;
      this.ramHits.set(e, 0.8);
      const dir = new THREE.Vector3(p.vel.x, 0, p.vel.z).normalize();
      if (e.kind === 'car') e.driving = false;
      const dealt = e.damage(e.team === 'civ' ? 8 : 22, { type: 'impact', knock: dir.multiplyScalar(14 * Math.max(1, e.mass)).setY(6 * Math.max(1, e.mass)), source: p });
      if (dealt > 0) g.markers.damageNumber(e.centerInto(new THREE.Vector3()), dealt, '#9fdfff');
      g.audio.play('punchHit', e.pos);
      this.fighting();
    }
  }

  // ---------- Glitch takes over cars ----------

  upgradeCar(car) {
    if (car.upgraded) return;
    car.upgraded = true;
    car.savedColors = car.boxes.map((b) => b.color);
    for (const b of car.boxes) {
      if (b.glow) b.color = 0x7dff8a;
      else if (b.color !== 0x1c1c1c) b.color = b.color === 0x23303f ? 0x7dff8a : 0x111418;
    }
    this.game.hud.toast('Glitch takes over the car!', 'good', 1.2);
  }

  restoreCar(car) {
    if (!car.upgraded) return;
    car.upgraded = false;
    car.boxes.forEach((b, i) => (b.color = car.savedColors[i]));
  }

  onLand(speed) {
    const g = this.game;
    const p = g.player;
    if (speed < 20) return;
    p.landT = 0.3;
    g.effects.dust(tmp.set(p.pos.x, p.pos.y + 0.1, p.pos.z), this.form === 'brawl' ? 30 : 12, this.form === 'brawl' ? 2.5 : 1.2);
    g.audio.play(this.form === 'brawl' ? 'land' : 'thud');
    if (this.form === 'brawl' && speed > 26) {
      g.rig.shake = Math.max(g.rig.shake, 0.4);
      this.radial(4.5, 25, 6, 6);
    }
  }

  // ---------- HUD ----------

  updateUi() {
    const pct = Math.max(0, this.prism);
    this.prismFill.style.width = `${pct}%`;
    this.prismEl.classList.toggle('warn', this.form !== 'human' && pct < PRISM.warnAt);
    this.prismEl.classList.toggle('recharging', this.recharging);
    this.prismForm.textContent = this.recharging ? 'RECHARGING' : this.f.name.toUpperCase();
    if (this.wheelOpen) {
      this.wheelEl.classList.toggle('locked', this.recharging || this.prism < PRISM.minToTransform);
      this.animateWheel();
    }
  }

  /** The cone of light springs round to the chosen alien; a thin needle tracks the mouse. */
  animateWheel() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.wheelT) / 1000); // real time: the game itself is slowed down
    this.wheelT = now;
    const i = ALIENS.indexOf(this.choice);
    const v = this.wheelVec;
    const len = Math.hypot(v.x, v.y);
    const turn = (from, to, rate) => {
      const d = ((((to - from) % 360) + 540) % 360) - 180; // the shortest way round
      return from + d * (1 - Math.exp(-rate * dt));
    };
    if (i >= 0) this.coneAngle = turn(this.coneAngle, (i / ALIENS.length) * 360, 18);
    this.coneOn += ((i >= 0 ? 1 : 0) - this.coneOn) * (1 - Math.exp(-14 * dt));
    if (len > 8) this.needleAngle = turn(this.needleAngle, (Math.atan2(v.y, v.x) * 180) / Math.PI + 90, 30);
    this.wheelCone.style.transform = `translate(-50%, -50%) rotate(${this.coneAngle.toFixed(2)}deg)`;
    this.wheelCone.style.opacity = this.coneOn.toFixed(3);
    this.wheelNeedle.style.transform = `rotate(${this.needleAngle.toFixed(2)}deg)`;
    this.wheelNeedle.style.opacity = Math.min(1, len / 40).toFixed(2);
    this.wheelPrism.style.strokeDasharray = `${Math.max(0, this.prism).toFixed(1)} 100`;
  }

  place() {}

  hud(hud) {
    const f = this.f;
    hud.ab.laser.classList.toggle('active', this.held || this.special < 0.4);
    hud.ab.breath.classList.toggle('active', this.wheelOpen);
    hud.ab.breath.classList.toggle('disabled', false);
  }

  cooldowns() {
    const f = this.f;
    const shot = { fireball: 0.32, shards: 0.42, zap: 0.2 }[f.lmb];
    return {
      laser: f.rmb && f.rmb !== 'flamethrower' ? [this.specialCd, 1.8] : null,
      punch: shot ? [this.shotCd, shot] : null,
      // the band locked after a time-out: the Q button fills back up as it recharges
      breath: this.recharging ? [PRISM.rechargeUntil - this.prism, PRISM.rechargeUntil] : null,
    };
  }
}

export { PRISM };
