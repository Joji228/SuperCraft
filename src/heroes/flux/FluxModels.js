// Models for Flux's forms: Kai (a kid in a green jacket over a white "10" tee, with the
// glowing Prism band on his wrist) and the five aliens. One blocky rig per form, all
// sharing the same poses. Same interface as HeroModel (root, head, eyes, punch(),
// update()) plus handR for projectiles.
import * as THREE from 'three';
import { damp } from '../../util/math.js';

const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const glow = (color) => new THREE.MeshBasicMaterial({ color });

function part(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

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

// a tiny pixel "10" for the back of Kai's tee
function tenTexture() {
  return pixelTexture(16, 16, (g) => {
    g.fillStyle = '#f4f4f4';
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#1d1d1d';
    g.fillRect(4, 4, 2, 8); // 1
    g.fillRect(3, 5, 1, 1);
    g.fillRect(8, 4, 5, 2); // 0
    g.fillRect(8, 10, 5, 2);
    g.fillRect(8, 4, 2, 8);
    g.fillRect(11, 4, 2, 8);
  });
}

function circuitTexture() {
  return pixelTexture(16, 16, (g) => {
    g.fillStyle = '#111418';
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#7dff8a';
    g.fillRect(2, 0, 1, 7);
    g.fillRect(2, 7, 6, 1);
    g.fillRect(8, 7, 1, 9);
    g.fillRect(12, 2, 1, 10);
    g.fillRect(12, 12, 3, 1);
    g.fillRect(5, 12, 1, 4);
  });
}

/**
 * Build the parts for a form. Returns { torso, head, arms: [L, R, (L2, R2)], legs, extras }.
 * Sizes are in metres; the pivot (hips) is at `hip` above the feet.
 */
function build(kind, pivot) {
  const S = {};
  const add = (m) => (pivot.add(m), m);
  const armGroup = (side, x, y, len, w, matUpper, matHand, handSize = 1) => {
    const g = new THREE.Group();
    g.position.set(side * x, y, 0);
    g.add(part(w, len, w, matUpper, 0, -len / 2, 0));
    g.add(part(w * 1.1 * handSize, w * 1.1 * handSize, w * 1.1 * handSize, matHand, 0, -len - w * 0.4, 0));
    const hand = new THREE.Object3D();
    hand.position.set(0, -len - w * 0.6, 0);
    g.add(hand);
    pivot.add(g);
    g.userData.hand = hand;
    return g;
  };
  const legGroup = (side, x, len, w, matLeg, matFoot) => {
    const g = new THREE.Group();
    g.position.set(side * x, -0.02, 0);
    g.add(part(w, len, w * 1.05, matLeg, 0, -len / 2, 0));
    g.add(part(w * 1.05, 0.2, w * 1.3, matFoot, 0, -len + 0.06, 0.05));
    pivot.add(g);
    return g;
  };
  const headGroup = (y) => {
    const h = new THREE.Group();
    h.position.set(0, y, 0);
    pivot.add(h);
    return h;
  };
  const band = glow(0x8fe36a);

  switch (kind) {
    case 'human': {
      S.hip = 0.68; // leg length + foot
      const skin = mat(0xe2a77e), jacket = mat(0x2f8f3a), tee = mat(0xf4f4f4), stripe = mat(0x1d1d1d), pants = mat(0x8a7a55), shoe = mat(0xf4f4f4), hair = mat(0x5a3a22);
      const back = mat(0xffffff, { map: tenTexture() });
      add(part(0.5, 0.62, 0.28, [jacket, jacket, jacket, jacket, tee, back], 0, 0.31, 0));
      add(part(0.08, 0.6, 0.02, stripe, 0, 0.31, 0.15)); // the stripe down the tee
      add(part(0.12, 0.6, 0.02, jacket, -0.19, 0.31, 0.15)); // open jacket edges
      add(part(0.12, 0.6, 0.02, jacket, 0.19, 0.31, 0.15));
      S.head = headGroup(0.62);
      S.head.add(part(0.42, 0.42, 0.4, skin, 0, 0.21, 0));
      S.head.add(part(0.46, 0.14, 0.44, hair, 0, 0.42, -0.02));
      S.head.add(part(0.46, 0.18, 0.12, hair, 0, 0.32, -0.18));
      S.head.add(part(0.06, 0.04, 0.02, mat(0x2d7a3a), -0.09, 0.24, 0.21));
      S.head.add(part(0.06, 0.04, 0.02, mat(0x2d7a3a), 0.09, 0.24, 0.21));
      S.armL = armGroup(1, 0.33, 0.58, 0.48, 0.17, jacket, skin);
      S.armR = armGroup(-1, 0.33, 0.58, 0.48, 0.17, jacket, skin);
      const b = part(0.2, 0.08, 0.2, band, 0, -0.42, 0); // the Prism band, left wrist
      b.castShadow = false;
      S.armL.add(b);
      S.band = b;
      S.legL = legGroup(1, 0.12, 0.62, 0.2, pants, shoe);
      S.legR = legGroup(-1, 0.12, 0.62, 0.2, pants, shoe);
      break;
    }
    case 'cinder': {
      S.hip = 0.86; // leg length + foot
      const rock = mat(0x3a2a24), lava = glow(0xff7a2a), hot = glow(0xffe28a);
      add(part(0.6, 0.78, 0.36, rock, 0, 0.39, 0));
      add(part(0.06, 0.5, 0.02, lava, -0.14, 0.42, 0.19));
      add(part(0.2, 0.05, 0.02, lava, 0.12, 0.5, 0.19));
      add(part(0.06, 0.3, 0.02, lava, 0.2, 0.25, -0.19));
      const em = part(0.14, 0.14, 0.03, band, 0, 0.58, 0.19);
      em.castShadow = false;
      add(em);
      S.head = headGroup(0.78);
      S.head.add(part(0.44, 0.38, 0.42, lava, 0, 0.19, 0));
      S.flame = new THREE.Group();
      S.flame.add(part(0.36, 0.3, 0.34, hot, 0, 0.5, 0));
      S.flame.add(part(0.22, 0.24, 0.2, hot, 0.05, 0.75, -0.03));
      S.flame.add(part(0.12, 0.18, 0.12, lava, -0.08, 0.92, 0.02));
      S.flame.add(part(0.3, 0.42, 0.3, lava, 0, 0.62, -0.06));
      S.flame.add(part(0.14, 0.3, 0.14, hot, -0.1, 1.02, -0.08));
      S.flame.add(part(0.1, 0.22, 0.1, lava, 0.12, 1.0, 0.05));
      S.head.add(S.flame);
      S.head.add(part(0.08, 0.05, 0.02, glow(0xffffff), -0.1, 0.22, 0.22));
      S.head.add(part(0.08, 0.05, 0.02, glow(0xffffff), 0.1, 0.22, 0.22));
      S.armL = armGroup(1, 0.4, 0.72, 0.6, 0.22, rock, lava);
      S.armR = armGroup(-1, 0.4, 0.72, 0.6, 0.22, rock, lava);
      // flames licking off his shoulders and fists
      S.fires = [];
      for (const [arm, side] of [[S.armL, 1], [S.armR, -1]]) {
        const f1 = part(0.16, 0.26, 0.16, hot, 0.02 * side, 0.12, 0);
        const f2 = part(0.14, 0.2, 0.14, lava, 0, -0.62, 0);
        arm.add(f1, f2);
        S.fires.push(f1, f2);
      }
      S.legL = legGroup(1, 0.15, 0.8, 0.26, rock, rock);
      S.legR = legGroup(-1, 0.15, 0.8, 0.26, rock, rock);
      break;
    }
    case 'brawl': {
      S.hip = 1.14; // leg length + foot
      const red = mat(0xb83a2e), dred = mat(0x9a2e24), black = mat(0x1d1d1d), white = mat(0xf0f0f0);
      add(part(1.0, 0.95, 0.56, red, 0, 0.5, 0));
      add(part(0.6, 0.4, 0.04, black, 0, 0.62, 0.29)); // suit panel
      add(part(0.08, 0.95, 0.04, white, 0, 0.5, 0.3));
      const em = part(0.16, 0.16, 0.03, band, 0, 0.7, 0.31);
      em.castShadow = false;
      add(em);
      add(part(0.86, 0.22, 0.5, black, 0, -0.02, 0)); // waistband
      S.head = headGroup(0.98);
      S.head.add(part(0.46, 0.42, 0.44, red, 0, 0.21, 0.04));
      for (const [x, y] of [[-0.11, 0.3], [0.11, 0.3], [-0.11, 0.18], [0.11, 0.18]]) {
        const e = part(0.08, 0.06, 0.02, glow(0xffd34d), x, y, 0.27);
        e.castShadow = false;
        S.head.add(e);
      }
      S.armL = armGroup(1, 0.64, 0.92, 0.66, 0.3, red, dred, 1.3);
      S.armR = armGroup(-1, 0.64, 0.92, 0.66, 0.3, red, dred, 1.3);
      S.armL2 = armGroup(1, 0.6, 0.55, 0.6, 0.27, red, dred, 1.3); // lower pair
      S.armR2 = armGroup(-1, 0.6, 0.55, 0.6, 0.27, red, dred, 1.3);
      S.legL = legGroup(1, 0.24, 1.08, 0.38, black, dred);
      S.legR = legGroup(-1, 0.24, 1.08, 0.38, black, dred);
      break;
    }
    case 'blitz': {
      S.hip = 0.99; // leg length + foot
      const blue = mat(0x1d2a4a), cyan = glow(0x4dc3ff), black = mat(0x111111), stripe = mat(0x2f3f6a);
      add(part(0.5, 0.66, 0.34, blue, 0, 0.33, 0));
      add(part(0.24, 0.5, 0.02, cyan, 0, 0.36, 0.18));
      const em = part(0.12, 0.12, 0.03, band, 0, 0.5, 0.19);
      em.castShadow = false;
      add(em);
      S.head = headGroup(0.66);
      S.head.add(part(0.4, 0.38, 0.6, blue, 0, 0.2, 0.08)); // long helmet
      S.head.add(part(0.36, 0.14, 0.04, cyan, 0, 0.24, 0.39)); // visor
      S.head.add(part(0.3, 0.1, 0.5, stripe, 0, 0.42, 0.02));
      S.tail = new THREE.Group();
      S.tail.position.set(0, 0.1, -0.18);
      S.tail.add(part(0.16, 0.16, 0.8, blue, 0, 0, -0.4));
      S.tail.add(part(0.1, 0.1, 0.4, cyan, 0, 0, -0.95));
      pivot.add(S.tail);
      S.armL = armGroup(1, 0.32, 0.6, 0.48, 0.15, blue, black);
      S.armR = armGroup(-1, 0.32, 0.6, 0.48, 0.15, blue, black);
      S.legL = legGroup(1, 0.13, 0.78, 0.2, blue, black);
      S.legR = legGroup(-1, 0.13, 0.78, 0.2, blue, black);
      // wheel feet
      for (const leg of [S.legL, S.legR]) leg.add(part(0.22, 0.26, 0.26, black, 0, -0.84, 0));
      break;
    }
    case 'shard': {
      S.hip = 0.86; // leg length + foot
      const crystal = mat(0x3fd096, { emissive: 0x0c3a28 }), light = mat(0x5ff2b4, { emissive: 0x135c42 }), tip = mat(0xbfffe6, { emissive: 0x2a6a55 });
      add(part(0.64, 0.82, 0.38, crystal, 0, 0.41, 0));
      add(part(0.4, 0.5, 0.04, light, 0, 0.45, 0.2));
      const em = part(0.14, 0.14, 0.03, band, 0, 0.6, 0.22);
      em.castShadow = false;
      add(em);
      for (const s of [1, -1]) {
        const spike = part(0.16, 0.42, 0.16, tip, s * 0.38, 0.95, -0.02);
        spike.rotation.z = -s * 0.5;
        add(spike);
      }
      S.head = headGroup(0.82);
      S.head.add(part(0.44, 0.44, 0.42, light, 0, 0.22, 0));
      const crest = part(0.14, 0.34, 0.3, tip, 0, 0.56, -0.02);
      S.head.add(crest);
      S.head.add(part(0.08, 0.06, 0.02, mat(0x0d4a35), -0.1, 0.24, 0.22));
      S.head.add(part(0.08, 0.06, 0.02, mat(0x0d4a35), 0.1, 0.24, 0.22));
      S.armL = armGroup(1, 0.42, 0.76, 0.62, 0.22, crystal, tip);
      S.armR = armGroup(-1, 0.42, 0.76, 0.62, 0.22, crystal, tip);
      S.legL = legGroup(1, 0.16, 0.8, 0.26, crystal, light);
      S.legR = legGroup(-1, 0.16, 0.8, 0.26, crystal, light);
      break;
    }
    case 'glitch': {
      S.hip = 0.78; // leg length + foot
      const goo = mat(0xffffff, { map: circuitTexture() }), dark = mat(0x111418), green = glow(0x7dff8a);
      add(part(0.52, 0.66, 0.32, goo, 0, 0.33, 0));
      const em = part(0.12, 0.12, 0.03, band, 0, 0.52, 0.17);
      em.castShadow = false;
      add(em);
      S.head = headGroup(0.66);
      S.head.add(part(0.44, 0.44, 0.42, goo, 0, 0.22, 0));
      const eye = part(0.2, 0.2, 0.04, green, 0, 0.24, 0.22);
      eye.castShadow = false;
      S.head.add(eye);
      S.armL = armGroup(1, 0.34, 0.6, 0.52, 0.16, goo, dark);
      S.armR = armGroup(-1, 0.34, 0.6, 0.52, 0.16, goo, dark);
      S.legL = legGroup(1, 0.13, 0.72, 0.2, goo, dark);
      S.legR = legGroup(-1, 0.13, 0.72, 0.2, goo, dark);
      break;
    }
  }
  return S;
}

export class FluxModel {
  constructor(kind) {
    this.kind = kind;
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.root.add(this.pivot);
    const S = build(kind, this.pivot);
    Object.assign(this, S);
    this.hipY = S.hip;
    this.pivot.position.y = S.hip;
    this.handR = this.armR.userData.hand;
    this.handL = this.armL.userData.hand;
    this.eyes = new THREE.Group(); // interface compatibility (no laser eyes)
    this.eyes.add(new THREE.Object3D(), new THREE.Object3D());
    this.head.add(this.eyes);
    this.punchT = 9;
    this.punchCombo = 1;
    this.walkPhase = 0;
    this.time = 0;
    this.tilt = 0;
    this.twist = 0;
    this.crouch = 0;
    this.yaw = 0;
    this.spin = 0;
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
   * s: { pos, yaw, mode, speed, hSpeed, vy, carrying, landT, sprinting, swimming,
   *      special (seconds since the right-mouse power started), shotT, warn (band flashing) }
   */
  update(dt, s) {
    this.time += dt;
    this.root.position.copy(s.pos);
    this.yaw = s.yaw;
    this.root.rotation.set(0, s.yaw, 0);
    const k = this.kind;

    let tilt = 0, twist = 0, crouch = 0, spinY = 0;
    let armL = 0, armR = 0, spreadL = 0.08, spreadR = 0.08, legL = 0, legR = 0;
    let arm2 = 0;

    if (s.climbing) {
      // hand over hand up a ladder
      const c = this.time * 8;
      armL = -2.5 + Math.sin(c) * 0.45;
      armR = -2.5 - Math.sin(c) * 0.45;
      legL = -0.5 - Math.sin(c) * 0.45;
      legR = -0.5 + Math.sin(c) * 0.45;
      spreadL = spreadR = 0.12;
    } else if (s.swimming) {
      // front crawl
      const c = this.time * 5;
      tilt = 1.35;
      armL = -1.5 + Math.sin(c) * 1.4;
      armR = -1.5 - Math.sin(c) * 1.4;
      legL = Math.sin(c * 2) * 0.3;
      legR = -Math.sin(c * 2) * 0.3;
    } else if (s.mode === 'fly') {
      // riding his own flames
      const fwd = Math.max(0, (s.vx ?? 0) * Math.sin(this.yaw) + (s.vz ?? 0) * Math.cos(this.yaw));
      const move = Math.min(1, Math.hypot(fwd, s.vy) / 12);
      tilt = Math.min(Math.atan2(fwd, s.vy), 1.5) * move;
      armL = armR = 0.3 * move;
      spreadL = spreadR = 0.3 * (1 - move) + 0.1;
      legL = 0.05;
      legR = -0.05;
    } else if (s.mode === 'air') {
      armL = armR = -0.7;
      spreadL = spreadR = 0.45;
      legL = -0.6;
      legR = 0.2;
      arm2 = -0.4;
    } else if (s.landT > 0) {
      crouch = 0.4;
      tilt = 0.45;
      armR = -0.6;
      armL = 0.5;
      spreadL = spreadR = 0.4;
      legL = -1.1;
      legR = 0.5;
      arm2 = -0.6;
    } else {
      const hs = s.hSpeed;
      const kk = Math.min(1, hs / 6);
      const fast = k === 'blitz' && hs > 22;
      this.walkPhase += dt * (fast ? 4 + hs * 0.35 : 4 + hs * 0.8);
      const sw = Math.sin(this.walkPhase) * (0.35 + 0.5 * Math.min(1, hs / 12)) * kk;
      armL = sw;
      armR = -sw;
      legL = -sw;
      legR = sw;
      arm2 = -sw * 0.8;
      tilt = Math.min(0.3, hs * 0.02);
      if (fast) {
        // super speed: leaning way forward, arms swept back, legs a blur
        tilt = 0.75;
        armL = armR = 0.9;
        spreadL = spreadR = 0.15;
        legL = Math.sin(this.walkPhase * 2) * 1.1;
        legR = -legL;
      }
      if (kk < 0.05) {
        const b = Math.sin(this.time * 2) * 0.03;
        armL = b;
        armR = -b;
        spreadL = spreadR = k === 'brawl' ? 0.25 : 0.1;
        if (k === 'blitz') tilt = 0.25; // always leaning, ready to go
      }
    }

    if (s.carrying) {
      armL = armR = -2.9;
      spreadL = spreadR = 0.2;
    }

    // right-mouse power poses
    const sp = s.special ?? 9;
    if (sp < 0.7) {
      if (k === 'brawl') {
        // all four fists up, then down into the ground
        if (sp < 0.25) {
          armL = armR = arm2 = -2.9;
        } else {
          armL = armR = arm2 = -0.5;
          crouch = 0.5;
          tilt = 0.6;
        }
      } else if (k === 'blitz') {
        spinY = (sp / 0.7) * Math.PI * 6; // the cyclone: spinning on the spot
        armL = armR = -1.4;
        spreadL = spreadR = 1.2;
      } else if (k === 'shard') {
        armL = armR = -0.4;
        spreadL = spreadR = 0.4;
        crouch = 0.3;
        tilt = 0.5;
      } else if (k === 'glitch') {
        armL = armR = -0.6;
        spreadL = spreadR = 1.4;
      }
    }
    if (s.held) {
      // holding a stream (Cinder's flamethrower): both arms forward
      armL = armR = -(Math.PI / 2 + this.tilt + (s.aimPitch || 0));
      spreadL = spreadR = 0.05;
    }
    if ((s.shotT ?? 9) < 0.2) {
      armR = -(Math.PI / 2 + this.tilt + (s.aimPitch || 0));
      spreadR = 0.03;
    }

    // punches (Brawl alternates all four fists)
    this.punchT += dt;
    let fastArm = '';
    const dur = k === 'blitz' ? 0.14 : 0.24;
    if (this.punchT < dur) {
      const q = Math.sin((this.punchT / dur) * Math.PI);
      const reach = this.punchCombo === 3 ? -2.5 : -1.6;
      if (this.punchCombo === 2) {
        armL = reach * q;
        fastArm = 'L';
      } else {
        armR = reach * q;
        fastArm = 'R';
      }
      if (k === 'brawl') arm2 = -1.5 * q;
      twist = (this.punchCombo === 2 ? -0.3 : 0.3) * q;
    }

    this.tilt = damp(this.tilt, tilt, s.landT > 0 ? 25 : 9, dt);
    this.twist = damp(this.twist, twist, 12, dt);
    this.crouch = damp(this.crouch, crouch, 12, dt);
    this.pivot.position.y = this.hipY - this.crouch;
    this.pivot.rotation.set(this.tilt, this.twist + spinY, 0, 'YXZ');
    this.head.rotation.x = damp(this.head.rotation.x, -Math.min(this.tilt, 1.4) * 0.6, 10, dt);

    const R = 12;
    this.armL.rotation.x = damp(this.armL.rotation.x, armL, fastArm === 'L' ? 60 : R, dt);
    this.armR.rotation.x = damp(this.armR.rotation.x, armR, fastArm === 'R' || (s.shotT ?? 9) < 0.2 ? 60 : R, dt);
    this.armL.rotation.z = damp(this.armL.rotation.z, spreadL, R, dt);
    this.armR.rotation.z = damp(this.armR.rotation.z, -spreadR, R, dt);
    if (this.armL2) {
      this.armL2.rotation.x = damp(this.armL2.rotation.x, arm2, 30, dt);
      this.armR2.rotation.x = damp(this.armR2.rotation.x, k === 'brawl' && fastArm ? -arm2 * 0.3 : arm2, 30, dt);
      this.armL2.rotation.z = damp(this.armL2.rotation.z, 0.35, R, dt);
      this.armR2.rotation.z = damp(this.armR2.rotation.z, -0.35, R, dt);
    }
    this.legL.rotation.x = damp(this.legL.rotation.x, legL, k === 'blitz' ? 30 : R, dt);
    this.legR.rotation.x = damp(this.legR.rotation.x, legR, k === 'blitz' ? 30 : R, dt);
    if (this.tail) this.tail.rotation.x = damp(this.tail.rotation.x, -tilt * 0.8 + Math.sin(this.time * 3) * 0.1, 8, dt);
    if (this.flame) {
      // Cinder's head and the flames on his arms flicker
      this.flame.scale.set(1 + Math.random() * 0.15, 0.8 + Math.random() * 0.5, 1 + Math.random() * 0.15);
      for (const f of this.fires || []) f.scale.set(0.8 + Math.random() * 0.4, 0.7 + Math.random() * 0.7, 0.8 + Math.random() * 0.4);
    }
    if (this.band) {
      // the Prism band glows green, or flashes red when it's about to time out / recharging
      const on = s.warn ? Math.floor(this.time * 6) % 2 === 0 : true;
      this.band.material.color.setHex(s.recharging ? 0xff3a2a : on ? 0x8fe36a : 0xff3a2a);
    }
  }
}
