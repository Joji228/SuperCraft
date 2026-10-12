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
    this.hero = new HeroModel();
    this.hero.setVisible(false);
    this.scene.add(this.hero.root);
    this.rig = new CameraRig(this.camera, this.world, this.settings);
    this.scene.add(this.camera); // so the first-person arms (children of the camera) render
    this.fpArms = new FirstPersonArms(this.camera);
    this.particles = new Particles(this.scene, 7000);
    this.effects = new Effects(this.particles);
    this.flightFX = new FlightFX(this.scene, this.particles, this.world);
    this.applySkin(this.settings.skin);
    this.player.onSonicBoom = () => this.sonicBoom();
    this.player.onHeroLanding = (speed) => this.heroLanding(speed);
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
    this.abilities = new Abilities(this);
    this.driving = new Driving(this);
    this.crowd = new Crowd(this);
    this.traffic = new Traffic(this);
    this.minimap = new Minimap(this.hud.minimapCanvas, this.world);
    this.audio.listener = this.player.pos;

    for (const k of ['renderDistance', 'shadows', 'dayNight']) this.applySetting(k, this.settings[k]);

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

  // ---------- shared gameplay services ----------

  allowed(name) {
    return !this.locks.has(name);
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
    const dealt = this.meters.hurt(amount * 0.4);
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
    if (!this.cutscene) this.rig.look(dx, dy);
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
      p.update(dt, canAct ? input : NO_INPUT, this.rig.yaw, this.rig.pitch);
      if (p.boosting) this.meters.drainSpeed(dt);
      else if (p.sprinting) this.meters.drainSpeed(dt * 0.6); // running is cheaper than flying
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
      boost: p.boosting,
      supersonic: p.supersonic,
      carrying: !!held,
      carryHeavy: held?.carryHeavy,
      laser: this.abilities.laser.active,
      dive: p.diving ? Math.min(1, (-p.vel.y - 16) / 40) : 0,
      flare: p.flare,
      landT: p.landT,
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

    // audio
    const speed = p.vel.length();
    this.audio.setLoopLevel('wind', p.flying || p.sprinting ? Math.min(1, Math.max(0, (speed - 6) / 60)) : 0, 0.15);
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
