// Granite: a big, stone-skinned brute built from boxes. About 2.7 m tall (Aegis is
// about 2 m): huge shoulders and fists, a small head, ragged trousers, bare feet.
// Same interface as HeroModel (root, head, eyes, punch(), update()) so the game can
// swap one for the other.
import * as THREE from 'three';
import { damp } from '../../util/math.js';

const C = {
  skin: 0x6f8a5c,
  dark: 0x4f6641,
  crack: 0xa5b98f,
  pants: 0x3d3a36,
  pantsDark: 0x2c2a27,
  hair: 0x2a2a24,
};

const mat = (color) => new THREE.MeshLambertMaterial({ color });

function part(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const HIP = 1.15; // hip height above the feet

export class GraniteModel {
  constructor() {
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.pivot.position.y = HIP;
    this.root.add(this.pivot);

    const skin = mat(C.skin);
    const dark = mat(C.dark);
    const crack = mat(C.crack);
    const pants = mat(C.pants);
    const pantsDark = mat(C.pantsDark);
    const hair = mat(C.hair);

    // torso: barrel chest over a narrower waist
    this.torso = new THREE.Group();
    this.pivot.add(this.torso);
    this.torso.add(part(1.12, 0.95, 0.66, skin, 0, 0.58, 0));
    this.torso.add(part(0.4, 0.26, 0.04, dark, -0.24, 0.78, 0.33)); // pecs
    this.torso.add(part(0.4, 0.26, 0.04, dark, 0.24, 0.78, 0.33));
    this.torso.add(part(0.3, 0.42, 0.04, dark, 0, 0.36, 0.33)); // abs
    this.torso.add(part(0.06, 0.4, 0.04, crack, 0.42, 0.62, 0.33)); // stone cracks
    this.torso.add(part(0.3, 0.05, 0.04, crack, -0.36, 0.42, 0.33));
    this.torso.add(part(0.05, 0.3, 0.04, crack, -0.2, 0.95, -0.34));
    this.torso.add(part(0.92, 0.3, 0.56, skin, 0, 0.06, 0)); // waist
    this.torso.add(part(0.96, 0.16, 0.6, pants, 0, -0.04, 0)); // waistband
    this.torso.add(part(1.18, 0.22, 0.6, skin, 0, 1.0, -0.02)); // trapezius hump

    // head: small and set forward, heavy brow, glowing amber eyes
    this.head = new THREE.Group();
    this.head.position.set(0, 1.12, 0.1);
    this.head.add(part(0.48, 0.46, 0.46, skin, 0, 0.23, 0));
    this.head.add(part(0.5, 0.1, 0.5, hair, 0, 0.5, -0.01));
    this.head.add(part(0.5, 0.08, 0.08, dark, 0, 0.32, 0.24)); // brow
    this.head.add(part(0.3, 0.1, 0.06, dark, 0, 0.08, 0.24)); // jaw shadow
    this.eyes = new THREE.Group(); // two "eyes" so the laser code still finds children
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffb43a });
    for (const x of [-0.12, 0.12]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.04), eyeMat);
      e.position.set(x, 0.25, 0.24);
      this.eyes.add(e);
    }
    this.head.add(this.eyes);
    this.torso.add(this.head);

    // arms: pivot at the shoulder; thick upper arm, bigger forearm, huge fist
    const arm = (side) => {
      const g = new THREE.Group();
      g.position.set(side * 0.74, 0.9, 0);
      g.add(part(0.48, 0.5, 0.5, skin, 0, -0.06, 0)); // shoulder cap
      g.add(part(0.44, 0.56, 0.46, skin, 0, -0.42, 0));
      g.add(part(0.5, 0.56, 0.52, skin, 0, -0.92, 0.02));
      g.add(part(0.05, 0.3, 0.04, crack, side * 0.12, -0.9, 0.27));
      g.add(part(0.58, 0.44, 0.58, dark, 0, -1.34, 0.03)); // fist
      this.torso.add(g);
      return g;
    };
    this.armL = arm(1);
    this.armR = arm(-1);

    // legs: pivot at the hip; torn trousers to the shin, bare feet
    const leg = (side) => {
      const g = new THREE.Group();
      g.position.set(side * 0.27, 0, 0);
      g.add(part(0.48, 0.72, 0.5, pants, 0, -0.38, 0));
      g.add(part(0.2, 0.12, 0.5, pants, side * -0.12, -0.8, 0)); // ragged hem
      g.add(part(0.14, 0.08, 0.5, pantsDark, side * 0.14, -0.78, 0));
      g.add(part(0.4, 0.4, 0.42, skin, 0, -0.92, 0));
      g.add(part(0.46, 0.16, 0.62, dark, 0, -1.08, 0.08)); // foot
      this.pivot.add(g);
      return g;
    };
    this.legL = leg(1);
    this.legR = leg(-1);

    this.punchT = 9;
    this.punchCombo = 1;
    this.walkPhase = 0;
    this.time = 0;
    this.tilt = 0;
    this.twist = 0;
    this.crouch = 0;
    this.yaw = 0;
  }

  /** Costume colours don't apply to Granite. */
  applySkin() {}

  setVisible(v) {
    this.root.visible = v;
  }

  punch(combo) {
    this.punchT = 0;
    this.punchCombo = combo;
  }

  /**
   * s: { pos, yaw, mode, speed, hSpeed, vy, carrying, landT, charge, leaping, clapT, wading }
   */
  update(dt, s) {
    this.time += dt;
    this.root.position.copy(s.pos);
    this.yaw = s.yaw;
    this.root.rotation.set(0, s.yaw, 0);

    let tilt = 0, twist = 0, crouch = 0;
    let armL = 0, armR = 0, spreadL = 0.08, spreadR = 0.08, legL = 0, legR = 0, bob = 0;
    const charge = s.charge || 0;

    if (s.mode === 'air' || s.mode === 'fly') {
      if (s.vy > 0) {
        // launching: arms swept back, legs trailing
        armL = armR = 0.9;
        spreadL = spreadR = 0.35;
        legL = 0.5;
        legR = -0.3;
        tilt = 0.25;
      } else {
        // coming down: both fists raised to smash the ground
        armL = armR = -2.7;
        spreadL = spreadR = 0.25;
        legL = -0.6;
        legR = -0.2;
        tilt = 0.1;
      }
    } else if (s.landT > 0) {
      // landing crouch: fists driven into the ground
      crouch = 0.55;
      tilt = 0.55;
      armL = armR = -0.55;
      spreadL = spreadR = 0.5;
      legL = -0.9;
      legR = 0.5;
    } else if (charge > 0) {
      // charging the leap: deep squat, arms drawn back, trembling as it builds
      crouch = 0.5 * charge;
      tilt = 0.45 * charge;
      armL = armR = 0.9 * charge;
      spreadL = spreadR = 0.25 + 0.2 * charge;
      legL = legR = -0.75 * charge;
      bob = (Math.random() - 0.5) * 0.04 * charge;
    } else {
      // heavy walk / run
      const hs = s.hSpeed;
      const k = Math.min(1, hs / 6);
      this.walkPhase += dt * (3 + hs * 0.55);
      const sw = Math.sin(this.walkPhase) * (0.35 + 0.45 * Math.min(1, hs / 14)) * k;
      armL = sw * 1.1;
      armR = -sw * 1.1;
      legL = -sw;
      legR = sw;
      spreadL = spreadR = 0.12;
      tilt = Math.min(0.35, hs * 0.016);
      twist = Math.sin(this.walkPhase) * 0.12 * k;
      bob = -Math.abs(Math.cos(this.walkPhase)) * 0.1 * k;
      if (k < 0.05) {
        // idle: slow heavy breathing, fists flexing
        const b = Math.sin(this.time * 1.6);
        armL = 0.05 + b * 0.04;
        armR = 0.05 - b * 0.04;
        spreadL = spreadR = 0.14 + b * 0.02;
        bob = b * 0.02;
      }
    }

    if (s.carrying) {
      armL = armR = -2.9;
      spreadL = spreadR = 0.2;
    }

    // thunder clap: arms swing out wide, then slam together in front
    if (s.clapT < 0.45) {
      const t = s.clapT;
      const open = t < 0.12 ? t / 0.12 : Math.max(0, 1 - (t - 0.12) / 0.06);
      armL = armR = -1.45;
      spreadL = spreadR = -0.05 + 1.35 * open;
      if (t > 0.12) tilt = 0.15;
    }

    // punches: big hooks, the third is a two-fisted hammer blow
    this.punchT += dt;
    let fast = '';
    if (this.punchT < 0.3) {
      const k = Math.sin((this.punchT / 0.3) * Math.PI);
      if (this.punchCombo === 3) {
        armL = armR = -2.8 + 2.2 * Math.min(1, this.punchT / 0.18);
        spreadL = spreadR = 0.1;
        tilt = 0.4 * k;
        fast = 'both';
      } else if (this.punchCombo === 2) {
        armL = -1.7 * k;
        spreadL = 0.05;
        twist = -0.35 * k;
        fast = 'L';
      } else {
        armR = -1.7 * k;
        spreadR = 0.05;
        twist = 0.35 * k;
        fast = 'R';
      }
    }

    this.tilt = damp(this.tilt, tilt, s.landT > 0 ? 25 : 9, dt);
    this.twist = damp(this.twist, twist, 12, dt);
    this.crouch = damp(this.crouch, crouch, s.landT > 0 ? 40 : 10, dt);
    this.pivot.position.y = HIP - this.crouch + bob;
    this.torso.rotation.set(this.tilt, this.twist, 0);
    // head stays roughly level while the body leans
    this.head.rotation.x = damp(this.head.rotation.x, -this.tilt * 0.7, 10, dt);

    const L = 12;
    const r = (fast, side) => (fast === 'both' || fast === side ? 60 : L);
    this.armL.rotation.x = damp(this.armL.rotation.x, armL, r(fast, 'L'), dt);
    this.armR.rotation.x = damp(this.armR.rotation.x, armR, r(fast, 'R'), dt);
    this.armL.rotation.z = damp(this.armL.rotation.z, spreadL, s.clapT < 0.45 ? 40 : L, dt);
    this.armR.rotation.z = damp(this.armR.rotation.z, -spreadR, s.clapT < 0.45 ? 40 : L, dt);
    this.legL.rotation.x = damp(this.legL.rotation.x, legL, L, dt);
    this.legR.rotation.x = damp(this.legR.rotation.x, legR, L, dt);
  }
}
