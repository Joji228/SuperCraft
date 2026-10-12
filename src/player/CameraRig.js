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
    this.fovPunch = 0;
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
    this.fovPunch = Math.max(0, this.fovPunch - dt * 30);
    cam.fov = damp(cam.fov, this.settings.fov + boost * 12 + this.fovPunch, this.fovPunch > 0 ? 14 : 6, dt);

    if (this.firstPerson) {
      cam.position.copy(this.focus);
    } else {
      // V cycles close / medium / far third-person views (then first person)
      const base = [4.2, 5.6, 7.4][this.settings.cameraMode] ?? 4.2;
      const want = player.flying ? base + 0.6 + boost * 0.8 : base; // only slightly further back at speed
      this.dist = damp(this.dist, want, 4, dt);
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const shoulder = 0.55 + 0.1 * (this.settings.cameraMode || 0);
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

  /**
   * Chase camera while driving: swings back behind the car after you stop looking
   * around with the mouse; first person sits in the driver's seat.
   */
  updateVehicle(dt, car, lookIdle) {
    const cam = this.camera;
    const behind = car.yaw + Math.PI;
    const speed = Math.hypot(car.vel.x, car.vel.z);
    if (lookIdle > 0.8) {
      let d = behind - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-(2 + speed * 0.08) * dt));
      this.pitch += (-0.2 - this.pitch) * (1 - Math.exp(-2 * dt));
    }
    this.fovPunch = Math.max(0, this.fovPunch - dt * 30);
    cam.fov = damp(cam.fov, this.settings.fov + Math.min(8, speed * 0.15) + this.fovPunch, 4, dt);
    this.focusY = car.pos.y + 1.6;
    this.focus.set(car.pos.x, this.focusY, car.pos.z);
    if (this.firstPerson) {
      // driver's seat: left of centre, just behind the windscreen
      cam.position.set(car.pos.x + Math.cos(car.yaw) * 0.42 - Math.sin(car.yaw) * 0.1, car.pos.y + 1.45, car.pos.z - Math.sin(car.yaw) * 0.42 - Math.cos(car.yaw) * 0.1);
    } else {
      const want = [6.5, 8, 10][this.settings.cameraMode] ?? 6.5;
      this.dist = damp(this.dist, want + Math.min(1.5, speed * 0.03), 4, dt);
      const f = this.forward();
      const back = f.clone().multiplyScalar(-this.dist);
      back.y += 1.6;
      const len = back.length();
      const dir = back.clone().divideScalar(len);
      const hit = this.world.raycast(this.focus.x, this.focus.y, this.focus.z, dir.x, dir.y, dir.z, len + 0.3);
      const d = hit ? Math.max(0.5, hit.t - 0.3) : len;
      cam.position.copy(this.focus).addScaledVector(dir, d);
      // backed up against a wall: rise above the car instead of ending up inside it
      const lift = Math.max(0, 4 - d);
      this.carLift = damp(this.carLift || 0, lift, 6, dt);
      if (this.carLift > 0.01) {
        cam.position.y += this.carLift;
        if (lookIdle > 0.8) this.pitch += (-0.2 - this.carLift * 0.18 - this.pitch) * (1 - Math.exp(-4 * dt));
      }
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2);
      const s = this.shake * 0.3;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    cam.updateProjectionMatrix();
  }
}
