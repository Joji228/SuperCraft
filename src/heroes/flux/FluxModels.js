// Models for Flux's forms: Deka (a kid in a green jacket over a white "10" tee, with the
// glowing Fluxitrix on his wrist) and his aliens. One blocky rig per form, all
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

// a tiny pixel "10" for the back of Deka's tee
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
      const b = part(0.2, 0.08, 0.2, band, 0, -0.42, 0); // the Fluxitrix, left wrist
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
    case 'rollo': {
      S.hip = 0.62;
      const plate = mat(0xf2c94c), plateD = mat(0xc99a2e), skin = mat(0xe8e8e8), dark = mat(0x3a3d45);
      add(part(0.66, 0.8, 0.5, skin, 0, 0.4, 0));
      // the armoured shell he curls up in: plates over back, shoulders and front
      add(part(0.98, 0.98, 0.5, plate, 0, 0.5, -0.2));
      add(part(1.0, 0.1, 0.52, plateD, 0, 0.72, -0.2));
      add(part(1.0, 0.1, 0.52, plateD, 0, 0.36, -0.2));
      add(part(0.6, 0.5, 0.06, plate, 0, 0.5, 0.27));
      const em = part(0.16, 0.16, 0.03, band, 0, 0.55, 0.31);
      em.castShadow = false;
      add(em);
      S.head = headGroup(0.82);
      S.head.add(part(0.4, 0.34, 0.38, skin, 0, 0.17, 0.08));
      S.head.add(part(0.46, 0.2, 0.46, plate, 0, 0.36, 0.04));
      S.head.add(part(0.07, 0.05, 0.02, dark, -0.09, 0.2, 0.28));
      S.head.add(part(0.07, 0.05, 0.02, dark, 0.09, 0.2, 0.28));
      S.armL = armGroup(1, 0.58, 0.78, 0.7, 0.2, skin, plate);
      S.armR = armGroup(-1, 0.58, 0.78, 0.7, 0.2, skin, plate);
      S.legL = legGroup(1, 0.2, 0.56, 0.26, skin, plate);
      S.legR = legGroup(-1, 0.2, 0.56, 0.26, skin, plate);
      // rolled up: a chunky armoured ball (shown instead of his body)
      S.shell = new THREE.Group();
      const b1 = part(1.5, 1.5, 1.5, plate);
      const b2 = part(1.62, 1.2, 1.2, plateD);
      const b3 = part(1.2, 1.62, 1.2, plateD);
      const b4 = part(1.2, 1.2, 1.62, plate);
      const stripe = part(1.56, 0.18, 1.56, mat(0x2a2a2a));
      const emb = part(0.3, 0.3, 0.06, band, 0, 0, 0.82);
      // two cubes turned 45 degrees round the ball make it read as round, not boxy
      const r1 = part(1.42, 1.42, 1.42, plate);
      r1.rotation.set(0, Math.PI / 4, 0);
      const r2 = part(1.42, 1.42, 1.42, plateD);
      r2.rotation.set(Math.PI / 4, 0, 0);
      const ring = part(0.18, 1.66, 1.66, mat(0x2a2a2a)); // the seam the ball rolls on
      S.shell.add(b1, b2, b3, b4, r1, r2, stripe, ring, emb);
      S.shell.visible = false;
      break;
    }
    case 'titanor': {
      S.hip = 1.2;
      const hide = mat(0xa07a4a), dark = mat(0x7a5a34), belly = mat(0xd8c08a), black = mat(0x1d1d1d);
      add(part(1.02, 1.1, 0.7, hide, 0, 0.55, 0));
      add(part(0.6, 0.86, 0.06, belly, 0, 0.5, 0.36));
      add(part(0.9, 0.24, 0.66, black, 0, 0.02, 0)); // belt
      const em = part(0.18, 0.18, 0.03, band, 0, 0.04, 0.35);
      em.castShadow = false;
      add(em);
      for (let i = 0; i < 4; i++) add(part(0.16, 0.2, 0.2, dark, 0, 0.95 - i * 0.24, -0.4)); // back plates
      S.tail = new THREE.Group();
      S.tail.position.set(0, 0.05, -0.35);
      S.tail.add(part(0.4, 0.36, 1.0, hide, 0, -0.1, -0.5));
      S.tail.add(part(0.26, 0.24, 0.7, dark, 0, -0.2, -1.2));
      pivot.add(S.tail);
      S.head = headGroup(1.1);
      S.head.add(part(0.56, 0.5, 0.62, hide, 0, 0.25, 0.08));
      S.head.add(part(0.6, 0.12, 0.3, dark, 0, 0.48, 0.12)); // brow ridge
      S.head.add(part(0.46, 0.08, 0.04, mat(0xf4f4f4), 0, 0.08, 0.4)); // teeth
      for (const x of [-0.14, 0.14]) {
        const e = part(0.08, 0.06, 0.02, glow(0xffd34d), x, 0.34, 0.4);
        e.castShadow = false;
        S.head.add(e);
      }
      S.armL = armGroup(1, 0.68, 1.0, 0.82, 0.32, hide, dark, 1.25);
      S.armR = armGroup(-1, 0.68, 1.0, 0.82, 0.32, hide, dark, 1.25);
      S.legL = legGroup(1, 0.28, 1.14, 0.4, dark, hide);
      S.legR = legGroup(-1, 0.28, 1.14, 0.4, dark, hide);
      break;
    }
    case 'frostmoth': {
      S.hip = 0.86;
      const navy = mat(0x2a4478), deep = mat(0x1a2c50), ice = glow(0x7dffef);
      const wingMat = new THREE.MeshLambertMaterial({ color: 0x9fe8ff, emissive: 0x1c4a5a, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
      add(part(0.56, 0.84, 0.34, navy, 0, 0.42, 0));
      add(part(0.3, 0.6, 0.04, deep, 0, 0.42, 0.18));
      const em = part(0.14, 0.14, 0.03, band, 0, 0.62, 0.2);
      em.castShadow = false;
      add(em);
      S.head = headGroup(0.84);
      S.head.add(part(0.42, 0.42, 0.4, navy, 0, 0.21, 0));
      for (const x of [-0.11, 0.11]) {
        const e = part(0.12, 0.08, 0.02, ice, x, 0.24, 0.21);
        e.castShadow = false;
        S.head.add(e);
      }
      for (const x of [-0.12, 0.12]) S.head.add(part(0.04, 0.3, 0.04, deep, x, 0.55, 0.05)); // antennae
      // big moth wings on his back (folded like a cloak when he's on the ground)
      S.wings = [];
      for (const side of [1, -1]) {
        const w = new THREE.Group();
        w.position.set(side * 0.1, 0.72, -0.2);
        const m1 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.5, 0.04), wingMat);
        m1.position.set(side * 0.6, -0.2, 0);
        const m2 = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.05), ice);
        m2.position.set(side * 0.5, 0.25, 0.01);
        w.add(m1, m2);
        w.userData.side = side;
        pivot.add(w);
        S.wings.push(w);
      }
      S.armL = armGroup(1, 0.36, 0.76, 0.6, 0.18, navy, deep);
      S.armR = armGroup(-1, 0.36, 0.76, 0.6, 0.18, navy, deep);
      S.legL = legGroup(1, 0.14, 0.8, 0.22, navy, deep);
      S.legR = legGroup(-1, 0.14, 0.8, 0.22, navy, deep);
      break;
    }
    case 'wraith': {
      // a gaunt, hunched ghost: one huge eye, dark bands wrapped round a see-through
      // body, long clawed arms, and a tail of fading wisps instead of legs
      S.hip = 1.0;
      const ghost = new THREE.MeshLambertMaterial({ color: 0xd9d2ff, emissive: 0x3a2c7a, transparent: true, opacity: 0.82 });
      const pale = new THREE.MeshLambertMaterial({ color: 0xf2eeff, emissive: 0x4a3c8a, transparent: true, opacity: 0.9 });
      const band = new THREE.MeshLambertMaterial({ color: 0x2a1a48, emissive: 0x120828, transparent: true, opacity: 0.95 });
      const socket = new THREE.MeshBasicMaterial({ color: 0x14062a });
      const eyeGlow = glow(0xb06bff);
      // torso: broad hunched shoulders tapering to a narrow waist
      add(part(0.66, 0.42, 0.38, ghost, 0, 0.66, -0.02));
      add(part(0.5, 0.34, 0.32, ghost, 0, 0.3, 0));
      add(part(0.36, 0.3, 0.26, ghost, 0, 0.02, 0.01));
      // the dark wrappings, slightly askew
      for (const [y, w, rz] of [[0.78, 0.7, 0.12], [0.52, 0.6, -0.1], [0.26, 0.54, 0.14], [0.04, 0.4, -0.12]]) {
        const b = part(w, 0.07, 0.42, band, 0, y, 0);
        b.rotation.z = rz;
        add(b);
      }
      const em = part(0.12, 0.12, 0.03, glow(0x8fe36a), 0.14, 0.66, 0.2);
      em.castShadow = false;
      add(em);
      // ragged shoulder spines
      for (const side of [1, -1]) {
        for (let k = 0; k < 3; k++) {
          const sp = part(0.07, 0.26 - k * 0.05, 0.07, band, side * (0.24 + k * 0.08), 0.92 + k * 0.02, -0.08 - k * 0.04);
          sp.rotation.z = -side * (0.4 + k * 0.25);
          add(sp);
        }
      }
      // head: long, pushed forward, one big glowing eye in a dark socket
      S.head = headGroup(0.86);
      S.head.position.z = 0.1;
      S.head.add(part(0.4, 0.5, 0.42, pale, 0, 0.25, 0.02));
      S.head.add(part(0.44, 0.1, 0.46, band, 0, 0.44, 0.0)); // brow band
      S.head.add(part(0.06, 0.5, 0.46, band, 0, 0.25, -0.01)); // a stripe down the skull
      const sock = part(0.24, 0.22, 0.03, socket, 0, 0.27, 0.235);
      sock.castShadow = false;
      S.head.add(sock);
      const eye = part(0.12, 0.12, 0.02, eyeGlow, 0, 0.27, 0.25);
      eye.castShadow = false;
      S.head.add(eye);
      S.eyeGlow = eye;
      S.head.add(part(0.22, 0.04, 0.02, socket, 0, 0.08, 0.235)); // a thin grin
      for (const x of [-0.07, 0, 0.07]) S.head.add(part(0.02, 0.06, 0.02, pale, x, 0.08, 0.245));
      // long thin arms ending in three hooked claws
      S.armL = armGroup(1, 0.42, 0.82, 0.78, 0.13, ghost, pale);
      S.armR = armGroup(-1, 0.42, 0.82, 0.78, 0.13, ghost, pale);
      for (const arm of [S.armL, S.armR]) {
        for (const [x, z] of [[-0.05, 0.05], [0.05, 0.05], [0, -0.05]]) {
          const c = part(0.035, 0.22, 0.035, band, x, -0.98, z + 0.03);
          c.rotation.x = 0.35;
          arm.add(c);
        }
        arm.add(part(0.15, 0.07, 0.15, band, 0, -0.42, 0)); // a band at the wrist
      }
      // no legs (kept tiny and hidden so the shared poses still work)
      S.legL = legGroup(1, 0.1, 0.1, 0.05, ghost, ghost);
      S.legR = legGroup(-1, 0.1, 0.1, 0.05, ghost, ghost);
      S.legL.visible = S.legR.visible = false;
      // the wispy tail: a chain of fading segments that sways behind him
      S.wisp = [];
      let parent = pivot;
      let y = -0.12;
      for (let k = 0; k < 5; k++) {
        const seg = new THREE.Group();
        seg.position.set(0, y, k === 0 ? 0 : -0.04);
        const m = new THREE.MeshLambertMaterial({ color: 0xd9d2ff, emissive: 0x3a2c7a, transparent: true, opacity: 0.8 - k * 0.13 });
        const w = 0.34 - k * 0.06;
        seg.add(part(w, 0.26, w * 0.8, m, 0, -0.13, 0));
        if (k % 2 === 0) seg.add(part(w + 0.04, 0.05, w * 0.8 + 0.04, band, 0, -0.04, 0));
        parent.add(seg);
        S.wisp.push(seg);
        parent = seg;
        y = -0.24;
      }
      // little lights orbiting him
      S.orbs = [];
      for (let k = 0; k < 3; k++) {
        const o = part(0.07, 0.07, 0.07, eyeGlow);
        o.castShadow = false;
        pivot.add(o);
        S.orbs.push(o);
      }
      S.fade = [ghost, pale, band];
      break;
    }
    case 'feral': {
      // a big-jawed, eyeless beast on all fours: heavy shoulders, quills down the back
      S.hip = 0.8;
      const fur = mat(0xff8f3a), dark = mat(0xc85a1e), belly = mat(0xffc07a), white = mat(0xf4f0e6), black = mat(0x24140c), gum = mat(0x8a2a22);
      // body: deep chest at the front, slimmer haunches at the back, sloping spine
      add(part(0.74, 0.64, 0.7, fur, 0, 0.16, 0.26));
      add(part(0.56, 0.48, 0.7, fur, 0, 0.08, -0.4));
      add(part(0.6, 0.12, 1.1, belly, 0, -0.17, -0.05));
      for (const [z, w] of [[0.4, 0.64], [0.05, 0.56], [-0.3, 0.5]]) add(part(w, 0.06, 0.12, dark, 0, 0.44 - (0.4 - z) * 0.1, z)); // stripes
      // quills raked back along the spine
      for (let k = 0; k < 6; k++) {
        const q = part(0.08, 0.32 - k * 0.03, 0.08, dark, (k % 2 ? 0.08 : -0.08), 0.56 - k * 0.04, 0.42 - k * 0.17);
        q.rotation.x = -0.7;
        add(q);
      }
      const em = part(0.03, 0.14, 0.14, glow(0x8fe36a), 0.38, 0.2, 0.3);
      em.castShadow = false;
      add(em);
      // head: broad and low, a huge mouth, gill slits where the eyes should be
      S.head = headGroup(0.26);
      S.head.position.z = 0.66;
      S.head.add(part(0.56, 0.3, 0.46, fur, 0, 0.12, 0.2));
      S.head.add(part(0.5, 0.1, 0.2, dark, 0, 0.28, 0.12)); // heavy brow
      for (const x of [-0.18, -0.09, 0.09, 0.18]) S.head.add(part(0.04, 0.03, 0.14, black, x, 0.27, 0.32)); // gill slits
      S.head.add(part(0.5, 0.05, 0.36, gum, 0, -0.04, 0.26));
      for (let k = 0; k < 5; k++) S.head.add(part(0.05, 0.08, 0.04, white, -0.2 + k * 0.1, -0.05, 0.44)); // upper fangs
      S.jaw = new THREE.Group();
      S.jaw.position.set(0, -0.06, 0.04);
      S.jaw.add(part(0.48, 0.12, 0.42, fur, 0, -0.06, 0.2));
      for (let k = 0; k < 4; k++) S.jaw.add(part(0.05, 0.07, 0.04, white, -0.15 + k * 0.1, 0.03, 0.38));
      S.head.add(S.jaw);
      // tail with a dark tuft
      S.tail = new THREE.Group();
      S.tail.position.set(0, 0.24, -0.76);
      S.tail.add(part(0.13, 0.13, 0.55, fur, 0, 0.08, -0.26));
      S.tail.add(part(0.2, 0.2, 0.2, dark, 0, 0.14, -0.58));
      pivot.add(S.tail);
      // thick front legs with big paws, leaner hind legs
      S.armL = armGroup(1, 0.3, 0.05, 0.74, 0.22, fur, black, 1.25);
      S.armR = armGroup(-1, 0.3, 0.05, 0.74, 0.22, fur, black, 1.25);
      S.armL.position.z = S.armR.position.z = 0.44;
      S.legL = legGroup(1, 0.22, 0.74, 0.18, dark, black);
      S.legR = legGroup(-1, 0.22, 0.74, 0.18, dark, black);
      S.legL.position.z = S.legR.position.z = -0.52;
      for (const arm of [S.armL, S.armR]) for (const x of [-0.08, 0, 0.08]) arm.add(part(0.04, 0.05, 0.1, white, x, -0.94, 0.16)); // claws
      break;
    }
    case 'reverb': {
      S.hip = 0.5;
      const white = mat(0xf4f8ff), black = mat(0x1d2a3a), blue = glow(0x4dc3ff);
      add(part(0.46, 0.5, 0.3, black, 0, 0.25, 0));
      add(part(0.26, 0.26, 0.04, white, 0, 0.27, 0.16));
      const em = part(0.1, 0.1, 0.03, band, 0, 0.27, 0.19);
      em.castShadow = false;
      add(em);
      for (const s of [1, -1]) add(part(0.16, 0.16, 0.16, white, s * 0.3, 0.46, 0)); // speaker shoulders
      S.head = headGroup(0.5);
      S.head.add(part(0.4, 0.34, 0.36, white, 0, 0.17, 0));
      S.head.add(part(0.3, 0.06, 0.02, black, 0, 0.12, 0.19)); // grille
      S.head.add(part(0.3, 0.04, 0.02, black, 0, 0.04, 0.19));
      for (const x of [-0.09, 0.09]) {
        const e = part(0.06, 0.05, 0.02, blue, x, 0.24, 0.19);
        e.castShadow = false;
        S.head.add(e);
      }
      S.armL = armGroup(1, 0.3, 0.42, 0.38, 0.12, black, white);
      S.armR = armGroup(-1, 0.3, 0.42, 0.38, 0.12, black, white);
      S.legL = legGroup(1, 0.1, 0.46, 0.14, black, white);
      S.legR = legGroup(-1, 0.1, 0.46, 0.14, black, white);
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
    if (S.shell) {
      S.shell.position.y = 0.78;
      this.root.add(S.shell);
    }
    this.scaleNow = 1;
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
      const move = Math.min(1, Math.hypot(fwd, s.vy) / 14);
      tilt = Math.min(Math.atan2(fwd, s.vy), 1.55) * move;
      // cruising: arms a little back; blazing: swept right back like a missile
      armL = armR = (s.boost ? 0.55 : 0.3) * move;
      spreadL = spreadR = (s.boost ? 0.08 : 0.22) * move + 0.4 * (1 - move);
      legL = 0.04 + Math.sin(this.time * 6) * 0.03 * (1 - move);
      legR = -0.04 - Math.sin(this.time * 6) * 0.03 * (1 - move);
      if (move < 0.25) {
        // hovering on the jet: arms out for balance, a gentle bob
        armL = armR = 0.15;
        spreadL = spreadR = 0.5;
        crouch = -0.06 + Math.sin(this.time * 3) * 0.06;
      }
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

    // per-alien extras
    const A = s.alien || {};
    if (k === 'feral' && s.mode !== 'fly') {
      tilt = A.wallClimb ? -1.35 : 0; // a beast on all fours stays level (or rears up a wall)
      if (A.wallClimb) {
        const c = this.time * 10;
        armL = -0.6 + Math.sin(c) * 0.6;
        armR = -0.6 - Math.sin(c) * 0.6;
      }
    }
    if (k === 'wraith') {
      // floating, hunched, claws reaching out and drifting, the tail sways
      legL = legR = 0.3;
      crouch = -0.25 + Math.sin(this.time * 2.2) * 0.08;
      tilt = 0.22 + (s.mode !== 'fly' ? Math.min(0.35, (s.hSpeed || 0) * 0.04) : 0);
      if (!s.carrying) {
        armL = -0.6 + Math.sin(this.time * 1.7) * 0.15;
        armR = -0.6 - Math.sin(this.time * 1.7) * 0.15;
        spreadL = spreadR = 0.38 + Math.sin(this.time * 1.3) * 0.06;
      }
    }
    if (k === 'titanor' && (s.hSpeed || 0) < 0.3) spreadL = spreadR = 0.28;

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
      } else if (k === 'rollo' || k === 'feral') {
        // bounce slam / great leap: tucked, then stretched out
        crouch = sp < 0.15 ? 0.4 : 0;
        armL = armR = sp < 0.15 ? 0.6 : -1.6;
        if (k === 'feral') tilt = sp < 0.15 ? 0.2 : -0.3;
      } else if (k === 'titanor') {
        armL = armR = -2.6; // roaring as he grows
        spreadL = spreadR = 0.9;
        tilt = -0.2;
      } else if (k === 'frostmoth' || k === 'wraith') {
        armL = armR = -1.2;
        spreadL = spreadR = 1.3;
      }
    }
    if (s.held && k === 'reverb') {
      // the scream: arms flung back, chest out
      armL = armR = 0.8;
      spreadL = spreadR = 0.8;
      tilt = -0.25;
    } else if (s.held) {
      // holding a stream (Cinder's flamethrower, Frostmoth's breath): both arms forward
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

    this.tilt = damp(this.tilt, tilt, s.landT > 0 ? 25 : s.mode === 'fly' ? 6 : 9, dt);
    // bank into turns when flying fast (Cinder), the way Sky and Forge do
    let yr = this.yaw - (this.prevYaw ?? this.yaw);
    yr = Math.atan2(Math.sin(yr), Math.cos(yr)) / Math.max(dt, 1e-4);
    this.prevYaw = this.yaw;
    const flat = s.mode === 'fly' ? Math.min(1, (s.hSpeed || 0) / 16) : 0;
    this.bank = damp(this.bank || 0, Math.max(-0.8, Math.min(0.8, -yr * 0.22)) * flat, 5, dt);
    this.twist = damp(this.twist, twist, 12, dt);
    this.crouch = damp(this.crouch, crouch, 12, dt);
    this.pivot.position.y = this.hipY - this.crouch;
    this.pivot.rotation.set(this.tilt, this.twist + spinY, this.bank, 'YXZ');
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
    if (this.wisp) {
      // the ghost tail ripples, trailing further back the faster he goes
      const drag = Math.min(1, (s.hSpeed || 0) / 10);
      this.wisp.forEach((seg, k) => {
        seg.rotation.x = 0.18 + drag * 0.35 + Math.sin(this.time * 2.6 - k * 0.8) * 0.16;
        seg.rotation.z = Math.sin(this.time * 2.1 - k * 0.9) * 0.18;
      });
      this.orbs.forEach((o, k) => {
        const a = this.time * 1.6 + (k * Math.PI * 2) / 3;
        o.position.set(Math.cos(a) * 0.62, 0.55 + Math.sin(this.time * 2 + k) * 0.25, Math.sin(a) * 0.62);
      });
      const pulse = 0.85 + Math.sin(this.time * 5) * 0.15;
      this.eyeGlow.scale.set(pulse, pulse, 1);
    }
    if (this.jaw) {
      // jaws snap open on a bite, and pant a little otherwise
      const bite = this.punchT < 0.24 ? Math.sin((this.punchT / 0.24) * Math.PI) : 0;
      this.jaw.rotation.x = damp(this.jaw.rotation.x, 0.08 + Math.sin(this.time * 6) * 0.04 + bite * 0.7, 25, dt);
    }
    if (this.flame) {
      // Cinder's head and the flames on his arms flicker
      this.flame.scale.set(1 + Math.random() * 0.15, 0.8 + Math.random() * 0.5, 1 + Math.random() * 0.15);
      for (const f of this.fires || []) f.scale.set(0.8 + Math.random() * 0.4, 0.7 + Math.random() * 0.7, 0.8 + Math.random() * 0.4);
    }
    // Rollo rolled up: the body hides inside a spinning armoured ball
    if (this.shell) {
      const rolling = !!A.rolling;
      this.shell.visible = rolling;
      this.pivot.visible = !rolling;
      // curling up pops the ball out from small to full size
      this.shellK = rolling ? damp(this.shellK ?? 0.4, 1, 18, dt) : 0.4;
      this.shell.scale.setScalar(this.shellK);
      if (rolling) this.shell.rotation.x += (A.rollSpeed || 0) * dt / 0.78;
    }
    // Titanor grows (and shrinks) smoothly
    const sc = A.grow || 1;
    if (Math.abs(this.scaleNow - sc) > 0.001) {
      this.scaleNow = damp(this.scaleNow, sc, 6, dt);
      this.root.scale.setScalar(this.scaleNow);
    }
    // Frostmoth's wings: folded like a cloak on the ground, beating in flight
    if (this.wings) {
      for (const w of this.wings) {
        const side = w.userData.side;
        const open = s.mode === 'fly' ? 1 : s.mode === 'air' ? 0.6 : 0.1;
        const beat = s.mode === 'fly' ? Math.sin(this.time * (s.boost ? 22 : 12)) * 0.6 : 0;
        w.rotation.y = damp(w.rotation.y, side * (-1.2 * (1 - open) + 0.15) + side * beat, 18, dt);
        w.rotation.z = side * 0.15;
      }
    }
    // see-through while phasing (a glowing, ethereal shimmer); nearly gone while invisible
    if (this.fade || A.phasing || this.fadeMats) {
      if (!this.fadeMats) {
        this.fadeMats = new Set();
        this.root.traverse((o) => o.material && !o.material.isMeshBasicMaterial && this.fadeMats.add(o.material));
        for (const m of this.fadeMats) {
          m.transparent = true;
          m.userData.baseOpacity = m.opacity;
          m.userData.baseEmissive = m.emissive ? m.emissive.clone() : null;
        }
        this.spirit = new THREE.Color(k === 'frostmoth' ? 0x7fe8ff : 0xb48cff);
      }
      const want = A.invisible ? 0.12 : A.phasing ? 0.3 : 1;
      this.opacity = damp(this.opacity ?? 1, want, 10, dt);
      // how far into the spirit form he is (0 solid .. 1 fully phased)
      const ph = Math.max(0, Math.min(1, (1 - this.opacity) / 0.7));
      const shimmer = ph * (0.75 + Math.sin(this.time * 9) * 0.25);
      for (const m of this.fadeMats) {
        m.opacity = m.userData.baseOpacity * this.opacity;
        m.depthWrite = this.opacity > 0.95;
        if (m.userData.baseEmissive) m.emissive.copy(m.userData.baseEmissive).lerp(this.spirit, shimmer);
      }
    }

    if (this.band) {
      // the Fluxitrix glows green, or flashes red when it's about to time out / recharging
      const on = s.warn ? Math.floor(this.time * 6) % 2 === 0 : true;
      this.band.material.color.setHex(s.recharging ? 0xff3a2a : on ? 0x8fe36a : 0xff3a2a);
    }
  }
}
