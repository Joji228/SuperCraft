// In-game overlay: meters, crosshair + hit markers, objectives, toasts, boss bar,
// ability bar, carry label, damage/senses overlays, speed lines and debug info.
import { CITY } from '../world/CityGenerator.js';
import { METERS } from '../abilities/Meters.js';

export class HUD {
  constructor(root, fxCanvas) {
    this.root = root;
    this.fx = fxCanvas;
    this.ctx = fxCanvas.getContext('2d');
    this.debug = false;
    root.innerHTML = `
      <div class="overlay-senses" id="hud-senses"></div>
      <div class="overlay-hurt" id="hud-hurt"></div>
      <div class="crosshair" id="hud-cross"><div class="hitmark" id="hud-hitmark"></div></div>
      <div class="hud-topleft">
        <canvas class="minimap" id="hud-minimap" width="176" height="176"></canvas>
        <div class="hud-stats" id="hud-stats"></div>
        <div class="hud-debug hidden" id="hud-debug"></div>
      </div>
      <div class="hud-topcenter">
        <div class="boss hidden" id="hud-boss"><div class="boss-name" id="hud-boss-name"></div><div class="boss-bar"><div class="boss-fill" id="hud-boss-fill"></div></div><div class="shield-bar hidden" id="hud-shield"><div class="shield-fill" id="hud-shield-fill"></div><span>FROZEN SHIELD</span></div></div>
        <div class="guide hidden" id="hud-guide"><div class="guide-arrow"></div><span id="hud-guide-dist"></span></div>
        <div class="toasts" id="hud-toasts"></div>
      </div>
      <div class="objectives hidden" id="hud-obj"><div class="obj-title" id="hud-obj-title"></div><div class="obj-timer" id="hud-obj-timer"></div><ul id="hud-obj-list"></ul></div>
      <div class="hud-status">
        <div class="meter health"><span class="meter-label">HP</span><div class="meter-bar"><div class="meter-fill" id="hud-hp"></div></div></div>
        <div class="meter energy"><span class="meter-label">EN</span><div class="meter-bar"><div class="meter-fill" id="hud-en"></div></div></div>
        <div class="meter heat" id="hud-heat-row"><span class="meter-label">HEAT</span><div class="meter-bar"><div class="meter-fill" id="hud-heat"></div></div></div>
        <div class="meter speed" id="hud-spd-row"><span class="meter-label">SPEED</span><div class="meter-bar"><div class="meter-fill" id="hud-spd"></div></div></div>
        <div class="hud-mode" id="hud-mode">ON FOOT</div>
        <div class="hud-readout"><span id="hud-speed">0</span> <span id="hud-unit">KM/H</span> &nbsp; ALT <span id="hud-alt">0</span> M</div>
      </div>
      <div class="carry hidden" id="hud-carry"></div>
      <div class="speedo hidden" id="hud-speedo">
        <div class="speedo-dial"><div class="speedo-ticks"></div><div class="speedo-needle" id="hud-needle"></div><div class="speedo-num"><span id="hud-kmh">0</span><small>KM/H</small></div></div>
        <div class="speedo-row"><span>CAR</span><div class="speedo-bar"><div class="speedo-fill" id="hud-carhp"></div></div></div>
        <div class="speedo-keys"><span><b>R</b> get out</span><span><b>F</b> fly out</span><span><b>SHIFT</b> nitro</span><span><b>SPACE</b> drift</span><span><b>H</b> horn</span></div>
      </div>
      <div class="prompt hidden" id="hud-prompt"></div>
      <div class="charge hidden" id="hud-charge"><span>LEAP</span><div class="charge-bar"><div class="charge-fill" id="hud-charge-fill"></div></div></div>
      <div class="banner hidden" id="hud-banner"></div>
      <div class="idle-hint hidden" id="hud-idle"></div>
      <div class="abilities">
        <div class="ab" id="ab-boost"><b>SHIFT</b>Boost</div>
        <div class="ab" id="ab-punch"><b>LMB</b>Punch</div>
        <div class="ab" id="ab-laser"><b>RMB</b>Laser</div>
        <div class="ab" id="ab-breath"><b>Q</b>Breath</div>
        <div class="ab" id="ab-senses"><b>E</b>Senses</div>
        <div class="ab" id="ab-carry"><b>G</b>Carry</div>
        <div class="ab" id="ab-fly"><b>F</b>Fly</div>
      </div>
      <div class="hud-hint" id="hud-hint">
        <b>WASD</b> move &nbsp; <b>SPACE</b> jump &nbsp; <b>F</b> fly &nbsp; <b>SHIFT</b> boost<br>
        Flying: <b>SPACE</b> up &nbsp; <b>C/CTRL</b> down<br>
        <b>V</b> camera &nbsp; <b>ESC</b> pause &nbsp; <b>F3</b> debug
      </div>
      <div class="hud-click">Click to play</div>
      <div class="hud-flash" id="hud-flash"></div>
    `;
    const q = (id) => root.querySelector('#' + id);
    this.mode = q('hud-mode');
    this.speed = q('hud-speed');
    this.alt = q('hud-alt');
    this.unit = q('hud-unit');
    this.flashEl = q('hud-flash');
    this.hint = q('hud-hint');
    this.debugEl = q('hud-debug');
    this.hp = q('hud-hp');
    this.en = q('hud-en');
    this.heat = q('hud-heat');
    this.heatRow = q('hud-heat-row');
    this.spd = q('hud-spd');
    this.spdRow = q('hud-spd-row');
    this.hitmark = q('hud-hitmark');
    this.hurtEl = q('hud-hurt');
    this.sensesEl = q('hud-senses');
    this.toastsEl = q('hud-toasts');
    this.bossEl = q('hud-boss');
    this.bossName = q('hud-boss-name');
    this.bossFill = q('hud-boss-fill');
    this.shieldEl = q('hud-shield');
    this.shieldFill = q('hud-shield-fill');
    this.objEl = q('hud-obj');
    this.objTitle = q('hud-obj-title');
    this.objTimer = q('hud-obj-timer');
    this.objList = q('hud-obj-list');
    this.carryEl = q('hud-carry');
    this.speedoEl = q('hud-speedo');
    this.needle = q('hud-needle');
    this.kmh = q('hud-kmh');
    this.carHp = q('hud-carhp');
    this.wasDriving = false;
    this.promptEl = q('hud-prompt');
    this.chargeEl = q('hud-charge');
    this.chargeFill = q('hud-charge-fill');
    this.bannerEl = q('hud-banner');
    this.idleEl = q('hud-idle');
    this.guideEl = q('hud-guide');
    this.guideDist = q('hud-guide-dist');
    this.statsEl = q('hud-stats');
    this.minimapCanvas = q('hud-minimap');
    this.ab = {
      punch: q('ab-punch'),
      boost: q('ab-boost'),
      laser: q('ab-laser'),
      breath: q('ab-breath'),
      senses: q('ab-senses'),
      carry: q('ab-carry'),
      fly: q('ab-fly'),
    };
    this.hintTimer = 14;
    this.lastMode = '';
    this.hurt = 0;
    this.hitTimer = 0;
    this.lastObjHtml = '';
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Leap charge bar under the crosshair (k 0..1, or null to hide). */
  setCharge(k) {
    if (k === null) {
      if (!this.chargeEl.classList.contains('hidden')) this.chargeEl.classList.add('hidden');
      return;
    }
    this.chargeEl.classList.remove('hidden');
    this.chargeFill.style.width = `${Math.round(k * 100)}%`;
    this.chargeEl.classList.toggle('full', k >= 1);
  }

  /**
   * Cooldown haze on the ability buttons: a coloured fill that drains away as the
   * power recharges, then a quick flash when it's ready again.
   */
  updateCooldowns(game) {
    const cds = { ...(game.heroKit?.cooldowns?.() || {}) };
    const pu = game.abilities.punch;
    if (!cds.punch && pu.cooldownTotal >= 0.4) cds.punch = [pu.cooldown, pu.cooldownTotal];
    this.cdState ||= {};
    for (const [slot, el] of Object.entries(this.ab)) {
      const c = cds[slot];
      const k = c && c[1] > 0 ? Math.max(0, Math.min(1, c[0] / c[1])) : 0;
      const was = this.cdState[slot] || 0;
      if (k === was) continue;
      this.cdState[slot] = k;
      el.style.setProperty('--cd', k.toFixed(3));
      el.classList.toggle('cooling', k > 0);
      if (k === 0 && was > 0) {
        el.classList.remove('ready');
        void el.offsetWidth; // restart the flash
        el.classList.add('ready');
      }
    }
  }

  /** Ability bar, controls hint and meters for the hero in play. */
  setHeroLayout(id) {
    const LAYOUTS = {
      sky: {
        ab: { boost: ['SHIFT', 'Boost'], punch: ['LMB', 'Punch'], laser: ['RMB', 'Laser'], breath: ['Q', 'Breath'], senses: ['E', 'Senses'], carry: ['G', 'Carry'], fly: ['F', 'Fly'] },
        hint: '<b>WASD</b> move &nbsp; <b>SPACE</b> jump &nbsp; <b>F</b> fly &nbsp; <b>SHIFT</b> boost<br>Flying: <b>SPACE</b> up &nbsp; <b>C/CTRL</b> down<br><b>V</b> camera &nbsp; <b>ESC</b> pause &nbsp; <b>F3</b> debug',
        heat: true,
      },
      tether: {
        ab: { boost: ['SHIFT', 'Run'], punch: ['LMB', 'Punch'], senses: ['SPACE', 'Swing'], laser: ['RMB', 'Web'], breath: ['Q', 'Zip'], carry: ['G', 'Carry'], fly: null },
        hint: 'In the air, press <b>SPACE</b> for each web: hold to swing, let go near the top for a boost<br>Hold <b>SHIFT</b> while swinging for speed &nbsp; <b>Q</b> web zip &nbsp; <b>RMB</b> web shot &nbsp; <b>LMB</b> combo<br><b>SHIFT</b>+<b>W</b> runs up walls, <b>SPACE</b> kicks off them',
        heat: false,
      },
      'flux-human': {
        ab: { boost: ['SHIFT', 'Run'], punch: ['LMB', 'Punch'], breath: ['Q', 'Aliens'], carry: ['G', 'Carry'], laser: null, senses: null, fly: null },
        hint: 'Hold <b>Q</b> and move the mouse to pick an alien<br><b>WASD</b> move &nbsp; <b>SHIFT</b> run &nbsp; <b>SPACE</b> jump &nbsp; <b>LMB</b> punch<br>Swim, and climb out at the wall ladders &nbsp; <b>R</b> next to a car to drive',
        heat: false,
      },
      'flux-cinder': {
        ab: { punch: ['LMB', 'Fireball'], laser: ['RMB', 'Flames'], fly: ['F', 'Fly'], breath: ['Q', 'Aliens'], carry: ['G', 'Carry'], boost: null, senses: null },
        hint: '<b>LMB</b> fireballs &nbsp; hold <b>RMB</b> flamethrower<br><b>F</b> fly on flames (uses energy) &nbsp; fire cannot hurt him<br>Hold <b>Q</b> to change',
        heat: false,
      },
      'flux-brawl': {
        ab: { boost: ['SHIFT', 'Charge'], punch: ['LMB', 'Punch'], laser: ['RMB', 'Slam'], breath: ['Q', 'Aliens'], carry: ['G', 'Carry'], senses: null, fly: null },
        hint: '<b>LMB</b> four-fist punches (they smash walls) &nbsp; <b>RMB</b> shockwave slam<br><b>SPACE</b> huge jump &nbsp; <b>SHIFT</b> charge<br>Hold <b>Q</b> to change',
        heat: false,
      },
      'flux-blitz': {
        ab: { boost: ['SHIFT', 'Speed'], punch: ['LMB', 'Strike'], laser: ['RMB', 'Cyclone'], breath: ['Q', 'Aliens'], carry: ['G', 'Carry'], senses: null, fly: null },
        hint: '<b>SHIFT</b> super speed (run through enemies) &nbsp; <b>LMB</b> rapid strikes<br><b>RMB</b> cyclone<br>Hold <b>Q</b> to change',
        heat: false,
      },
      'flux-shard': {
        ab: { punch: ['LMB', 'Shards'], laser: ['RMB', 'Spikes'], breath: ['Q', 'Aliens'], carry: ['G', 'Carry'], boost: null, senses: null, fly: null },
        hint: '<b>LMB</b> crystal shards &nbsp; <b>RMB</b> crystal spikes<br>Takes far less damage<br>Hold <b>Q</b> to change',
        heat: false,
      },
      forge: {
        ab: { boost: ['SHIFT', 'Boost'], punch: ['LMB', 'Punch'], laser: ['RMB', 'Repulsor'], breath: ['Q', 'Unibeam'], senses: ['E', 'Missiles'], carry: ['G', 'Carry'], fly: ['F', 'Fly'] },
        hint: '<b>F</b> fly &nbsp; <b>SHIFT</b> boost (hold for the afterburner) &nbsp; <b>SPACE/C</b> up/down<br>Hold <b>RMB</b> repulsors &nbsp; hold <b>Q</b> Unibeam &nbsp; <b>E</b> homing missiles<br><b>LMB</b> punch &nbsp; <b>G</b> carry &nbsp; <b>V</b> camera',
        heat: true,
      },
      granite: {
        ab: { boost: ['SHIFT', 'Run'], punch: ['LMB', 'Punch'], laser: ['SPACE', 'Leap'], breath: ['Q', 'Clap'], senses: ['RMB', 'Smash'], carry: ['G', 'Carry'], fly: null },
        hint: '<b>WASD</b> move &nbsp; <b>SHIFT</b> run &nbsp; <b>LMB</b> punch<br>Hold <b>SPACE</b> to charge a leap, let go to jump<br><b>RMB</b> smash (in the air: dive slam) &nbsp; <b>Q</b> clap',
        heat: false,
      },
    };
    const L = LAYOUTS[id] || LAYOUTS.sky;
    for (const [k, el] of Object.entries(this.ab)) {
      const v = L.ab[k];
      el.style.display = v ? '' : 'none';
      if (v) el.innerHTML = `<b>${v[0]}</b>${v[1]}`;
      el.classList.remove('active', 'disabled');
    }
    this.hint.innerHTML = L.hint;
    this.heatRow.style.display = L.heat ? '' : 'none';
  }

  resize() {
    this.fx.width = window.innerWidth;
    this.fx.height = window.innerHeight;
  }

  show(v) {
    this.root.classList.toggle('hidden', !v);
    if (!v) this.ctx.clearRect(0, 0, this.fx.width, this.fx.height);
  }

  toggleDebug() {
    this.debug = !this.debug;
    this.debugEl.classList.toggle('hidden', !this.debug);
  }

  reset() {
    this.toastsEl.innerHTML = '';
    this.setBoss(null);
    this.setObjectives(null);
    this.setCarry(null);
    this.setSenses(false);
    this.setStats('');
    this.setPrompt(null);
    this.setGuide(null);
    this.setBanner(null);
    this.setIdleHint(null);
    this.hurt = 0;
  }

  // ---------- notifications ----------

  toast(text, kind = 'info', seconds = 3) {
    // don't stack identical messages
    for (const el of this.toastsEl.children) if (el.textContent === text) return;
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.textContent = text;
    this.toastsEl.appendChild(el);
    while (this.toastsEl.children.length > 4) this.toastsEl.firstChild.remove();
    setTimeout(() => el.classList.add('out'), seconds * 1000);
    setTimeout(() => el.remove(), seconds * 1000 + 600);
  }

  hitMarker(kill = false, light = false) {
    this.hitmark.className = 'hitmark show' + (kill ? ' kill' : '') + (light ? ' light' : '');
    this.hitTimer = kill ? 0.35 : 0.15;
  }

  damaged(amount) {
    this.hurt = Math.min(1, this.hurt + amount / 25);
  }

  /** Grey out powers that aren't unlocked yet (tutorial). */
  setLocks(locks) {
    const map = { punch: 'punch', laser: 'laser', breath: 'breath', senses: 'senses', carry: 'carry', fly: 'fly', boost: 'boost' };
    for (const [k, id] of Object.entries(map)) this.ab[id]?.classList.toggle('locked', locks.has(k));
  }

  setSenses(on) {
    this.sensesEl.classList.toggle('on', on);
    this.ab.senses.classList.toggle('active', on);
  }

  /** Small red arrow under the boss bar pointing (relative to the camera) at the objective. */
  setGuide(target, camYaw, from) {
    if (!target) {
      this.guideEl.classList.add('hidden');
      return;
    }
    const dx = target.x - from.x, dz = target.z - from.z;
    const d = Math.hypot(dx, dz);
    // hide when you're basically there
    this.guideEl.classList.toggle('hidden', d < 12);
    let rel = Math.atan2(-dx, -dz) - camYaw;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    this.guideEl.style.setProperty('--rot', `${-rel}rad`);
    this.guideDist.textContent = Math.round(d) + ' m';
  }

  /** Big step-by-step instruction at the top (tutorial). Key names in brackets get highlighted. */
  setBanner(text, kicker = '') {
    this.bannerEl.classList.toggle('hidden', !text);
    document.body.classList.toggle('has-banner', !!text);
    if (!text) return;
    const html = (kicker ? `<small>${kicker}</small>` : '') + text.replace(/\(([^)]+)\)/g, '<b>$1</b>');
    if (this.bannerEl.innerHTML !== html) this.bannerEl.innerHTML = html;
  }

  /** Flashing centre-screen reminder when the player hasn't done anything for a few seconds. */
  setIdleHint(text) {
    this.idleEl.classList.toggle('hidden', !text);
    if (!text) return;
    const html = text.replace(/\(([^)]+)\)/g, '<b>$1</b>');
    if (this.idleEl.innerHTML !== html) this.idleEl.innerHTML = html;
  }

  /** A context hint like "Press T to summon the Iron Tyrant". */
  setPrompt(html) {
    this.promptEl.classList.toggle('hidden', !html);
    if (html && this.promptEl.innerHTML !== html) this.promptEl.innerHTML = html;
  }

  setCarry(label) {
    this.carryEl.classList.toggle('hidden', !label);
    if (label) this.carryEl.innerHTML = `Carrying <b>${label}</b> &middot; G drop &middot; LMB throw`;
    this.ab.carry.classList.toggle('active', !!label);
  }

  /** shield: fraction for the blue frozen-shield bar, or null to hide it. */
  setBoss(name, frac = 1, shield = null) {
    if (!name) {
      this.bossEl.classList.add('hidden');
      return;
    }
    this.bossEl.classList.remove('hidden');
    this.bossName.textContent = name;
    this.bossFill.style.width = `${Math.max(0, frac) * 100}%`;
    this.shieldEl.classList.toggle('hidden', shield === null);
    if (shield !== null) this.shieldFill.style.width = `${Math.max(0, shield) * 100}%`;
  }

  setStats(html) {
    if (this.statsEl.innerHTML !== html) this.statsEl.innerHTML = html;
  }

  /** obj: { title, timer (seconds or null), items: [{ text, done }] } or null */
  setObjectives(obj) {
    if (!obj) {
      this.objEl.classList.add('hidden');
      this.lastObjHtml = '';
      return;
    }
    this.objEl.classList.remove('hidden');
    if (this.objTitle.textContent !== obj.title) this.objTitle.textContent = obj.title;
    const html = obj.items.map((i) => `<li class="${i.done ? 'done' : ''}">${i.text}</li>`).join('');
    if (html !== this.lastObjHtml) {
      this.objList.innerHTML = html;
      this.lastObjHtml = html;
    }
    if (obj.timer == null) this.objTimer.textContent = '';
    else {
      const t = Math.max(0, Math.ceil(obj.timer));
      this.objTimer.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      this.objTimer.classList.toggle('urgent', t <= 30);
    }
  }

  flash(strength = 0.5, color = '#ffffff') {
    const el = this.flashEl;
    el.style.background = color;
    el.style.transition = 'none';
    el.style.opacity = String(strength);
    void el.offsetWidth; // restart the fade
    el.style.transition = 'opacity 0.6s ease-out';
    el.style.opacity = '0';
  }

  // ---------- per frame ----------

  update(dt, game, info) {
    const player = game.player;
    const m = game.meters;
    const drv = game.driving;
    const driving = drv.active;
    if (driving !== this.wasDriving) {
      this.wasDriving = driving;
      this.speedoEl.classList.toggle('hidden', !driving);
      document.body.classList.toggle('driving', driving);
    }
    if (driving) {
      const kmh = Math.round(Math.abs(drv.speed) * 3.6);
      this.kmh.textContent = kmh;
      this.needle.style.transform = `rotate(${-135 + Math.min(1, kmh / 200) * 270}deg)`;
      const hp = Math.max(0, drv.car.health / drv.car.maxHealth);
      this.carHp.style.width = `${hp * 100}%`;
      this.carHp.classList.toggle('low', hp < 0.35);
      this.speedoEl.classList.toggle('nitro', drv.nitro);
    }
    const mode = driving ? (drv.nitro ? 'NITRO' : 'DRIVING') : player.modeLabel ? player.modeLabel : player.supersonic ? 'SUPERSONIC' : player.boosting ? 'BOOST' : player.flying ? 'FLYING' : player.diving ? 'DIVING' : 'ON FOOT';
    if (mode !== this.lastMode) {
      this.mode.textContent = mode;
      this.mode.className = 'hud-mode mode-' + mode.toLowerCase().replace(' ', '-');
      this.lastMode = mode;
      this.ab.fly.classList.toggle('active', player.flying);
    }
    if (player.supersonic) {
      // game-world speeds are scaled down; show the fantasy number once past the barrier
      this.speed.textContent = 'MACH ' + (1 + Math.max(0, player.vel.length() - 62) / 130).toFixed(2);
      this.unit.textContent = '';
    } else {
      this.speed.textContent = Math.round(player.vel.length() * 3.6 * (player.speedShow || 1));
      this.unit.textContent = 'KM/H';
    }
    this.alt.textContent = Math.max(0, Math.round(player.pos.y - CITY.G));

    this.hp.style.width = `${(m.health / METERS.maxHealth) * 100}%`;
    this.hp.classList.toggle('low', m.health < 30);
    this.en.style.width = `${(m.energy / METERS.maxEnergy) * 100}%`;
    this.heat.style.width = `${m.heat}%`;
    this.spd.style.width = `${m.speed}%`;
    this.spdRow.classList.toggle('empty', m.speed < 12);
    this.ab.boost.classList.toggle('active', player.boosting);
    this.heatRow.classList.toggle('overheated', m.overheated);
    const ab = game.abilities;
    this.ab.laser.classList.toggle('active', ab.laser.active);
    this.ab.laser.classList.toggle('disabled', m.overheated);
    this.ab.breath.classList.toggle('active', ab.breath.active);
    this.ab.breath.classList.toggle('disabled', m.energy < 1);
    game.heroKit?.hud?.(this);
    this.updateCooldowns(game);

    this.hurt = Math.max(0, this.hurt - dt * 1.2);
    this.hurtEl.style.opacity = String(Math.min(0.85, this.hurt + (m.health < 30 ? 0.25 + 0.1 * Math.sin(performance.now() / 200) : 0)));

    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.hitmark.className = 'hitmark';
    }

    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hint.classList.add('fade');
    }

    if (this.debug) {
      const p = player.pos;
      this.debugEl.innerHTML =
        `FPS ${info.fps}<br>` +
        `XYZ ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}<br>` +
        `CHUNKS ${info.chunks} DRAWS ${info.calls}<br>TRIS ${(info.tris / 1000).toFixed(0)}K ENT ${info.entities} FX ${info.particles}`;
    }

    this.drawSpeedLines(player.boostAmount);
  }

  drawSpeedLines(amount) {
    const ctx = this.ctx;
    const w = this.fx.width, h = this.fx.height;
    ctx.clearRect(0, 0, w, h);
    if (amount < 0.25) return;
    const a = Math.min(1.3, (amount - 0.25) / 0.75);
    const cx = w / 2, cy = h / 2;
    const r0 = Math.min(w, h) * 0.32;
    const rMax = Math.hypot(w, h) / 2;
    ctx.strokeStyle = `rgba(255,255,255,${0.35 * a})`;
    ctx.lineCap = 'round';
    const n = Math.floor(40 * a);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r1 = r0 + Math.random() * (rMax - r0) * 0.6;
      const r2 = r1 + 60 + Math.random() * 160 * a;
      ctx.lineWidth = 1 + Math.random() * 3;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
      ctx.stroke();
    }
  }
}
