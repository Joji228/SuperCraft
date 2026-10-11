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
import { B } from '../world/Blocks.js';
import { ChunkRenderer } from '../world/ChunkRenderer.js';
import { Sky } from '../world/Sky.js';
import { Fires } from '../world/Fires.js';
import { Zones } from '../world/Zones.js';
import { Player } from '../player/Player.js';
import { HeroModel } from '../player/HeroModel.js';
import { CameraRig } from '../player/CameraRig.js';
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
    this.player = new Player(this.world);
    this.hero = new HeroModel();
    this.hero.setVisible(false);
    this.scene.add(this.hero.root);
    this.rig = new CameraRig(this.camera, this.world, this.settings);
    this.particles = new Particles(this.scene, 7000);
    this.effects = new Effects(this.particles);
    this.flightFX = new FlightFX(this.scene, this.particles, this.world);
    this.player.onSonicBoom = () => this.sonicBoom();
    this.meters = new Meters();
    this.entities = new Entities(this);
    this.humanoids = new HumanoidRenderer(this.scene);
    this.boxes = new BoxRenderer(this.scene);
    this.projectiles = new Projectiles(this);
    this.fires = new Fires(this);
    this.zones = new Zones(this);
    this.abilities = new Abilities(this);
    this.crowd = new Crowd(this);
    this.traffic = new Traffic(this);
    this.minimap = new Minimap(this.hud.minimapCanvas, this.world);
    this.audio.listener = this.player.pos;

    for (const k of ['renderDistance', 'shadows', 'dayNight']) this.applySetting(k, this.settings[k]);

    this.state = 'menu';
    this.menus.showMain();
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
      case 'dayNight':
        if (!this.sky) break;
        this.sky.cycle = value;
        if (!value) this.setTimeOfDay(this.baseTime ?? 0.36);
        break;
    }
  }

  setTimeOfDay(t) {
    this.baseTime = t;
    this.sky.time = t;
    this.sky.apply();
    this.chunks.setNight(this.sky.night);
  }

  // ---------- shared gameplay services ----------

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
    const dealt = this.meters.hurt(amount * 0.6);
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
    if (mode.population) {
      for (let i = 0; i < 24; i++) this.crowd.spawnNear(this.player.pos.x, this.player.pos.z, 8, 90);
      for (let i = 0; i < 12; i++) this.traffic.spawnNear(this.player.pos.x, this.player.pos.z, 20, 120);
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
    if (!this.cutscene) this.rig.look(dx, dy);
    if (input.pressed('camera')) this.settings.set('firstPerson', !this.settings.firstPerson);
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
    p.update(dt, canAct ? input : NO_INPUT, this.rig.yaw, this.rig.pitch);
    this.abilities.update(dt, input, canAct);
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
    this.markers.endPins();
    for (let i = this.dangers.length - 1; i >= 0; i--) if ((this.dangers[i].ttl -= dt) <= 0) this.dangers.splice(i, 1);

    // hero model
    const held = this.abilities.carry.held;
    this.hero.setVisible(!this.settings.firstPerson || !!this.cutscene);
    this.hero.update(dt, {
      pos: p.pos,
      yaw: p.yaw,
      mode: p.mode,
      speed: p.vel.length(),
      hSpeed: Math.hypot(p.vel.x, p.vel.z),
      vy: p.vel.y,
      boost: p.boosting,
      carrying: !!held,
      carryHeavy: held?.carryHeavy,
      laser: this.abilities.laser.active,
    });

    if (this.cutscene) this.updateCutscene(realDt);
    else this.rig.update(realDt, p);
    this.flightFX.update(dt, p);
    if (this.flightFX.shake) {
      this.rig.shake = Math.max(this.rig.shake, this.flightFX.shake);
      this.flightFX.shake = 0;
    }
    this.particles.update(dt, cam, this.renderer.domElement.height);

    // audio
    const speed = p.vel.length();
    this.audio.setLoopLevel('wind', p.flying ? Math.min(1, Math.max(0, (speed - 6) / 60)) : 0, 0.15);

    // HUD
    this.markers.update(realDt, p.pos);
    const mk = [...(this.mode?.markers?.() || [])];
    for (const e of this.entities.list) {
      if (e.removed || !e.alive) continue;
      const d2 = (e.pos.x - p.pos.x) ** 2 + (e.pos.z - p.pos.z) ** 2;
      if (d2 > (this.abilities.senses.active ? 170 * 170 : 95 * 95)) continue;
      if (e.team === 'enemy' && e.kind !== 'dummy') mk.push({ x: e.pos.x, z: e.pos.z, color: '#ff4d4d', size: e.boss ? 5 : 3 });
      else if (e.kind === 'civilian' && e.inDanger) mk.push({ x: e.pos.x, z: e.pos.z, color: '#ffd34d', size: 2.5 });
    }
    // super senses widen the radar so distant trouble shows up
    this.minimap.range = this.abilities.senses.active ? 170 : 90;
    this.minimap.draw(p.pos.x, p.pos.z, this.rig.yaw, mk);
    const boss = this.entities.nearest(p.pos, 150, (e) => e.boss && e.alive);
    this.hud.setBoss(boss ? boss.bossName : null, boss ? boss.health / boss.maxHealth : 0);
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
