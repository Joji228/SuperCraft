// Top-level game object: owns every system and switches between
// loading / menu / playing / paused / cutscene, and between Free Roam and campaign missions.
import * as THREE from 'three';
import { createRenderer } from './Renderer.js';
import { Loop } from './Loop.js';
import { Settings } from './Settings.js';
import { Events } from './Events.js';
import { Input } from '../input/Input.js';
import { World } from '../world/World.js';
import { generateCity, spawnPoint, CITY } from '../world/CityGenerator.js';
import { createAtlas } from '../world/Textures.js';
import { B, SOLID, LASER_PROOF } from '../world/Blocks.js';
import { ChunkRenderer } from '../world/ChunkRenderer.js';
import { Sky } from '../world/Sky.js';
import { createOcean } from '../world/Ocean.js';
import { Fires } from '../world/Fires.js';
import { Zones } from '../world/Zones.js';
import { Player } from '../player/Player.js';
import { HeroModel } from '../player/HeroModel.js';
import { CameraRig } from '../player/CameraRig.js';
import { FirstPersonArms } from '../player/FirstPersonArms.js';
import { Driving } from '../player/Driving.js';
import { GraniteModel } from '../heroes/granite/GraniteModel.js';
import { GraniteKit, GRANITE } from '../heroes/granite/GraniteKit.js';
import { TetherModel } from '../heroes/tether/TetherModel.js';
import { TetherKit, TETHER } from '../heroes/tether/TetherKit.js';
import { ForgeModel } from '../heroes/forge/ForgeModel.js';
import { ForgeKit, FORGE } from '../heroes/forge/ForgeKit.js';
import { DEFAULT_FLIGHT } from '../player/Player.js';
import { FluxModel } from '../heroes/flux/FluxModels.js';
import { FluxKit } from '../heroes/flux/FluxKit.js';
import { Ladders } from '../world/Ladders.js';
import { heroById } from '../player/heroes.js';
import { skinById } from '../player/skins.js';
import { Meters } from '../abilities/Meters.js';
import { Abilities } from '../abilities/Abilities.js';
import { Entities } from '../entities/Entities.js';
import { HumanoidRenderer } from '../entities/Humanoid.js';
import { BoxRenderer } from '../entities/BoxRenderer.js';
import { scatterProps } from '../entities/Props.js';
import { Crowd } from '../npc/Civilians.js';
import { Traffic } from '../npc/Traffic.js';
import { Projectiles } from '../combat/Projectiles.js';
import { HUD } from '../ui/HUD.js';
import { Menus } from '../ui/Menus.js';
import { Markers } from '../ui/Markers.js';
import { Minimap } from '../ui/Minimap.js';
import { Particles } from '../fx/Particles.js';
import { Effects } from '../fx/Effects.js';
import { FlightFX } from '../fx/FlightFX.js';
import { ShockRings } from '../fx/ShockRings.js';
import { Audio } from '../audio/Audio.js';
import { FreeRoam } from '../modes/FreeRoam.js';
import { MissionRun, loadProgress } from '../missions/MissionManager.js';
import { MISSIONS } from '../missions/missions.js';

// a short timeout (not rAF) so loading also progresses in background tabs
const nextFrame = () => new Promise((r) => setTimeout(r, 20));
const tmpV = new THREE.Vector3();

export class Game {
  constructor() {
    this.state = 'loading';
    this.settings = new Settings();
    const { renderer, camera } = createRenderer(document.getElementById('game'));
    this.renderer = renderer;
    this.camera = camera;
    this.scene = new THREE.Scene();
    this.events = new Events();
    this.input = new Input(renderer.domElement);
    this.hud = new HUD(document.getElementById('hud'), document.getElementById('fx'));
    this.markers = new Markers(document.getElementById('hud'), camera);
    this.menus = new Menus(document.getElementById('ui'), this.settings, this);
    this.loop = new Loop((dt) => this.frame(dt));
    this.audio = new Audio(this.settings);
    // browsers only allow sound after a user gesture
    window.addEventListener('pointerdown', () => this.audio.unlock());
    window.addEventListener('keydown', () => this.audio.unlock());
    this.menuTime = 0;
    this.time = 0;
    this.hitStopTime = 0;
    this.dangers = [];
    this.mode = null;
    this.propCells = new Set();
    this.propTimer = 0;
    this.koTimer = 0;
    this.cutscene = null;
    this.locks = new Set(); // powers not yet unlocked (tutorial)

    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing') this.pause();
    };
    renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked) this.input.lock();
    });
    this.settings.onChange((k, v) => this.applySetting(k, v));
  }

  async init() {
    this.menus.showLoading();
    await nextFrame();
    const t0 = performance.now();
    this.atlas = createAtlas();
    this.world = new World();
    generateCity(this.world);
    const tGen = performance.now() - t0;
    this.menus.setProgress(0.05, 'Laying bricks...');
    await nextFrame();

    this.chunks = new ChunkRenderer(this.world, this.scene, this.atlas);
    await this.chunks.buildAll((p) => this.menus.setProgress(0.05 + p * 0.9));
    this.menus.setProgress(0.96, 'Drawing the map...');
    await nextFrame();
    console.info(`[SuperCraft] city generated in ${tGen.toFixed(0)} ms, meshed in ${(performance.now() - t0 - tGen).toFixed(0)} ms`);

    this.sky = new Sky(this.scene);
    this.ocean = createOcean(this.scene);
    this.player = new Player(this.world);
    // one model per hero; this.hero is whichever is in play
    this.models = { sky: new HeroModel(), granite: new GraniteModel(), tether: new TetherModel(), forge: new ForgeModel(), flux: new FluxModel('human') };
    for (const m of Object.values(this.models)) {
      m.setVisible(false);
      this.scene.add(m.root);
    }
    this.hero = this.models.sky;
    this.heroId = 'sky';
    this.heroKit = null; // extra powers of a non-default hero (Granite's leap and clap)
    this.rig = new CameraRig(this.camera, this.world, this.settings);
    this.scene.add(this.camera); // so the first-person arms (children of the camera) render
    this.fpArms = new FirstPersonArms(this.camera);
    this.particles = new Particles(this.scene, 7000);
    this.effects = new Effects(this.particles);
    this.flightFX = new FlightFX(this.scene, this.particles, this.world);
    this.rings = new ShockRings(this.scene);
    this.applySkin('sky'); // Sky Guardian's colours (costume choice was retired for the Heroes menu)
    this.player.onSonicBoom = () => (this.heroKit?.afterburner ? this.heroKit.afterburner() : this.sonicBoom());
    this.player.onHeroLanding = (speed) => (this.heroKit?.onLand ? this.heroKit.onLand(speed) : this.heroLanding(speed));
    this.meters = new Meters();
    this.player.allowed = (name) => this.allowed(name);
    this.player.canBoost = (already) => (this.player.boosting || already ? this.meters.speed > 0 : this.meters.speed > 12);
    // a tall light beam over the current objective
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.9, 90, 12, 1, true).translate(0, 45, 0),
      new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }),
    );
    this.beacon.visible = false;
    this.scene.add(this.beacon);
    this.entities = new Entities(this);
    this.humanoids = new HumanoidRenderer(this.scene);
    this.boxes = new BoxRenderer(this.scene);
    this.projectiles = new Projectiles(this);
    this.fires = new Fires(this);
    this.zones = new Zones(this);
    this.ladders = new Ladders(this);
    this.abilities = new Abilities(this);
    this.driving = new Driving(this);
    this.crowd = new Crowd(this);
    this.traffic = new Traffic(this);
    this.minimap = new Minimap(this.hud.minimapCanvas, this.world);
    this.audio.listener = this.player.pos;

    for (const k of ['renderDistance', 'shadows', 'dayNight']) this.applySetting(k, this.settings[k]);

    this.prewarm();
    this.state = 'menu';
    this.menus.showMain();
    document.body.classList.remove('booting'); // full-screen button appears once loading is done
    this.loop.start();
  }

  applySetting(key, value) {
    switch (key) {
      case 'renderDistance':
        this.camera.far = value * 1.2 + 60;
        this.camera.updateProjectionMatrix();
        this.sky?.setRenderDistance(value);
        break;
      case 'shadows':
        if (this.sky) this.sky.sun.castShadow = value;
        this.chunks?.setShadows(value);
        break;
      case 'skin':
        this.applySkin(value);
        break;
      case 'dayNight':
        if (!this.sky) break;
        this.sky.cycle = value;
        if (!value) this.setTimeOfDay(this.baseTime ?? 0.36);
        break;
    }
  }

  applySkin(id) {
    const sk = skinById(id);
    this.hero.applySkin(sk);
    this.fpArms.applySkin(sk);
    this.flightFX?.setPalette(sk.suit, sk.accent, sk.belt);
  }

  setTimeOfDay(t) {
    this.baseTime = t;
    this.sky.time = t;
    this.sky.apply();
    this.chunks.setNight(this.sky.night);
  }

  /** Camera below the water line: blue haze, short murky view and a tinted screen. */
  updateUnderwater(cam) {
    const w = this.world;
    const under = this.state !== 'menu' && w.get(Math.floor(cam.position.x), Math.floor(cam.position.y), Math.floor(cam.position.z)) === B.WATER;
    if (!this.uwEl) {
      this.uwEl = document.createElement('div');
      this.uwEl.className = 'underwater';
      document.getElementById('fx').before(this.uwEl);
    }
    if (under) {
      const fog = this.scene.fog;
      fog.color.setHex(0x1f6c94);
      this.scene.background.setHex(0x1f6c94);
      fog.near = 1;
      fog.far = 34;
      this.sky.dome.visible = false;
    } else if (this.underwater) {
      this.sky.dome.visible = true;
      this.sky.apply();
      this.sky.setRenderDistance(this.settings.renderDistance);
    }
    if (under !== this.underwater) {
      this.underwater = under;
      this.uwEl.classList.toggle('on', under);
      if (under) this.audio.play('splash');
    }
  }

  // ---------- shared gameplay services ----------

  allowed(name) {
    return !this.locks.has(name) && !this.heroKit?.disallow.has(name);
  }

  /**
   * What the current hero can do at all (in any form), so Free Roam only sends
   * emergencies he can actually handle. 'douse': put fires out; 'carry': lift people.
   */
  heroCan(cap) {
    const k = this.heroKit;
    if (!k) return true; // Sky Guardian can do everything
    if (cap === 'douse') return !!k.canDouse;
    if (cap === 'carry') return k.canCarry ?? !k.disallow.has('carry');
    return true;
  }

  /**
   * Auto resolution: if frames stay slow (usually a big, high-DPI screen filling the
   * GPU), render at a slightly lower resolution; creep back up once there's headroom.
   */
  autoResolution(dt) {
    this.basePR ??= this.renderer.getPixelRatio();
    this.resScale ??= 1;
    if (!this.settings.autoRes) {
      if (this.resScale !== 1) this.setResScale(1);
      return;
    }
    this.resT = (this.resT || 0) + dt;
    this.resN = (this.resN || 0) + 1;
    if (this.resT < 2) return;
    const avg = this.resT / this.resN;
    this.resT = this.resN = 0;
    // two slow stretches in a row (not just one busy moment) before giving up any sharpness
    this.resBad = avg > 1 / 48 ? (this.resBad || 0) + 1 : 0;
    if (this.resBad >= 2 && this.resScale > 0.71) {
      this.setResScale(Math.max(0.7, this.resScale * 0.88));
      this.resBad = 0;
      this.resGood = 0;
    } else if (avg < 1 / 57 && this.resScale < 1) {
      this.resGood = (this.resGood || 0) + 1;
      if (this.resGood >= 3) {
        this.setResScale(Math.min(1, this.resScale * 1.12));
        this.resGood = 0;
      }
    } else this.resGood = 0;
  }

  setResScale(s) {
    this.resScale = s;
    this.renderer.setPixelRatio(this.basePR * s);
  }

  ensureKits() {
    if (!this.kits) this.kits = { granite: new GraniteKit(this), tether: new TetherKit(this), forge: new ForgeKit(this), flux: new FluxKit(this) };
  }

  /**
   * Compile every hero's and alien's shaders while loading, so switching hero or
   * transforming for the first time doesn't stutter.
   */
  prewarm() {
    this.ensureKits();
    const shown = [];
    const reveal = (root) =>
      root.traverse((o) => {
        if (!o.visible) {
          o.visible = true;
          shown.push(o);
        }
      });
    for (const m of Object.values(this.models)) reveal(m.root);
    for (const k of Object.values(this.kits)) for (const m of Object.values(k.models || {})) reveal(m.root);
    try {
      this.renderer.compile(this.scene, this.camera);
    } catch (e) {
      console.warn('[SuperCraft] shader prewarm skipped', e);
    }
    for (const o of shown) o.visible = false;
  }

  /**
   * Switch the playable hero: model, body size, movement, camera height and HUD.
   * The campaign is always Sky Guardian; Free Roam uses the hero picked in the Heroes menu.
   */
  setHero(id) {
    if (!this.models[id]) id = 'sky';
    const p = this.player;
    this.ensureKits();
    this.heroKit?.reset?.();
    this.hero.setVisible(false);
    this.heroId = id;
    this.hero = this.models[id];
    this.heroKit = this.kits[id] || null;
    const big = id === 'granite';
    const tether = id === 'tether';
    const forge = id === 'forge';
    p.flight = forge ? { ...FORGE.flight } : { ...DEFAULT_FLIGHT };
    p.beforeMove = forge ? () => this.kits.forge.bumper() : null;
    p.halfW = big ? GRANITE.body.halfW : 0.38;
    p.height = big ? GRANITE.body.height : 1.9;
    p.stats = big ? { ...GRANITE.stats } : tether ? { ...TETHER.stats } : { walk: 7, run: 13, sprint: 36, jump: 12.5 };
    p.chargeJump = big;
    p.noSprint = forge; // Forge just runs on foot; Shift only boosts his flight
    p.speedShow = 1;
    p.wades = big || tether;
    p.modeLabel = null;
    p.stepHeight = big ? 2.01 : 1.01; // he strides up two-block ledges
    p.airControl = big ? GRANITE.airControl : 3;
    p.waterSolid = !big; // Granite sinks and wades; Aegis treats water as a floor (and hovers)
    p.noTrail = big || tether;
    if (big || tether) p.flying = false;
    this.rig.eye = big ? GRANITE.eye : 1.72;
    this.rig.distScale = big ? GRANITE.camScale : tether ? 1.15 : 1;
    const pal = big ? GRANITE.palette : tether ? TETHER.palette : forge ? FORGE.palette : null;
    if (pal) {
      this.fpArms.applySkin(pal);
      this.flightFX.setPalette(pal.suit, pal.accent, pal.belt);
    } else this.applySkin('sky');
    this.hud.setHeroLayout(id);
    this.heroKit?.onSelect?.(); // Flux starts as Deka (sets his own body, HUD and models)
  }

  /**
   * Cars (and the ambulance) are solid to the hero. Strong heroes shove them out of
   * the way, and hard enough to dent them; everyone else bumps off. You can also land
   * on the roof.
   */
  collideVehicles() {
    const p = this.player;
    const held = this.abilities.carry.held;
    const strong = this.heroKit ? this.heroKit.shovesCars ?? true : true; // Sky Guardian is strong
    for (const e of this.entities.query(p.pos, 7, (x) => (x.kind === 'car' || x.kind === 'ambulance') && !x.carried && !x.removed && x !== held)) {
      const [bx, bz, bh] = e.kind === 'ambulance' ? [1.2, 2.7, 2.55] : [1.0, 2.1, 1.62];
      const top = e.pos.y + bh;
      if (p.pos.y + p.height < e.pos.y + 0.2 || p.pos.y > top + 0.05) continue;
      const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z;
      const c = Math.cos(e.yaw || 0), s = Math.sin(e.yaw || 0);
      const lx = dx * c - dz * s, lz = dx * s + dz * c; // in the car's frame (z = its nose)
      const hx = bx + p.halfW, hz = bz + p.halfW;
      if (Math.abs(lx) >= hx || Math.abs(lz) >= hz) continue;
      // coming down onto the roof: stand on it
      if (p.pos.y > top - 0.6 && p.vel.y <= 0) {
        p.pos.y = top;
        p.vel.y = 0;
        p.onGround = true;
        continue;
      }
      // a giant (Titanor grown) just treads cars flat
      if (this.heroKit?.crushesCars) {
        e.driving = false;
        if (e.kind === 'car' && !(e.bumpCd > performance.now())) {
          e.bumpCd = performance.now() + 500;
          e.damage(150, { type: 'impact', source: p }); // flattened
          e.dent = 1;
          this.audio.play('crunch', e.pos);
          this.rig.shake = Math.max(this.rig.shake, 0.35);
          this.effects.debris(e.centerInto(new THREE.Vector3()), 0x9aa0a6, 10, 6);
        }
        continue;
      }
      // push out along whichever side is nearer
      const px = hx - Math.abs(lx), pz = hz - Math.abs(lz);
      let nx, nz, pen;
      if (px < pz) {
        const sx = Math.sign(lx) || 1;
        nx = c * sx;
        nz = -s * sx;
        pen = px;
      } else {
        const sz = Math.sign(lz) || 1;
        nx = s * sz;
        nz = c * sz;
        pen = pz;
      }
      const into = -(p.vel.x * nx + p.vel.z * nz); // speed heading into the car
      if (strong) {
        // shove it: the car takes most of the push (and a dent if it was a real hit)
        e.driving = false;
        // the car moves off at least as fast as he's walking into it
        const vn = -(e.vel.x * nx + e.vel.z * nz);
        const want = Math.min(Math.max(into * 1.05, 2), 16); // a hard hit still only bowls it a few metres
        if (vn < want) {
          e.vel.x -= nx * (want - vn);
          e.vel.z -= nz * (want - vn);
        }
        if (into > 14 && e.kind === 'car' && !(e.bumpCd > performance.now())) {
          e.bumpCd = performance.now() + 400;
          e.damage(into * 1.2, { type: 'impact', source: p });
          this.audio.play('crunch', e.pos);
          this.rig.shake = Math.max(this.rig.shake, Math.min(0.5, into / 60));
        }
        p.pos.x += nx * pen * 0.5;
        p.pos.z += nz * pen * 0.5;
        if (into > 0) {
          p.vel.x += nx * into * 0.5;
          p.vel.z += nz * into * 0.5;
        }
      } else {
        // bump off it like a wall
        p.pos.x += nx * pen;
        p.pos.z += nz * pen;
        if (into > 0) {
          p.vel.x += nx * into;
          p.vel.z += nz * into;
        }
      }
    }
  }

  /** Free Roam only: swap heroes on the spot (from the pause menu), keeping your place in the city. */
  switchHero(id) {
    if (!this.mode || this.mode instanceof MissionRun || id === this.heroId) return;
    if (this.driving.active) this.driving.exit();
    if (this.abilities.carry.held) this.abilities.carry.drop();
    this.abilities.laser.hide();
    this.abilities.breath.stop();
    const p = this.player;
    const wasFlying = p.flying;
    this.setHero(id);
    // keep flying if the new hero can, otherwise drop out of the sky
    p.flying = wasFlying && this.allowed('fly');
    p.vel.set(0, Math.min(p.vel.y, 0), 0);
    this.effects.confetti(p.pos.clone().setY(p.pos.y + 1), 20);
    this.hud.hintTimer = 14;
    this.hud.hint.classList.remove('fade');
    this.hud.toast(`Now playing ${heroById(id).name}`, 'good', 2);
  }

  /** Lock powers (tutorial). names: array of 'jump'|'fly'|'boost'|'punch'|'laser'|'breath'|'senses'|'carry' */
  lockPowers(names) {
    this.locks = new Set(names);
    this.hud.setLocks(this.locks);
  }

  unlockPowers(names, announce = true) {
    const LABELS = { jump: 'Jump (Space)', fly: 'Flight (F)', boost: 'Super speed (Shift)', punch: 'Super punch (LMB)', laser: 'Laser eyes (RMB)', breath: 'Super breath (Q)', senses: 'Super senses (E)', carry: 'Carry (G)' };
    for (const n of names) {
      if (!this.locks.delete(n)) continue;
      if (announce) this.hud.toast(`New power unlocked: ${LABELS[n] || n}`, 'good', 3.5);
    }
    this.hud.setLocks(this.locks);
    if (announce) this.audio.play('objective');
  }

  hitStop(t) {
    this.hitStopTime = Math.max(this.hitStopTime, t);
  }

  addDanger(pos, radius, ttl = 1) {
    if (this.dangers.length > 60) return;
    this.dangers.push({ pos: pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z), radius, ttl });
  }

  hurtPlayer(amount, fromPos, type) {
    if (this.state !== 'playing' || this.koTimer > 0) return;
    // Aegis is tough: enemies only do part of their listed damage
    if (type === 'fire' && this.heroKit?.fireproof) return;
    const dealt = this.meters.hurt(amount * 0.4 * (this.heroKit?.damageMul ?? 1));
    if (dealt <= 0) return;
    this.hud.damaged(dealt);
    if (type !== 'fire' || Math.random() < 0.1) this.audio.play('hurt');
    if (dealt > 6) this.rig.shake = Math.max(this.rig.shake, Math.min(0.6, dealt / 30));
    if (this.meters.dead) {
      this.abilities.reset();
      this.mode?.onPlayerDefeated();
    }
  }

  /** Area damage + knockback + visuals. hurtsHero: whether the hero takes damage too. */
  explode(pos, radius, damage, source, hurtsHero = false) {
    this.effects.explosion(pos, Math.max(0.6, radius / 4));
    this.audio.play('explosion', pos);
    const d = this.player.pos.distanceTo(pos);
    this.rig.shake = Math.max(this.rig.shake, Math.max(0, 0.8 - d / 50));
    this.addDanger(pos, radius * 5, 3);
    if (damage <= 0) return;
    for (const e of this.entities.query(pos, radius + 1, (x) => x !== source && !x.carried)) {
      const c = e.centerInto(tmpV);
      const k = 1 - Math.min(1, c.distanceTo(pos) / (radius + 1));
      const dir = c.clone().sub(pos).normalize();
      e.damage(damage * k, { type: 'explosion', knock: dir.multiplyScalar(12 * k).setY(6 * k) });
    }
    if (hurtsHero && d < radius + 1) this.hurtPlayer(damage * (1 - d / (radius + 1)), pos, 'explosion');
    // shatter windows nearby
    const w = this.world;
    const r = Math.min(3, Math.floor(radius / 2));
    for (let y = -r; y <= r; y++) {
      for (let z = -r; z <= r; z++) {
        for (let x = -r; x <= r; x++) {
          const bx = Math.floor(pos.x) + x, by = Math.floor(pos.y) + y, bz = Math.floor(pos.z) + z;
          const b = w.get(bx, by, bz);
          if ((b >= B.GLASS_BLUE && b <= B.GLASS_DARK) || b === B.DOOR) w.edit(bx, by, bz, B.AIR);
        }
      }
    }
  }

  /** A long fall ends in a superhero landing: a thud, a little crater, a small shove. */
  heroLanding(speed) {
    const p = this.player.pos;
    const k = Math.min(1, (speed - 30) / 70); // 0 at a modest drop, 1 at terminal velocity
    this.audio.play('land');
    this.rig.shake = Math.max(this.rig.shake, 0.25 + k * 0.3);
    this.effects.dust(tmpV.set(p.x, p.y + 0.1, p.z), 22, 1.8);
    this.effects.shockwave(tmpV.set(p.x, p.y + 0.15, p.z), 2.5 + k * 1.5);
    this.addDanger(p, 8, 1);
    // cracks in the pavement right under the impact
    const w = this.world;
    const x = Math.floor(p.x), y = Math.floor(p.y - 0.5), z = Math.floor(p.z);
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (dx || dz ? Math.random() < 0.5 : true) {
        const b = w.get(x + dx, y, z + dz);
        if (SOLID[b] && !LASER_PROOF.has(b) && b !== B.WATER && b !== B.ICE) w.edit(x + dx, y, z + dz, B.SCORCH);
      }
    }
    // small area hit, only right next to him
    const r = 3.2;
    for (const e of this.entities.query(tmpV.set(p.x, p.y + 0.5, p.z), r, (x) => !x.carried && x.alive)) {
      const c = e.centerInto(new THREE.Vector3());
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > r) continue;
      const f = 1 - d / r;
      const dir = new THREE.Vector3(c.x - p.x, 0, c.z - p.z).normalize();
      const dealt = e.damage((8 + 10 * k) * (0.5 + f * 0.5), { type: 'impact', knock: dir.multiplyScalar(6 * f * Math.max(1, e.mass)).setY(4 * f * Math.max(1, e.mass)), source: this.player });
      if (dealt > 0) this.markers.damageNumber(c, dealt, '#ffd34d');
    }
  }

  sonicBoom() {
    this.flightFX.sonicBoom(this.player);
    this.rig.shake = 1;
    this.rig.fovPunch = 14;
    this.hud.flash(0.45);
    this.audio.sonicBoom();
    this.addDanger(this.player.pos, 25, 2);
  }

  placeHero(x, y, z, yaw) {
    const p = this.player;
    p.spawn(x, y, z, yaw);
    p.unstick();
    const ground = this.world.surfaceY(Math.floor(x), Math.floor(z));
    p.flying = p.pos.y > ground + 3;
    this.rig.yaw = yaw;
    this.rig.pitch = -0.12;
    this.rig.focusY = null;
  }

  /** Free-roam knock-out: brief overlay, then recover. */
  knockout(msg, then) {
    this.koTimer = 3;
    this.koThen = then;
    this.hud.flash(0.7, '#400000');
    this.hud.toast(msg, 'warn', 3);
  }

  // ---------- modes and states ----------

  resetSession() {
    this.driving.reset();
    this.abilities.reset();
    this.entities.clear();
    this.projectiles.clear();
    this.fires.clear();
    this.zones.clear();
    this.flightFX.clear();
    this.markers.clear();
    this.hud.reset();
    this.meters.reset();
    this.propCells.clear();
    this.dangers.length = 0;
    this.world.revertEdits();
    this.audio.stopAll();
    this.koTimer = 0;
    this.cutscene = null;
    this.hitStopTime = 0;
    this.lockPowers([]);
    this.beacon.visible = false;
  }

  startMode(mode) {
    this.mode?.end();
    this.resetSession();
    this.mode = mode;
    this.setHero(mode instanceof MissionRun ? 'sky' : this.settings.hero);
    if (!(mode instanceof MissionRun)) this.setTimeOfDay(0.36);
    mode.start();
    this.hero.setVisible(!this.settings.firstPerson);
    this.hud.hintTimer = 14;
    this.hud.hint.classList.remove('fade');
    // populate around the hero straight away
    const pop = mode.population === true ? 1 : mode.population || 0;
    this.crowd.target = Math.round(40 * pop);
    this.traffic.target = Math.round(22 * pop);
    if (pop > 0) {
      for (let i = 0; i < 24 * pop; i++) this.crowd.spawnNear(this.player.pos.x, this.player.pos.z, 8, 90);
      for (let i = 0; i < 12 * pop; i++) this.traffic.spawnNear(this.player.pos.x, this.player.pos.z, 20, 120);
    }
    this.resume();
  }

  startFreeRoam() {
    this.startMode(new FreeRoam(this));
  }

  startMission(index) {
    this.currentMission = index;
    this.startMode(new MissionRun(this, MISSIONS[index], index));
  }

  missionComplete(run, result) {
    const finale = run.def.finale;
    if (finale) {
      // victory cutscene: orbit the hero while the city cheers
      for (const e of this.entities.list) if (e.kind === 'civilian' && e.alive) e.cheer(8);
      for (const e of this.entities.list) if (e.team === 'enemy' && e.alive && e.kind !== 'tyrant') e.damage(9999, { type: 'explosion' });
      this.cutscene = { t: 0, dur: 9, result, run };
      this.hud.toast('BRIGHTPORT IS SAVED!', 'good', 8);
      this.audio.melody([[0, 1], [4, 1], [7, 1], [12, 2], [7, 1], [12, 4]], { bpm: 300 });
      return;
    }
    this.audio.melody([[0, 1], [4, 1], [7, 1], [12, 3]], { bpm: 420 });
    setTimeout(() => this.showResult(run, result), 1200);
  }

  showResult(run, result) {
    if (!(this.mode === run)) return;
    this.state = 'result';
    this.input.enabled = false;
    this.input.unlock();
    this.abilities.reset();
    this.audio.stopAll();
    this.menus.showResult(run, result);
  }

  missionFailed(run, reason) {
    this.audio.melody([[0, 1], [-2, 1], [-5, 1], [-12, 3]], { bpm: 300, type: 'triangle' });
    setTimeout(() => {
      if (this.mode !== run) return;
      this.state = 'result';
      this.input.enabled = false;
      this.input.unlock();
      this.abilities.reset();
      this.audio.stopAll();
      this.menus.showFail(run, reason);
    }, 900);
  }

  resume() {
    this.state = 'playing';
    this.menus.hide();
    this.hud.show(true);
    this.input.enabled = true;
    this.input.consumeMouse();
    this.input.lock();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.enabled = false;
    this.input.unlock();
    this.audio.stopAll();
    this.abilities.laser.hide();
    this.abilities.breath.stop();
    document.body.classList.remove('unlocked');
    this.menus.showPause(this.mode?.pauseInfo?.() || '');
  }

  quitToMenu() {
    this.fpArms.group.visible = false;
    this.mode?.end();
    this.mode = null;
    this.resetSession();
    this.state = 'menu';
    this.input.enabled = false;
    this.input.unlock();
    this.hud.show(false);
    this.hero.setVisible(false);
    this.setTimeOfDay(0.36);
    this.menus.showMain();
  }

  get progress() {
    return loadProgress();
  }

  // ---------- frame ----------

  frame(dt) {
    const cam = this.camera;
    if (this.state === 'playing') this.autoResolution(dt);
    document.body.classList.toggle('in-play', this.state === 'playing');
    let focus;

    if (this.state === 'playing') {
      focus = this.playFrame(dt);
    } else if (this.state === 'menu') {
      // slow orbit over downtown behind the menu
      this.menuTime += dt;
      const a = this.menuTime * 0.05;
      const cx = 240, cz = 150;
      cam.position.set(cx + Math.cos(a) * 185, 105, cz + Math.sin(a) * 185);
      cam.fov = 60;
      cam.updateProjectionMatrix();
      cam.lookAt(cx, 45, cz);
      focus = tmpV.set(cx, 30, cz);
    } else {
      focus = this.player.pos;
    }

    this.sky.update(dt, cam, focus);
    if (this.sky.cycle) this.chunks.setNight(this.sky.night);
    this.updateUnderwater(cam);
    this.chunks.update(cam.position, this.settings.renderDistance);
    const drawDist = Math.min(this.settings.renderDistance, 200);
    this.humanoids.update(this.entities.list, cam.position, drawDist);
    this.boxes.update(this.entities.list, cam.position, drawDist);
    this.renderer.render(this.scene, cam);
    this.input.endFrame();
  }

  playFrame(realDt) {
    const input = this.input;
    const cam = this.camera;
    document.body.classList.toggle('unlocked', !input.locked);
    const [dx, dy] = input.consumeMouse();
    // how long since the player last pressed anything or moved the mouse (tutorial hints)
    this.idleTime = input.held.size || Math.abs(dx) + Math.abs(dy) > 2 ? 0 : (this.idleTime || 0) + realDt;
    // Flux's alien wheel takes the mouse while it's open
    if (!this.cutscene && !this.heroKit?.wheelOpen) this.rig.look(dx, dy);
    this.heroKit?.wheelMouse?.(dx, dy);
    if (input.pressed('camera')) {
      const m = (this.settings.cameraMode + 1) % 4;
      this.settings.set('cameraMode', m);
      this.hud.toast(['Camera: close', 'Camera: medium', 'Camera: far', 'Camera: first person'][m], 'info', 1);
    }
    if (input.pressed('debug')) this.hud.toggleDebug();
    if (input.pressed('pause') && !input.locked) {
      input.endFrame();
      this.pause();
      return this.player.pos;
    }

    // hit-stop freezes gameplay for a few frames on big punches
    let dt = realDt;
    if (this.hitStopTime > 0) {
      this.hitStopTime -= realDt;
      dt = realDt * 0.05;
    }
    if (this.heroKit?.wheelOpen) dt *= 0.3; // time slows while choosing an alien
    this.time += dt;

    const p = this.player;
    const ko = this.koTimer > 0;
    if (ko) {
      this.koTimer -= realDt;
      if (this.koTimer <= 0) this.koThen?.();
    }
    const canAct = !ko && !this.cutscene;
    p.firstPerson = this.settings.firstPerson;
    const drv = this.driving;
    // R next to a car (Free Roam): steal it
    if (canAct && !drv.active && input.pressed('enter')) {
      const car = drv.findCar();
      if (car) drv.enter(car);
    }
    if (drv.active) {
      drv.update(dt, canAct ? input : NO_INPUT, Math.abs(dx) + Math.abs(dy));
      if (drv.active && ko) drv.exit();
    } else {
      // a hero kit can take over movement for the frame (Tether swinging on a web)
      const kitMoved = this.heroKit?.drives?.(dt, canAct ? input : NO_INPUT, canAct);
      if (!kitMoved) p.update(dt, canAct ? input : NO_INPUT, this.rig.yaw, this.rig.pitch);
      if (p.boosting) this.meters.drainSpeed(dt);
      else if (p.sprinting) this.meters.drainSpeed(dt * 0.6); // running is cheaper than flying
      this.heroKit?.update(dt, canAct ? input : NO_INPUT, canAct);
      this.collideVehicles();
    }
    this.abilities.update(dt, input, canAct && !drv.active);
    this.meters.update(dt);

    this.markers.beginPins();
    this.mode?.update(dt);
    if (this.mode?.population) {
      this.crowd.update(dt, p.pos);
      this.traffic.update(dt, p.pos);
      this.updateProps(dt);
    }
    this.entities.update(dt, p.pos);
    this.projectiles.update(dt);
    this.fires.update(dt, cam.position);
    this.zones.update(dt);
    this.abilities.senses.pins();
    this.markers.endPins();
    this.updateBeacon();
    this.updatePickupPrompt();
    for (let i = this.dangers.length - 1; i >= 0; i--) if ((this.dangers[i].ttl -= dt) <= 0) this.dangers.splice(i, 1);

    // hero model
    const held = this.abilities.carry.held;
    this.hero.setVisible((!this.settings.firstPerson || !!this.cutscene) && !drv.active);
    this.hero.update(dt, {
      pos: p.pos,
      yaw: p.yaw,
      mode: p.mode,
      speed: p.vel.length(),
      hSpeed: Math.hypot(p.vel.x, p.vel.z),
      vx: p.vel.x,
      vz: p.vel.z,
      vy: p.vel.y,
      boost: p.boosting || !!this.heroKit?.boosting,
      supersonic: p.supersonic,
      carrying: !!held,
      carryHeavy: held?.carryHeavy,
      laser: this.abilities.laser.active,
      dive: p.diving ? Math.min(1, (-p.vel.y - 16) / 40) : 0,
      flare: p.flare,
      landT: p.landT,
      charge: this.heroKit?.charge ?? 0,
      clapT: this.heroKit?.clapT ?? 9,
      smashT: this.heroKit?.smashT ?? 9,
      diveSmash: this.heroKit?.diveSmash,
      swing: this.heroKit?.swinging,
      swingSide: this.heroKit?.side,
      swingVariant: this.heroKit?.swingVariant,
      webOut: this.heroKit?.swinging ? Math.min(1, this.heroKit.webT / this.heroKit.webTravel) : 1,
      trick: this.heroKit?.trick,
      skydive: this.heroKit?.skydive,
      ropeTilt: this.heroKit?.ropeTilt,
      ropeRoll: this.heroKit?.ropeRoll,
      zip: !!this.heroKit?.zip,
      climb: this.heroKit?.climbing,
      shotT: this.heroKit?.shotT ?? 9,
      shootArm: this.heroId === 'forge' && this.heroKit.shootT < 2 ? 'B' : null, // both hands stay up on target until 2 s after the last shot
      aimPitch: this.rig.pitch,
      unibeam: this.heroId === 'forge' ? this.heroKit.uni : 0,
      podT: this.heroId === 'forge' ? this.heroKit.podT : 9,
      special: this.heroId === 'flux' ? this.heroKit.special : 9,
      held: this.heroId === 'flux' && this.heroKit.held,
      swimming: this.heroId === 'flux' && this.heroKit.swimming,
      climbing: this.heroId === 'flux' && !!this.heroKit.climb,
      warn: this.heroId === 'flux' && this.heroKit.form !== 'human' && this.heroKit.prism < 20,
      recharging: this.heroId === 'flux' && this.heroKit.recharging,
      alien: this.heroId === 'flux' ? this.heroKit.alien : null,
      wading: p.wading,
    });

    if (this.cutscene) this.updateCutscene(realDt);
    else if (drv.active) this.rig.updateVehicle(realDt, drv.car, drv.lookIdle);
    else this.rig.update(realDt, p);
    this.fpArms.update(realDt, {
      visible: this.settings.firstPerson && !this.cutscene && this.state === 'playing' && !drv.active,
      speed: p.vel.length(),
      onGround: p.onGround,
      flying: p.flying,
      punchT: this.hero.punchT,
      punchCombo: this.hero.punchCombo,
      carrying: !!held,
      breath: this.abilities.breath.active,
    });
    this.flightFX.update(dt, p);
    if (this.flightFX.shake) {
      this.rig.shake = Math.max(this.rig.shake, this.flightFX.shake);
      this.flightFX.shake = 0;
    }
    this.particles.update(dt, cam, this.renderer.domElement.height);
    this.rings.update(dt);

    // audio
    const speed = p.vel.length();
    this.audio.setLoopLevel('wind', p.flying || p.sprinting || this.heroKit?.alien?.rolling ? Math.min(1, Math.max(0, (speed - 6) / 60)) : 0, 0.15);
    // quiet city in the background, fading as you climb above the rooftops
    const alt = Math.max(0, p.pos.y - CITY.G);
    const cityLevel = Math.max(0.15, 1 - alt / 140) * (this.mode?.population ? 1 : 0.5);
    this.audio.setLoopLevel('city', cityLevel, 0.8);
    this.carPassTimer = (this.carPassTimer ?? 4) - realDt;
    if (this.carPassTimer <= 0) {
      this.carPassTimer = 5 + Math.random() * 8;
      if (alt < 40 && this.mode?.population) this.audio.play('carPass');
    }

    // HUD
    cam.updateMatrixWorld();
    this.abilities.laser.place();
    this.heroKit?.place?.();
    this.markers.update(realDt, p.pos);
    this.abilities.lockOn.updateMarker();
    this.markers.setBrackets(this.droneTargets());
    this.hud.setGuide(this.guideTarget(), this.rig.yaw, p.pos);
    const mk = [...(this.mode?.markers?.() || [])];
    for (const e of this.entities.list) {
      if (e.removed || !e.alive) continue;
      const d2 = (e.pos.x - p.pos.x) ** 2 + (e.pos.z - p.pos.z) ** 2;
      if (e.senseLabel && this.abilities.senses.active) mk.push({ x: e.pos.x, z: e.pos.z, color: '#ff7ad9', shape: 'diamond', size: 6, edge: true });
      if (d2 > (this.abilities.senses.active ? 170 * 170 : 95 * 95)) continue;
      if (e.team === 'enemy' && e.kind !== 'dummy') mk.push({ x: e.pos.x, z: e.pos.z, color: '#ff4d4d', size: e.boss ? 5 : 3 });
      else if (e.kind === 'civilian' && e.inDanger) mk.push({ x: e.pos.x, z: e.pos.z, color: '#ffd34d', size: 2.5 });
    }
    // super senses widen the radar so distant trouble shows up
    this.minimap.range = this.abilities.senses.active ? 170 : 90;
    this.minimap.draw(p.pos.x, p.pos.z, this.rig.yaw, mk);
    const boss = this.entities.nearest(p.pos, 150, (e) => e.boss && e.alive);
    this.hud.setBoss(boss ? boss.bossName : null, boss ? boss.health / boss.maxHealth : 0, boss?.shieldBar?.() ?? null);
    this.hud.update(realDt, this, {
      fps: this.loop.fps,
      chunks: this.chunks.visibleCount,
      calls: this.renderer.info.render.calls,
      tris: this.renderer.info.render.triangles,
      entities: this.entities.list.length,
      particles: this.particles.count,
    });
    return p.pos;
  }

  /** Hostile drones worth bracketing: part of an emergency or mission, nearby, not already locked on. */
  droneTargets() {
    const out = this.tmpDrones || (this.tmpDrones = []);
    out.length = 0;
    if (this.cutscene) return out;
    const p = this.player.pos;
    const locked = this.abilities.lockOn.target;
    for (const e of this.entities.list) {
      if (e.kind !== 'drone' || e.removed || !e.alive || e === locked || !e.persistent) continue;
      if (e.pos.distanceToSquared(p) > 140 * 140) continue;
      out.push({ pos: e.centerInto(new THREE.Vector3()), size: 1.6 });
    }
    return out;
  }

  /** What the red guide arrow at the top of the screen points at: the main objective. */
  guideTarget() {
    if (this.cutscene) return null;
    const t = this.mode?.guidePos?.() || this.mode?.beaconPos?.();
    if (t) return t;
    const boss = this.entities.nearest(this.player.pos, 800, (e) => e.boss && e.alive);
    return boss ? boss.pos : null;
  }

  /** "Press G to pick up ..." when standing next to something worth carrying (missions). */
  updatePickupPrompt() {
    if (this.mode instanceof FreeRoam) return; // Free Roam uses the prompt for the Tyrant circle
    if (this.abilities.carry.held || !this.allowed('carry')) {
      this.hud.setPrompt(null);
      return;
    }
    const p = this.player.pos;
    const e = this.entities.nearest((this.tmpProbe ||= new THREE.Vector3()).set(p.x, p.y + 1, p.z), 3.6, (x) => x.carryable && !x.carried && !x.saved && x.persistent && (this.mode?.isCarryTarget ? this.mode.isCarryTarget(x) : x.tags.size > 0) && (x.alive || x.kind === 'car'));
    if (e) this.hud.setPrompt(`Press <b>G</b> to pick up ${e.carryLabel || 'it'}`);
    else this.hud.setPrompt(null);
  }

  /** Light pillar over the mode's main target (objective, event or sensed target). */
  updateBeacon() {
    const pos = this.abilities.senses.beaconTarget() || this.mode?.beaconPos?.();
    this.beacon.visible = !!pos && !this.cutscene;
    if (!pos) return;
    this.beacon.position.set(pos.x, pos.y - 1, pos.z);
    const t = performance.now() / 1000;
    this.beacon.material.opacity = 0.28 + Math.sin(t * 4) * 0.1;
    this.beacon.material.color.set(this.abilities.senses.beaconTarget() ? 0xff7ad9 : 0xffd34d);
  }

  /** Street props appear around the hero (and are cleaned up behind). */
  updateProps(dt) {
    this.propTimer -= dt;
    if (this.propTimer > 0) return;
    this.propTimer = 1.5;
    const p = this.player.pos;
    for (const e of this.entities.list) {
      if (e.kind !== 'prop' || e.removed || e.persistent || e.carried) continue;
      if (Math.hypot(e.pos.x - p.x, e.pos.z - p.z) > 120) {
        e.remove();
        if (e.cellKey != null) this.propCells.delete(e.cellKey);
      }
    }
    for (const prop of scatterProps(this, p.x, p.z, 80, this.propCells)) this.entities.add(prop);
  }

  updateCutscene(dt) {
    const c = this.cutscene;
    c.t += dt;
    const p = this.player;
    const a = c.t * 0.35;
    const cam = this.camera;
    cam.position.set(p.pos.x + Math.cos(a) * 9, p.pos.y + 3 + c.t * 0.4, p.pos.z + Math.sin(a) * 9);
    cam.fov = 55;
    cam.updateProjectionMatrix();
    cam.lookAt(p.pos.x, p.pos.y + 1.5, p.pos.z);
    if (Math.random() < dt * 3) this.effects.confetti(p.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 20, 4, (Math.random() - 0.5) * 20)), 25);
    if (c.t > c.dur) {
      this.cutscene = null;
      this.state = 'result';
      this.input.enabled = false;
      this.input.unlock();
      this.audio.stopAll();
      this.menus.showVictory(c.run, c.result);
    }
  }
}

const NO_INPUT = { isDown: () => false, pressed: () => false };
