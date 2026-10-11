// Aegis: a blocky, original hero built from boxes, with simple procedural poses.
import * as THREE from 'three';
import { damp } from '../util/math.js';
import { SKINS, hex } from './skins.js';

const COLORS = {
  suit: 0x1c9c93,
  suitDark: 0x137068,
  white: 0xf3f3ee,
  gold: 0xf2b630,
  cape: 0x24306e,
  skin: 0xe2a77e,
  hair: 0x3b2618,
};

function pixelTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function faceTexture(skin) {
  return pixelTexture(8, 8, (g) => {
    g.fillStyle = '#e2a77e';
    g.fillRect(0, 0, 8, 8);
    g.fillStyle = '#3b2618'; // hairline
    g.fillRect(0, 0, 8, 2);
    if (skin.mask !== null) {
      g.fillStyle = hex(skin.mask); // mask band
      g.fillRect(0, 3, 8, 2);
    }
    g.fillStyle = skin.mask !== null ? '#ffffff' : '#2b4fa0'; // eyes
    g.fillRect(1, 3, 2, 1);
    g.fillRect(5, 3, 2, 1);
    g.fillStyle = '#b5785a'; // mouth
    g.fillRect(3, 6, 2, 1);
  });
}

function chestTexture(skin) {
  return pixelTexture(16, 16, (g) => {
    g.fillStyle = hex(skin.suit);
    g.fillRect(0, 0, 16, 16);
    // shield-shaped emblem
    g.fillStyle = hex(skin.emblemBg);
    g.fillRect(4, 3, 8, 5);
    g.fillRect(5, 8, 6, 2);
    g.fillRect(6, 10, 4, 1);
    g.fillRect(7, 11, 2, 1);
    g.fillStyle = hex(skin.emblemMark);
    g.fillRect(7, 4, 2, 5);
    g.fillRect(6, 5, 1, 1);
    g.fillRect(9, 5, 1, 1);
  });
}

const mat = (color) => new THREE.MeshLambertMaterial({ color });

function part(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export class HeroModel {
  constructor() {
    this.root = new THREE.Group(); // origin at the feet
    this.pivot = new THREE.Group(); // body pivot at the hips/centre of mass
    this.pivot.position.y = 1.0;
    this.root.add(this.pivot);

    const suit = mat(COLORS.suit);
    const white = mat(COLORS.white);
    const gold = mat(COLORS.gold);
    const hair = mat(COLORS.hair);
    const skin = mat(COLORS.skin);
    this.mats = { suit, white, gold };

    // torso (front face gets the emblem)
    const chest = new THREE.MeshLambertMaterial({ map: chestTexture(SKINS[0]) });
    this.chestMat = chest;
    const torso = part(0.62, 0.75, 0.34, [suit, suit, suit, suit, chest, suit], 0, 0.125, 0);
    this.pivot.add(torso);
    this.pivot.add(part(0.64, 0.1, 0.36, gold, 0, -0.2, 0)); // belt

    // head
    this.head = new THREE.Group();
    this.head.position.set(0, 0.5, 0);
    const face = new THREE.MeshLambertMaterial({ map: faceTexture(SKINS[0]) });
    this.faceMat = face;
    this.head.add(part(0.5, 0.5, 0.5, [skin, skin, hair, skin, face, hair], 0, 0.25, 0));
    this.head.add(part(0.54, 0.12, 0.54, hair, 0, 0.5, -0.02));
    this.pivot.add(this.head);

    // arms (pivot at the shoulder)
    const arm = (side) => {
      const g = new THREE.Group();
      g.position.set(side * 0.45, 0.44, 0);
      g.add(part(0.26, 0.52, 0.28, suit, 0, -0.24, 0));
      g.add(part(0.28, 0.24, 0.3, white, 0, -0.62, 0)); // glove
      this.pivot.add(g);
      return g;
    };
    this.armL = arm(1);
    this.armR = arm(-1);

    // legs (pivot at the hip)
    const leg = (side) => {
      const g = new THREE.Group();
      g.position.set(side * 0.16, -0.25, 0);
      g.add(part(0.29, 0.45, 0.32, suit, 0, -0.22, 0));
      g.add(part(0.3, 0.32, 0.34, white, 0, -0.59, 0.01)); // boot
      this.pivot.add(g);
      return g;
    };
    this.legL = leg(1);
    this.legR = leg(-1);

    // cape (pivot across the shoulders, behind the back)
    this.cape = new THREE.Group();
    this.cape.position.set(0, 0.48, -0.19);
    const capeMat = mat(COLORS.cape);
    this.capeMat = capeMat;
    this.cape.add(part(0.6, 1.15, 0.05, capeMat, 0, -0.575, 0));
    this.cape.add(part(0.62, 0.06, 0.06, gold, 0, -1.15, 0));
    this.pivot.add(this.cape);

    // glowing eyes for the laser
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff5a3a });
    this.eyes = new THREE.Group();
    for (const x of [-0.12, 0.12]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.04), eyeMat);
      e.position.set(x, 0.29, 0.26);
      this.eyes.add(e);
    }
    this.eyes.visible = false;
    this.head.add(this.eyes);

    this.punchT = 9;
    this.prevYaw = 0;
    this.bank = 0; // lean into turns
    this.roll = 0; // barrel-roll spin (radians left to spin)
    this.rollCd = 0;
    this.bob = 0;
    this.punchCombo = 1;
    this.walkPhase = 0;
    this.tilt = 0;
    this.yaw = 0;
    this.time = 0;
  }

  /** Re-colour the costume (see skins.js). */
  applySkin(sk) {
    this.mats.suit.color.setHex(sk.suit);
    this.mats.white.color.setHex(sk.accent);
    this.mats.gold.color.setHex(sk.belt);
    this.cape.visible = sk.cape !== null;
    if (sk.cape !== null) this.capeMat.color.setHex(sk.cape);
    this.chestMat.map?.dispose();
    this.chestMat.map = chestTexture(sk);
    this.chestMat.needsUpdate = true;
    this.faceMat.map?.dispose();
    this.faceMat.map = faceTexture(sk);
    this.faceMat.needsUpdate = true;
  }

  /** Start a punch animation; alternates arms, third hit is a big uppercut. */
  punch(combo) {
    this.punchT = 0;
    this.punchCombo = combo;
  }

  setVisible(v) {
    this.root.visible = v;
  }

  /**
   * state: { pos, yaw, mode: 'ground'|'air'|'fly', speed, hSpeed, vy, boost }
   */
  update(dt, s) {
    this.time += dt;
    this.root.position.copy(s.pos);
    this.yaw = s.yaw;

    let tiltTarget = 0;
    let armL = 0, armR = 0, legL = 0, legR = 0, cape = 0.12, armSpread = 0;

    if (s.mode === 'fly') {
      const move = Math.min(1, s.speed / 12);
      const ang = Math.atan2(s.hSpeed, s.vy); // 0 = straight up, PI/2 = level
      tiltTarget = Math.min(ang, 2.6) * move;
      // superhero pose: one fist forward, other arm tucked
      armR = -2.9 * move;
      armL = -0.25 * move;
      // past the sound barrier both fists reach forward, eased in rather than snapped
      this.superK = damp(this.superK || 0, s.supersonic ? 1 : 0, 2.2, dt);
      armL = armL + (-2.9 - armL) * this.superK;
      armSpread = 0.06 * this.superK;
      legL = 0.08 + Math.sin(this.time * 6) * 0.05 * move;
      legR = 0.02 - Math.sin(this.time * 6) * 0.05 * move;
      // the body tilt already makes the cape trail behind; just add flutter
      cape = 0.15 + Math.sin(this.time * (s.boost ? 24 : 10)) * (s.boost ? 0.12 : 0.07);
      if (move < 0.3) {
        // hovering: gentle bob
        armSpread = 0.25;
        armL = Math.sin(this.time * 2) * 0.1;
        armR = -Math.sin(this.time * 2) * 0.1;
        legL = 0.1;
        legR = -0.05;
        cape = 0.2 + Math.sin(this.time * 2.5) * 0.08;
      }
    } else if (s.mode === 'air') {
      armL = -0.6;
      armR = -0.6;
      armSpread = 0.4;
      legL = -0.5;
      legR = 0.3;
      cape = s.vy < 0 ? 1.2 : 0.4;
    } else {
      const k = Math.min(1, s.hSpeed / 7);
      this.walkPhase += dt * (4 + s.hSpeed * 0.9);
      const sw = Math.sin(this.walkPhase) * (0.35 + 0.55 * Math.min(1, s.hSpeed / 12)) * k;
      armL = sw;
      armR = -sw;
      legL = -sw;
      legR = sw;
      cape = 0.1 + Math.min(1.1, s.hSpeed * 0.07) + Math.sin(this.time * 7) * 0.04 * k;
      if (k < 0.05) {
        const b = Math.sin(this.time * 2) * 0.03;
        armL = b;
        armR = -b;
        armSpread = 0.05;
      }
    }

    // carrying: arms up holding the load
    if (s.carrying) {
      armL = armR = s.carryHeavy ? -2.9 : -1.2;
      armSpread = s.carryHeavy ? 0.25 : 0.1;
    }
    // punches snap an arm forward, overriding the pose for a moment
    this.punchT += dt;
    let punchArm = null;
    if (this.punchT < 0.24) {
      const k = Math.sin((this.punchT / 0.24) * Math.PI);
      const reach = this.punchCombo === 3 ? -2.6 : -1.6;
      punchArm = this.punchCombo === 2 ? 'L' : 'R';
      if (punchArm === 'L') armL = reach * k;
      else armR = reach * k;
      if (s.mode !== 'fly') tiltTarget = 0.2 * k;
    }
    this.eyes.visible = !!s.laser;

    this.tilt = damp(this.tilt, tiltTarget, 8, dt);
    this.root.rotation.set(0, this.yaw, 0);

    // turning: lean into the turn, and do a barrel roll on a hard turn at speed
    let yawRate = (this.yaw - this.prevYaw) / Math.max(dt, 1e-4);
    yawRate = Math.atan2(Math.sin(yawRate * dt), Math.cos(yawRate * dt)) / Math.max(dt, 1e-4);
    this.prevYaw = this.yaw;
    const fast = s.mode === 'fly' ? Math.min(1, s.hSpeed / 20) : 0;
    this.bank = damp(this.bank, Math.max(-0.9, Math.min(0.9, -yawRate * 0.18)) * fast, 6, dt);
    this.rollCd = Math.max(0, this.rollCd - dt);
    let spin = 0;
    if (this.roll !== 0) {
      const step = Math.sign(this.roll) * Math.min(Math.abs(this.roll), dt * 11);
      this.roll -= step;
      if (Math.abs(this.roll) < 1e-3) this.roll = 0;
      spin = this.roll;
    }
    // hovering: drift gently up and down
    const hover = s.mode === 'fly' ? 1 - Math.min(1, s.speed / 6) : 0;
    this.bob = damp(this.bob, Math.sin(this.time * 1.8) * 0.12 * hover, 6, dt);
    this.pivot.position.y = 1.0 + this.bob;
    // spin and bank around the body's own long axis (the flight direction when flying flat)
    this.pivot.rotation.set(this.tilt, this.bank + spin, 0, 'XYZ');
    // head looks forward even when the body is horizontal
    this.head.rotation.x = damp(this.head.rotation.x, -Math.min(this.tilt, 1.4) * 0.6, 10, dt);

    const L = 14;
    this.armL.rotation.x = damp(this.armL.rotation.x, armL, punchArm === 'L' ? 60 : L, dt);
    this.armR.rotation.x = damp(this.armR.rotation.x, armR, punchArm === 'R' ? 60 : L, dt);
    this.armL.rotation.z = damp(this.armL.rotation.z, armSpread, L, dt);
    this.armR.rotation.z = damp(this.armR.rotation.z, -armSpread, L, dt);
    this.legL.rotation.x = damp(this.legL.rotation.x, legL, L, dt);
    this.legR.rotation.x = damp(this.legR.rotation.x, legR, L, dt);
    this.cape.rotation.x = damp(this.cape.rotation.x, cape, 10, dt);
  }
}
