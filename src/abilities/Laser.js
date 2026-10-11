// Right mouse (hold): heat-vision beams from the eyes to the crosshair.
// Damages enemies, melts blocks, sets flammable things alight. Overheats if overused.
import * as THREE from 'three';
import { B, SOLID, LASER_PROOF, FLAMMABLE } from '../world/Blocks.js';
import { CITY } from '../world/CityGenerator.js';

const DPS = 60;
const HEAT_PER_SEC = 30;
const MELT_TIME = 0.32;

export class Laser {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.meltKey = '';
    this.meltTime = 0;
    this.fireTime = 0;

    const core = new THREE.MeshBasicMaterial({ color: 0xffe6e0, fog: false });
    const glow = new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.55, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
    this.beams = [];
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const c = new THREE.Mesh(geo, core);
      c.scale.set(0.035, 0.035, 1);
      const o = new THREE.Mesh(geo, glow);
      o.scale.set(0.13, 0.13, 1);
      g.add(c, o);
      g.visible = false;
      game.scene.add(g);
      this.beams.push(g);
    }
    this.light = new THREE.PointLight(0xff4020, 0, 10, 2);
    game.scene.add(this.light);
    this.eye = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
  }

  hide() {
    for (const b of this.beams) b.visible = false;
    this.light.intensity = 0;
    if (this.active) this.game.audio.stopLoop('laser');
    this.active = false;
  }

  update(dt, firing, aim) {
    const g = this.game;
    const m = g.meters;
    if (!firing || m.overheated || !m.addHeat(HEAT_PER_SEC * dt)) {
      if (firing && m.overheated && !this.warned) {
        g.audio.play('overheat');
        g.hud.toast('Laser overheated!', 'warn');
        this.warned = true;
      }
      if (!firing) this.warned = false;
      this.hide();
      return;
    }
    if (!this.active) g.audio.startLoop('laser');
    this.active = true;
    const p = g.player;
    p.aimTimer = 0.3;

    // beams start at the hero model's actual eyes (correct even when flying horizontally)
    const eyes = g.hero.eyes.children;
    const target = aim.point;
    for (let i = 0; i < 2; i++) {
      const b = this.beams[i];
      eyes[i].getWorldPosition(this.eye);
      const len = this.eye.distanceTo(target);
      b.position.copy(this.eye);
      b.lookAt(target);
      const flick = 1 + Math.sin(g.time * 60 + i) * 0.15;
      b.children[1].scale.set(0.13 * flick, 0.13 * flick, len);
      b.children[0].scale.z = len;
      b.visible = true;
    }
    this.light.position.copy(target).addScaledVector(aim.dir, -0.4);
    this.light.intensity = 6 + Math.random() * 3;

    // impact effects
    if (Math.random() < 0.6) g.effects.sparks(target, 2, aim.dir.clone().negate(), 0xff7a3a);
    if (Math.random() < 0.15) g.effects.smoke(target, 1, 0.3, 0.35);

    if (aim.entity) {
      const e = aim.entity;
      this.meltKey = '';
      const dealt = e.damage(DPS * dt, { type: 'laser', source: p });
      g.markers.accumulate(e, dealt, '#ff6a4a');
      if (dealt > 0) g.hud.hitMarker(false, true);
      return;
    }
    if (aim.block) this.burnBlock(aim.block, dt);
  }

  burnBlock(hit, dt) {
    const g = this.game;
    const key = `${hit.x},${hit.y},${hit.z}`;
    if (key !== this.meltKey) {
      this.meltKey = key;
      this.meltTime = 0;
      this.fireTime = 0;
    }
    this.meltTime += dt;
    this.fireTime += dt;
    const b = hit.block;
    // flammable things catch fire
    if (FLAMMABLE.has(b) && this.fireTime > 0.5) {
      this.fireTime = -2;
      g.fires.ignite(new THREE.Vector3(hit.x + 0.5 + hit.nx * 0.6, hit.y + 0.5 + hit.ny * 0.6, hit.z + 0.5 + hit.nz * 0.6), { intensity: 0.6, spread: true });
    }
    // melt anything above street level that isn't laser-proof
    if (this.meltTime >= MELT_TIME && hit.y >= CITY.G && !LASER_PROOF.has(b) && SOLID[b]) {
      this.meltTime = 0;
      g.world.edit(hit.x, hit.y, hit.z, B.AIR);
      const pos = new THREE.Vector3(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      g.effects.debris(pos, 0xff7a30, 10, 4);
      g.effects.smoke(pos, 3, 0.5, 0.25);
      g.audio.play('melt');
      // scorch the block behind so melted holes look burnt
      const bx = hit.x - hit.nx, by = hit.y - hit.ny, bz = hit.z - hit.nz;
      const behind = g.world.get(bx, by, bz);
      if (behind === B.INTERIOR) g.world.edit(bx, by, bz, B.SCORCH);
    } else if (this.meltTime >= MELT_TIME && hit.y < CITY.G && b !== B.WATER) {
      // the street just gets scorched
      if (b !== B.SCORCH && hit.y === CITY.G - 1) g.world.edit(hit.x, hit.y, hit.z, B.SCORCH);
      this.meltTime = -1;
    }
  }
}
