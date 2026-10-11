// Middle mouse (wheel click): lock on to the enemy closest to the crosshair.
// While locked, the camera keeps swinging back onto the target, so punches, the laser
// and super breath all go where it is. Press again to let go.
import * as THREE from 'three';
import { angleDiff, clamp } from '../util/math.js';

const RANGE = 170;

export class LockOn {
  constructor(game) {
    this.game = game;
    this.target = null;
    this.el = document.createElement('div');
    this.el.className = 'lockon hidden';
    this.el.innerHTML = '<div class="lockon-box"></div><div class="lockon-label"></div>';
    document.getElementById('hud').appendChild(this.el);
    this.label = this.el.querySelector('.lockon-label');
    this.v = new THREE.Vector3();
  }

  /** Where to aim on an entity (the Tyrant's chest, everyone else's middle). */
  aimPoint(e, out = this.v) {
    return out.set(e.pos.x, e.pos.y + e.height * (e.kind === 'tyrant' ? 0.6 : 0.55), e.pos.z);
  }

  toggle() {
    const g = this.game;
    if (this.target) {
      this.release();
      g.audio.play('sensesOff');
      return;
    }
    const cam = g.camera;
    cam.updateMatrixWorld();
    let best = null;
    let bestScore = Infinity;
    for (const e of g.entities.list) {
      if (e.removed || !e.alive || e.team !== 'enemy') continue;
      const p = this.aimPoint(e, new THREE.Vector3());
      if (p.distanceTo(g.player.pos) > RANGE) continue;
      const s = p.clone().project(cam);
      if (s.z > 1 || Math.abs(s.x) > 1.05 || Math.abs(s.y) > 1.05) continue; // must be on screen
      const score = s.x * s.x + s.y * s.y; // closest to the crosshair wins
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (!best) {
      g.hud.toast('No target to lock on to', 'info', 1.2);
      return;
    }
    this.target = best;
    this.label.textContent = best.boss ? best.bossName : best.kind === 'drone' ? 'DRONE' : 'TARGET';
    this.el.classList.remove('hidden');
    g.audio.play('sensesOn');
  }

  release() {
    this.target = null;
    this.el.classList.add('hidden');
  }

  /** Swing the camera towards the target (mouse movement still works on top). */
  update(dt) {
    const t = this.target;
    if (!t) return;
    const g = this.game;
    if (t.removed || !t.alive || t.pos.distanceTo(g.player.pos) > RANGE + 30) {
      this.release();
      return;
    }
    const c = g.camera.position;
    const p = this.aimPoint(t);
    const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
    const yaw = Math.atan2(-dx, -dz);
    const pitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -1.4, 1.4);
    const k = 1 - Math.exp(-9 * dt);
    g.rig.yaw += angleDiff(g.rig.yaw, yaw) * k;
    g.rig.pitch += (pitch - g.rig.pitch) * k;
  }

  /** Keep the lock marker on the target (after the camera has moved this frame). */
  updateMarker() {
    const t = this.target;
    if (!t) return;
    const s = this.aimPoint(t).project(this.game.camera);
    if (s.z > 1) {
      this.el.style.opacity = '0';
      return;
    }
    this.el.style.opacity = '1';
    const x = (s.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-s.y * 0.5 + 0.5) * window.innerHeight;
    const size = clamp(900 / Math.max(4, t.pos.distanceTo(this.game.camera.position)) * (t.kind === 'tyrant' ? 4 : 1), 34, 260);
    this.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    this.el.style.setProperty('--size', size + 'px');
  }
}
