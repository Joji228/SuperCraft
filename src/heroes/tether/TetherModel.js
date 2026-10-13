// Tether: a slim, agile web-runner. Midnight-blue suit with teal web lines and big
// white angular eyes. Same interface as HeroModel (root, head, eyes, punch(), update())
// plus handR: the right hand, where the web lines come from.
import * as THREE from 'three';
import { damp } from '../../util/math.js';

const C = { suit: 0x1d2540, web: 0x25c9bb, dark: 0x111628, eye: 0xf4f7ff };

function pixelTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const webTex = () =>
  pixelTexture(16, 16, (g) => {
    g.fillStyle = '#1d2540';
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#2b3a63';
    for (const y of [3, 8, 13]) g.fillRect(0, y, 16, 1);
    for (const x of [4, 11]) g.fillRect(x, 0, 1, 16);
  });

const chestTex = () =>
  pixelTexture(16, 16, (g) => {
    g.fillStyle = '#1d2540';
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#2b3a63';
    for (const y of [3, 8, 13]) g.fillRect(0, y, 16, 1);
    for (const x of [3, 12]) g.fillRect(x, 0, 1, 16);
    g.fillStyle = '#25c9bb'; // diamond emblem
    g.fillRect(7, 3, 2, 1);
    g.fillRect(6, 4, 4, 1);
    g.fillRect(5, 5, 6, 2);
    g.fillRect(6, 7, 4, 1);
    g.fillRect(7, 8, 2, 1);
  });

const faceTex = () =>
  pixelTexture(8, 8, (g) => {
    g.fillStyle = '#1d2540';
    g.fillRect(0, 0, 8, 8);
    g.fillStyle = '#25c9bb';
    g.fillRect(3, 0, 2, 8); // centre seam
    g.fillStyle = '#f4f7ff'; // big angular eyes
    g.fillRect(0, 2, 3, 2);
    g.fillRect(1, 4, 2, 1);
    g.fillRect(5, 2, 3, 2);
    g.fillRect(5, 4, 2, 1);
  });

// melee moves: how long each part of the combo takes (seconds)
const MELEE = { 1: { dur: 0.22 }, 2: { dur: 0.38 }, 3: { dur: 0.45 } };

const mat = (o) => new THREE.MeshLambertMaterial(typeof o === 'number' ? { color: o } : o);

function part(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export class TetherModel {
  constructor() {
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.pivot.position.y = 1.0;
    this.root.add(this.pivot);

    const suit = mat({ map: webTex() });
    const plain = mat(C.suit);
    const web = mat(C.web);
    const dark = mat(C.dark);
    const chest = mat({ map: chestTex() });
    const face = mat({ map: faceTex() });

    this.pivot.add(part(0.56, 0.72, 0.3, [suit, suit, plain, plain, chest, suit], 0, 0.12, 0));
    this.pivot.add(part(0.5, 0.08, 0.32, web, 0, -0.22, 0)); // belt line

    this.head = new THREE.Group();
    this.head.position.set(0, 0.48, 0);
    this.head.add(part(0.46, 0.48, 0.46, [plain, plain, plain, plain, face, plain], 0, 0.24, 0));
    this.eyes = new THREE.Group(); // kept for interface compatibility (no laser)
    for (const x of [-0.1, 0.1]) {
      const e = new THREE.Object3D();
      e.position.set(x, 0.28, 0.24);
      this.eyes.add(e);
    }
    this.head.add(this.eyes);
    this.pivot.add(this.head);

    const arm = (side) => {
      const g = new THREE.Group();
      g.position.set(side * 0.4, 0.42, 0);
      g.add(part(0.2, 0.52, 0.22, suit, 0, -0.24, 0));
      g.add(part(0.22, 0.22, 0.24, plain, 0, -0.6, 0)); // glove
      g.add(part(0.23, 0.06, 0.25, web, 0, -0.5, 0)); // web shooter
      this.pivot.add(g);
      return g;
    };
    this.armL = arm(1);
    this.armR = arm(-1);
    this.handR = new THREE.Object3D();
    this.handR.position.set(0, -0.72, 0);
    this.armR.add(this.handR);
    this.handL = new THREE.Object3D();
    this.handL.position.set(0, -0.72, 0);
    this.armL.add(this.handL);

    const leg = (side) => {
      const g = new THREE.Group();
      g.position.set(side * 0.14, -0.24, 0);
      g.add(part(0.24, 0.5, 0.26, suit, 0, -0.25, 0));
      g.add(part(0.25, 0.28, 0.3, dark, 0, -0.62, 0.02)); // boots
      g.add(part(0.26, 0.05, 0.31, web, 0, -0.47, 0.02));
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
    this.roll = 0;
    this.crouch = 0;
    this.yaw = 0;
    this.flip = 0;
  }

  applySkin() {}

  setVisible(v) {
    this.root.visible = v;
  }

  punch(combo) {
    this.punchT = 0;
    this.punchCombo = combo;
  }

  /**
   * s: { pos, yaw, mode, hSpeed, vy, carrying, landT, swing, swingSide, swingVariant,
   *      webOut (0..1 while the web is flying), trick { type, t, dur, side }, skydive,
   *      zip, climb, shotT }
   */
  update(dt, s) {
    this.time += dt;
    this.root.position.copy(s.pos);
    this.yaw = s.yaw;
    this.root.rotation.set(0, s.yaw, 0);

    let tilt = 0, roll = 0, crouch = 0, twist = 0;
    let armL = 0, armR = 0, spreadL = 0.06, spreadR = 0.06, legL = 0, legR = 0;
    let spinX = 0, spinY = 0, spinZ = 0; // whole-body spins for tricks and kicks

    if (s.swing) {
      // one arm up holding the line, the other out for balance; lean into the swing and
      // roll towards the anchor side. Now and then a different pose.
      const up = s.swingSide < 0 ? 'L' : 'R';
      const lineArm = s.webOut < 1 ? -2.2 - 0.8 * s.webOut : -3.0; // throwing, then holding
      armR = up === 'R' ? lineArm : -0.5;
      armL = up === 'L' ? lineArm : -0.5;
      spreadR = up === 'R' ? -0.25 : 0.7;
      spreadL = up === 'L' ? -0.25 : 0.7;
      legL = -1.1;
      legR = -0.35;
      tilt = Math.max(-0.5, Math.min(0.9, s.vy * -0.02 + 0.25));
      roll = (s.swingSide || 0) * 0.35;
      const free = up === 'R' ? 'L' : 'R';
      if (s.swingVariant === 1) {
        // legs together, stretched out ahead like a diver
        legL = legR = -1.5;
        tilt -= 0.35;
      } else if (s.swingVariant === 2) {
        // turned side-on to the swing, free arm pointing the way
        twist = (s.swingSide || 1) * 0.9;
        if (free === 'L') { armL = -1.6; spreadL = 0.9; } else { armR = -1.6; spreadR = 0.9; }
        legL = -0.6;
        legR = 0.3;
      } else if (s.swingVariant === 3) {
        // one leg kicked out, free arm thrown back
        legL = -1.8;
        legR = 0.5;
        if (free === 'L') { armL = 0.9; spreadL = 0.6; } else { armR = 0.9; spreadR = 0.6; }
      }
    } else if (s.trick) {
      // a 360 after letting go: tucked tight while spinning
      const k = Math.min(1, s.trick.t / s.trick.dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      armL = armR = -0.9;
      spreadL = spreadR = 0.4;
      legL = -1.6;
      legR = -1.4;
      tilt = 0.2;
      if (s.trick.type === 'flip') spinX = e * Math.PI * 2;
      else if (s.trick.type === 'spin') spinY = e * Math.PI * 2 * (s.trick.side || 1);
      else spinZ = e * Math.PI * 2 * (s.trick.side || 1);
    } else if (s.skydive) {
      // dropping chest-first, arms spread wide, legs trailing
      armL = armR = -0.25;
      spreadL = spreadR = 1.45;
      legL = 0.35;
      legR = 0.2;
      tilt = 1.25;
      roll = Math.sin(this.time * 2.3) * 0.08;
    } else if (s.zip) {
      // pulled along the web: both arms forward, body stretched out
      armL = armR = -1.7;
      spreadL = spreadR = 0.05;
      legL = 0.25;
      legR = 0.1;
      tilt = 1.0;
    } else if (s.climb) {
      // scaling a wall hand over hand
      const c = Math.sin(this.time * 12);
      armL = -2.6 + c * 0.45;
      armR = -2.6 - c * 0.45;
      spreadL = spreadR = 0.3;
      legL = -0.9 - c * 0.4;
      legR = -0.9 + c * 0.4;
      tilt = -0.15;
    } else if (s.mode === 'air' || s.mode === 'fly') {
      // free fall / after letting go: a tucked flip when going up, spread out falling
      if (s.vy > 2) {
        armL = armR = -0.9;
        spreadL = spreadR = 0.5;
        legL = -1.4;
        legR = -1.2;
        tilt = 0.3;
      } else {
        armL = armR = -0.7;
        spreadL = spreadR = 1.0;
        legL = -0.3;
        legR = 0.2;
        tilt = 0.5;
      }
    } else if (s.landT > 0) {
      // three-point landing
      crouch = 0.45;
      tilt = 0.55;
      armR = -0.6;
      armL = 0.6;
      spreadL = spreadR = 0.3;
      legL = -1.3;
      legR = 0.6;
    } else {
      const hs = s.hSpeed;
      const k = Math.min(1, hs / 6);
      this.walkPhase += dt * (5 + hs * 0.8);
      const sw = Math.sin(this.walkPhase) * (0.4 + 0.6 * Math.min(1, hs / 14)) * k;
      armL = sw * 1.2;
      armR = -sw * 1.2;
      legL = -sw * 1.1;
      legR = sw * 1.1;
      tilt = Math.min(0.45, hs * 0.02);
      if (k < 0.05) {
        // idle: a crouched, ready stance
        const b = Math.sin(this.time * 2) * 0.03;
        crouch = 0.12;
        legL = -0.35;
        legR = 0.2;
        armL = -0.3 + b;
        armR = -0.3 - b;
        spreadL = spreadR = 0.25;
        tilt = 0.12;
      }
    }

    if (s.carrying) {
      armL = armR = -2.9;
      spreadL = spreadR = 0.2;
    }

    // web shot: snap the right arm towards the target for a moment
    if (s.shotT < 0.25) {
      armR = -1.6;
      spreadR = 0.02;
    }

    // melee: a flowing three-move sequence (jab, spinning hook kick, flip kick)
    this.punchT += dt;
    let fast = '';
    const P = MELEE[this.punchCombo] || MELEE[1];
    if (this.punchT < P.dur) {
      const k = this.punchT / P.dur;
      const arc = Math.sin(k * Math.PI);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      if (this.punchCombo === 2) {
        // spinning hook kick: a full turn with the right leg swinging out
        spinY = e * Math.PI * 2;
        legR = -1.5 * arc;
        legL = 0.2;
        armL = armR = -0.6;
        spreadL = spreadR = 0.9 * arc + 0.2;
        tilt = -0.25 * arc;
        crouch = 0.1 * arc;
        fast = 'legs';
      } else if (this.punchCombo === 3) {
        // front flip kick: tuck, flip, both feet driving out at the end
        spinX = e * Math.PI * 2;
        legL = legR = k < 0.6 ? -1.4 : -1.4 + (k - 0.6) * 2.5;
        armL = armR = -1.0;
        spreadL = spreadR = 0.5;
        fast = 'legs';
      } else {
        // a quick jab with a twist of the shoulders
        armR = -1.65 * arc;
        spreadR = 0.02;
        armL = -0.5;
        twist = -0.35 * arc;
        legL = -0.4 * arc;
        fast = 'R';
      }
    }

    this.tilt = damp(this.tilt, tilt, s.landT > 0 ? 25 : 9, dt);
    this.roll = damp(this.roll, roll, 6, dt);
    this.twist = damp(this.twist || 0, twist, 10, dt);
    this.crouch = damp(this.crouch, crouch, s.landT > 0 ? 40 : 10, dt);
    this.pivot.position.y = 1.0 - this.crouch;
    this.pivot.rotation.set(this.tilt + spinX, this.twist + spinY, this.roll + spinZ, 'YXZ');
    this.head.rotation.x = damp(this.head.rotation.x, -this.tilt * 0.6, 10, dt);

    const L = 13;
    this.armL.rotation.x = damp(this.armL.rotation.x, armL, fast === 'L' ? 60 : L, dt);
    this.armR.rotation.x = damp(this.armR.rotation.x, armR, fast === 'R' || s.shotT < 0.25 ? 60 : L, dt);
    this.armL.rotation.z = damp(this.armL.rotation.z, spreadL, L, dt);
    this.armR.rotation.z = damp(this.armR.rotation.z, -spreadR, L, dt);
    const legRate = fast === 'legs' || s.trick ? 40 : L;
    this.legL.rotation.x = damp(this.legL.rotation.x, legL, legRate, dt);
    this.legR.rotation.x = damp(this.legR.rotation.x, legR, legRate, dt);
  }
}
