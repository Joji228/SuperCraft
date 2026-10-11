// Blocky people (civilians, thugs, bosses), drawn with a handful of InstancedMeshes
// so a hundred of them cost only a few draw calls.
import * as THREE from 'three';
import { Entity } from './Entity.js';
import { damp } from '../util/math.js';

const MAX = 220;

const SKINS = [0xf1c7a4, 0xe2a77e, 0xc68a62, 0x9a6440, 0x6e4528, 0xf6d8bf];
const HAIRS = [0x2b1d14, 0x5a3a22, 0x111111, 0xc9a35a, 0x8a4b2a, 0x9b9b9b];
const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22, 0xecf0f1, 0x1abc9c, 0xff6fa8, 0x34495e];
const PANTS = [0x2c3e50, 0x34495e, 0x5d4037, 0x1f3a5f, 0x424242, 0x7f8c8d, 0x3e2723];

export function randomLook(rng = Math.random) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  return { skin: pick(SKINS), hair: pick(HAIRS), shirt: pick(SHIRTS), pants: pick(PANTS), hat: null, scale: 0.92 + rng() * 0.14 };
}

export class Humanoid extends Entity {
  constructor(game, opts = {}) {
    const scale = opts.look?.scale ?? 1;
    super(game, { halfW: 0.3 * scale, height: 1.8 * scale, ...opts });
    this.look = opts.look || randomLook();
    this.scale = scale;
    this.pose = { armL: 0, armR: 0, legL: 0, legR: 0, spreadL: 0, spreadR: 0, tilt: 0, lift: 0, roll: 0 };
    this.walkPhase = Math.random() * 10;
    this.down = false; // lying on the ground (knocked out)
    this.downAmount = 0;
    this.armsUp = false;
    this.attackAnim = 0; // 0..1 swing
    this.carryable = true;
  }

  /** Walk-cycle pose from current horizontal speed. Subclasses can override parts afterwards. */
  animate(dt) {
    const p = this.pose;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += dt * (3 + hs * 1.6);
    const amp = Math.min(1, hs / 4) * 0.8;
    let sw = Math.sin(this.walkPhase) * amp;
    if (this.frozen > 0) sw = 0;
    let armL = sw, armR = -sw, spreadL = 0.05, spreadR = 0.05;
    if (this.armsUp) {
      armL = -2.8 + Math.sin(this.age * 12) * 0.25;
      armR = -2.8 - Math.sin(this.age * 12) * 0.25;
      spreadL = spreadR = 0.35;
    }
    if (this.carried) {
      armL = armR = -2.6;
      spreadL = spreadR = 0.4;
      sw = Math.sin(this.age * 8) * 0.4;
    }
    if (this.attackAnim > 0) {
      armR = -1.6 * Math.sin(this.attackAnim * Math.PI);
      this.attackAnim = Math.max(0, this.attackAnim - dt * 3);
    }
    if (this.frozen > 0) return; // statue
    const L = 16;
    p.armL = damp(p.armL, armL, L, dt);
    p.armR = damp(p.armR, armR, L, dt);
    p.legL = damp(p.legL, -sw, L, dt);
    p.legR = damp(p.legR, sw, L, dt);
    p.spreadL = damp(p.spreadL, spreadL, L, dt);
    p.spreadR = damp(p.spreadR, spreadR, L, dt);
    this.downAmount = damp(this.downAmount, this.down ? 1 : 0, 6, dt);
    p.tilt = -this.downAmount * Math.PI / 2;
  }

  update(dt) {
    super.update(dt);
    this.animate(dt);
  }
}

// ---------------------------------------------------------------------------

function faceTexture() {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 8;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 8, 8);
  g.fillStyle = '#1b1b1b';
  g.fillRect(1, 3, 2, 2);
  g.fillRect(5, 3, 2, 2);
  g.fillStyle = '#d9a090';
  g.fillRect(3, 6, 2, 1);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makePart(scene, geo, material, perEntity) {
  const m = new THREE.InstancedMesh(geo, material, MAX * perEntity);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * perEntity * 3), 3);
  m.castShadow = true;
  m.frustumCulled = false;
  m.count = 0;
  scene.add(m);
  return m;
}

const ICE = new THREE.Color(0x9fe3ff);
const WHITE = new THREE.Color(0xffffff);

export class HumanoidRenderer {
  constructor(scene) {
    const lam = () => new THREE.MeshLambertMaterial({ color: 0xffffff });
    const face = new THREE.MeshLambertMaterial({ map: faceTexture() });
    const plain = lam();
    // geometry translated so each part's pivot sits at the origin
    const head = new THREE.BoxGeometry(0.44, 0.44, 0.44).translate(0, 0.22, 0);
    const hair = new THREE.BoxGeometry(0.47, 0.13, 0.47).translate(0, 0.44, -0.01);
    const torso = new THREE.BoxGeometry(0.5, 0.66, 0.28).translate(0, 0.33, 0);
    const arm = new THREE.BoxGeometry(0.19, 0.64, 0.22).translate(0, -0.3, 0);
    const leg = new THREE.BoxGeometry(0.22, 0.7, 0.25).translate(0, -0.35, 0);
    this.head = makePart(scene, head, [plain, plain, plain, plain, face, plain], 1);
    this.hair = makePart(scene, hair, plain, 1);
    this.torso = makePart(scene, torso, plain, 1);
    this.arms = makePart(scene, arm, plain, 2);
    this.legs = makePart(scene, leg, plain, 2);
    this.parts = [this.head, this.hair, this.torso, this.arms, this.legs];

    this.root = new THREE.Matrix4();
    this.m = new THREE.Matrix4();
    this.local = new THREE.Matrix4();
    this.rot = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.c = new THREE.Color();
  }

  partMatrix(px, py, pz, rx, rz) {
    this.e.set(rx, 0, rz, 'XYZ');
    this.q.setFromEuler(this.e);
    this.local.compose(this.v.set(px, py, pz), this.q, this.s.set(1, 1, 1));
    return this.m.multiplyMatrices(this.root, this.local);
  }

  tint(base, h) {
    this.c.set(base);
    if (h.frozen > 0) this.c.lerp(ICE, 0.75);
    if (h.hitFlash > 0) this.c.lerp(WHITE, 0.7);
    if (h.enraged) this.c.lerp(new THREE.Color(0xff3020), 0.25 + 0.15 * Math.sin(h.age * 10));
    return this.c;
  }

  update(list, camPos, maxDist) {
    let n = 0;
    const md2 = maxDist * maxDist;
    for (const h of list) {
      if (h.removed || !h.look || n >= MAX) continue;
      const dx = h.pos.x - camPos.x, dz = h.pos.z - camPos.z;
      if (dx * dx + dz * dz > md2) continue;
      const p = h.pose;
      const sc = h.scale;
      this.e.set(p.tilt, h.yaw, p.roll, 'YXZ');
      this.q.setFromEuler(this.e);
      this.root.compose(this.v.set(h.pos.x, h.pos.y + h.downAmount * 0.25 * sc + p.lift, h.pos.z), this.q, this.s.set(sc, sc, sc));
      const L = h.look;
      this.head.setMatrixAt(n, this.partMatrix(0, 1.36, 0, 0, 0));
      this.head.setColorAt(n, this.tint(L.skin, h));
      this.hair.setMatrixAt(n, this.partMatrix(0, 1.36, 0, 0, 0));
      this.hair.setColorAt(n, this.tint(L.hat ?? L.hair, h));
      this.torso.setMatrixAt(n, this.partMatrix(0, 0.7, 0, 0, 0));
      this.torso.setColorAt(n, this.tint(L.shirt, h));
      this.arms.setMatrixAt(n * 2, this.partMatrix(0.35, 1.32, 0, p.armL, p.spreadL));
      this.arms.setMatrixAt(n * 2 + 1, this.partMatrix(-0.35, 1.32, 0, p.armR, -p.spreadR));
      const sleeve = this.tint(L.sleeves ?? L.shirt, h);
      this.arms.setColorAt(n * 2, sleeve);
      this.arms.setColorAt(n * 2 + 1, sleeve);
      this.legs.setMatrixAt(n * 2, this.partMatrix(0.12, 0.7, 0, p.legL, 0));
      this.legs.setMatrixAt(n * 2 + 1, this.partMatrix(-0.12, 0.7, 0, p.legR, 0));
      const pants = this.tint(L.pants, h);
      this.legs.setColorAt(n * 2, pants);
      this.legs.setColorAt(n * 2 + 1, pants);
      n++;
    }
    this.head.count = this.hair.count = this.torso.count = n;
    this.arms.count = this.legs.count = n * 2;
    for (const part of this.parts) {
      part.instanceMatrix.needsUpdate = true;
      part.instanceColor.needsUpdate = true;
    }
  }
}
