// First-person view model: Aegis's arms at the bottom of the screen, attached to the
// camera, with idle sway, walk bob, punches, carrying and a laser glow.
import * as THREE from 'three';
import { damp } from '../util/math.js';

function mat(color) {
  return new THREE.MeshLambertMaterial({ color });
}

export class FirstPersonArms {
  constructor(camera) {
    this.group = new THREE.Group();
    this.group.renderOrder = 999;
    this.group.scale.setScalar(0.8);
    camera.add(this.group);
    const suit = mat(0x1c9c93), white = mat(0xf3f3ee), gold = mat(0xf2b630);
    const arm = (side) => {
      const g = new THREE.Group();
      const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.17, 0.62), suit);
      sleeve.position.z = 0.05;
      const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.19, 0.05), gold);
      cuff.position.z = -0.26;
      const glove = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.22), white);
      glove.position.z = -0.38;
      for (const m of [sleeve, cuff, glove]) {
        m.renderOrder = 999;
        m.frustumCulled = false;
        g.add(m);
      }
      g.userData.rest = new THREE.Vector3(side * 0.36, -0.38, -0.62);
      g.position.copy(g.userData.rest);
      g.rotation.y = side * 0.12;
      this.group.add(g);
      return g;
    };
    this.right = arm(1);
    this.left = arm(-1);
    this.t = 0;
    this.group.visible = false;
  }

  /** s: { visible, speed, onGround, flying, punchT, punchCombo, carrying, laser, breath } */
  update(dt, s) {
    this.group.visible = s.visible;
    if (!s.visible) return;
    this.t += dt;
    const walk = s.onGround && !s.flying ? Math.min(1, s.speed / 7) : 0;
    const bobX = Math.sin(this.t * 9) * 0.025 * walk;
    const bobY = Math.abs(Math.cos(this.t * 9)) * 0.03 * walk + Math.sin(this.t * 1.6) * 0.008;
    for (const [arm, side] of [[this.right, 1], [this.left, -1]]) {
      const rest = arm.userData.rest;
      let x = rest.x + bobX, y = rest.y - bobY, z = rest.z, rx = 0;
      if (s.flying && s.speed > 15) {
        // flying fast: fists tucked lower and back
        y -= 0.12;
        z += 0.1;
      }
      if (s.carrying) {
        // both arms up, holding what you carry
        y += 0.14;
        z -= 0.12;
        x -= side * 0.08;
        rx = 0.35;
      }
      if (s.breath) y -= 0.08;
      // punch: the 2nd hit of the combo uses the left fist, the others the right
      const punching = s.punchT < 0.24 && (s.punchCombo === 2 ? side === -1 : side === 1);
      if (punching) {
        const k = Math.sin((s.punchT / 0.24) * Math.PI);
        z -= 0.45 * k * (s.punchCombo === 3 ? 1.3 : 1);
        x -= side * 0.22 * k;
        y += 0.1 * k;
      }
      arm.position.x = damp(arm.position.x, x, punching ? 40 : 14, dt);
      arm.position.y = damp(arm.position.y, y, punching ? 40 : 14, dt);
      arm.position.z = damp(arm.position.z, z, punching ? 40 : 14, dt);
      arm.rotation.x = damp(arm.rotation.x, rx, 12, dt);
    }
  }
}
