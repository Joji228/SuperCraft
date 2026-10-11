// Draws every box-built entity (cars, props, drones, targets, the cat, bosses' parts...)
// with two InstancedMeshes: one lit, one glowing. Each entity lists its boxes in `boxes`:
//   { x, y, z, w, h, d, color, glow?, rx?, ry?, rz? }  (offsets relative to the entity's feet)
import * as THREE from 'three';

const MAX_LIT = 6000;
const MAX_GLOW = 800;
const ICE = new THREE.Color(0x9fe3ff);
const WHITE = new THREE.Color(0xffffff);
const BLACK = new THREE.Color(0x1a1714);

function batch(scene, material, max) {
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, max);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  m.frustumCulled = false;
  m.count = 0;
  scene.add(m);
  return m;
}

export class BoxRenderer {
  constructor(scene) {
    this.lit = batch(scene, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX_LIT);
    this.lit.castShadow = true;
    this.lit.receiveShadow = true;
    this.glow = batch(scene, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_GLOW);
    this.root = new THREE.Matrix4();
    this.local = new THREE.Matrix4();
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.c = new THREE.Color();
  }

  update(list, camPos, maxDist) {
    let nl = 0, ng = 0;
    const md2 = maxDist * maxDist;
    for (const ent of list) {
      if (ent.removed || !ent.boxes || ent.hidden) continue;
      const dx = ent.pos.x - camPos.x, dz = ent.pos.z - camPos.z;
      if (dx * dx + dz * dz > md2) continue;
      const sc = ent.visualScale || 1;
      this.e.set(ent.pitch || 0, ent.yaw || 0, ent.roll || 0, 'YXZ');
      this.q.setFromEuler(this.e);
      this.root.compose(this.v.set(ent.pos.x, ent.pos.y + (ent.visualLift || 0), ent.pos.z), this.q, this.s.set(sc, sc, sc));
      for (const b of ent.boxes) {
        if (b.hidden) continue;
        const target = b.glow ? this.glow : this.lit;
        const idx = b.glow ? ng : nl;
        if ((b.glow && ng >= MAX_GLOW) || (!b.glow && nl >= MAX_LIT)) continue;
        this.e.set(b.rx || 0, b.ry || 0, b.rz || 0, 'XYZ');
        this.q.setFromEuler(this.e);
        this.local.compose(this.v.set(b.x || 0, b.y || 0, b.z || 0), this.q, this.s.set(b.w, b.h, b.d));
        this.m.multiplyMatrices(this.root, this.local);
        target.setMatrixAt(idx, this.m);
        this.c.set(b.color);
        if (!b.glow) {
          if (ent.burnt) this.c.lerp(BLACK, 0.75);
          else if (ent.dent) this.c.multiplyScalar(1 - ent.dent * 0.35);
          if (ent.frozen > 0) this.c.lerp(ICE, 0.7);
          if (ent.hitFlash > 0) this.c.lerp(WHITE, 0.7);
        }
        target.setColorAt(idx, this.c);
        if (b.glow) ng++;
        else nl++;
      }
    }
    this.lit.count = nl;
    this.glow.count = ng;
    for (const m of [this.lit, this.glow]) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }
  }
}
