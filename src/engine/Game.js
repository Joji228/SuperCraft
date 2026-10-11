// Top-level game object: owns the systems and switches between menu / playing / paused.
import * as THREE from 'three';
import { createRenderer } from './Renderer.js';
import { Loop } from './Loop.js';
import { Settings } from './Settings.js';
import { Input } from '../input/Input.js';
import { World } from '../world/World.js';
import { generateCity, spawnPoint } from '../world/CityGenerator.js';
import { createAtlas } from '../world/Textures.js';
import { ChunkRenderer } from '../world/ChunkRenderer.js';
import { Sky } from '../world/Sky.js';
import { Player } from '../player/Player.js';
import { HeroModel } from '../player/HeroModel.js';
import { CameraRig } from '../player/CameraRig.js';
import { HUD } from '../ui/HUD.js';
import { Menus } from '../ui/Menus.js';

// a short timeout (not rAF) so loading also progresses in background tabs
const nextFrame = () => new Promise((r) => setTimeout(r, 20));

export class Game {
  constructor() {
    this.state = 'loading';
    this.settings = new Settings();
    const { renderer, camera } = createRenderer(document.getElementById('game'));
    this.renderer = renderer;
    this.camera = camera;
    this.scene = new THREE.Scene();
    this.input = new Input(renderer.domElement);
    this.hud = new HUD(document.getElementById('hud'), document.getElementById('fx'));
    this.menus = new Menus(document.getElementById('ui'), this.settings, {
      startFreeRoam: () => this.startFreeRoam(),
      resume: () => this.resume(),
      quitToMenu: () => this.quitToMenu(),
    });
    this.loop = new Loop((dt) => this.frame(dt));
    this.menuTime = 0;

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
    await this.chunks.buildAll((p) => this.menus.setProgress(0.05 + p * 0.95));
    console.info(`[SuperCraft] city generated in ${tGen.toFixed(0)} ms, meshed in ${(performance.now() - t0 - tGen).toFixed(0)} ms`);

    this.sky = new Sky(this.scene);
    this.player = new Player(this.world);
    this.hero = new HeroModel();
    this.hero.setVisible(false);
    this.scene.add(this.hero.root);
    this.rig = new CameraRig(this.camera, this.world, this.settings);

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
        if (!value) {
          this.sky.time = 0.36;
          this.sky.apply();
        }
        break;
    }
  }

  startFreeRoam() {
    const s = spawnPoint();
    this.player.spawn(s.x, s.y, s.z, s.yaw);
    this.rig.yaw = s.yaw;
    this.rig.pitch = -0.12;
    this.rig.focusY = null;
    this.hero.setVisible(!this.settings.firstPerson);
    this.hud.hintTimer = 14;
    this.hud.hint.classList.remove('fade');
    this.resume();
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
    document.body.classList.remove('unlocked');
    this.menus.showPause();
  }

  quitToMenu() {
    this.state = 'menu';
    this.input.enabled = false;
    this.input.unlock();
    this.hud.show(false);
    this.hero.setVisible(false);
    this.menus.showMain();
  }

  frame(dt) {
    const cam = this.camera;
    let focus;

    if (this.state === 'playing') {
      const input = this.input;
      document.body.classList.toggle('unlocked', !input.locked);
      const [dx, dy] = input.consumeMouse();
      this.rig.look(dx, dy);
      if (input.pressed('camera')) this.settings.set('firstPerson', !this.settings.firstPerson);
      if (input.pressed('debug')) this.hud.toggleDebug();
      if (input.pressed('pause') && !input.locked) {
        input.endFrame();
        this.pause();
        return;
      }

      this.player.update(dt, input, this.rig.yaw, this.rig.pitch);
      const p = this.player;
      this.hero.setVisible(!this.settings.firstPerson);
      this.hero.update(dt, {
        pos: p.pos,
        yaw: p.yaw,
        mode: p.mode,
        speed: p.vel.length(),
        hSpeed: Math.hypot(p.vel.x, p.vel.z),
        vy: p.vel.y,
        boost: p.boosting,
      });
      this.rig.update(dt, p);
      focus = p.pos;
      this.hud.update(dt, p, {
        fps: this.loop.fps,
        chunks: this.chunks.visibleCount,
        calls: this.renderer.info.render.calls,
        tris: this.renderer.info.render.triangles,
      });
    } else if (this.state === 'menu') {
      // slow orbit over downtown behind the menu
      this.menuTime += dt;
      const a = this.menuTime * 0.05;
      const cx = 240, cz = 150;
      cam.position.set(cx + Math.cos(a) * 185, 105, cz + Math.sin(a) * 185);
      cam.fov = 60;
      cam.updateProjectionMatrix();
      cam.lookAt(cx, 45, cz);
      focus = new THREE.Vector3(cx, 30, cz);
    } else {
      focus = this.player.pos;
    }

    this.sky.update(dt, cam, focus);
    this.chunks.update(cam.position, this.settings.renderDistance);
    this.renderer.render(this.scene, cam);
    this.input.endFrame();
  }
}
