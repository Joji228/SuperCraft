// Third-person (over the shoulder) and first-person camera with wall avoidance and FOV kick.
import * as THREE from 'three';
import { clamp, damp } from '../util/math.js';

const EYE = 1.72;
const PITCH_LIMIT = 1.45;

export class CameraRig {
  constructor(camera, world, settings) {
    this.camera = camera;
    this.world = world;
    this.settings = settings;
    this.yaw = 0;
    this.pitch = -0.12;
    this.dist = 5.5;
    this.focusY = null;
    this.shake = 0;
    this.focus = new THREE.Vector3();
  }

  get firstPerson() {
    return this.settings.firstPerson;
  }

  look(dx, dy) {
    const s = 0.0022 * this.settings.sensitivity;
    this.yaw -= dx * s;
    this.pitch -= dy * s * (this.settings.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -PITCH_LIMIT, PITCH_LIMIT);
  }

  forward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  update(dt, player) {
    const cam = this.camera;
    // smooth the vertical focus so step-ups don't jolt the view
    const targetY = player.pos.y + EYE;
    this.focusY = this.focusY === null ? targetY : player.flying ? targetY : damp(this.focusY, targetY, 18, dt);
    if (Math.abs(this.focusY - targetY) > 3) this.focusY = targetY;
    this.focus.set(player.pos.x, this.focusY, player.pos.z);

    const f = this.forward();
    const boost = player.boostAmount;
    cam.fov = damp(cam.fov, this.settings.fov + boost * 22, 6, dt);

    if (this.firstPerson) {
      cam.position.copy(this.focus);
    } else {
      const want = player.flying ? 7.5 + boost * 3 : 6.5;
      this.dist = damp(this.dist, want, 4, dt);
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const shoulder = 0.75;
      const back = f.clone().multiplyScalar(-this.dist).addScaledVector(right, shoulder);
      back.y += 0.7;
      const len = back.length();
      const dir = back.clone().divideScalar(len);
      const hit = this.world.raycast(this.focus.x, this.focus.y, this.focus.z, dir.x, dir.y, dir.z, len + 0.3);
      const d = hit ? Math.max(0.3, hit.t - 0.3) : len;
      cam.position.copy(this.focus).addScaledVector(dir, d);
    }

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2);
      const s = this.shake * 0.3;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }
    if (boost > 0.3) {
      const s = (boost - 0.3) * 0.05;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }

    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    cam.updateProjectionMatrix();
  }
}
