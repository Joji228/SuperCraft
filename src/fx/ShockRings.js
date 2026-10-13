// Expanding see-through rings for shockwaves: flat on the ground (stomps, smashes)
// or facing a direction and travelling along it (Granite's thunder clap).
import * as THREE from 'three';

const POOL = 24;

export class ShockRings {
  constructor(scene) {
    this.thin = new THREE.RingGeometry(0.86, 1, 56);
    this.thick = new THREE.RingGeometry(0.55, 1, 56);
    this.rings = [];
    for (let i = 0; i < POOL; i++) {
      const m = new THREE.Mesh(
        this.thin,
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }),
      );
      m.visible = false;
      m.renderOrder = 3;
      scene.add(m);
      this.rings.push({ mesh: m, t: 0, life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3() });
    }
    this.next = 0;
    this.up = new THREE.Vector3(0, 1, 0);
  }

  /**
   * o: { pos, normal (Vector3, default up = lying on the ground), r0, r1, life,
   *      color, opacity, thick, speed (move along the normal, m/s) }
   */
  spawn(o) {
    const r = this.rings[this.next];
    this.next = (this.next + 1) % POOL;
    const m = r.mesh;
    m.geometry = o.thick ? this.thick : this.thin;
    m.material.color.setHex(o.color ?? 0xffffff);
    r.opacity = o.opacity ?? 0.7;
    r.r0 = o.r0 ?? 0.5;
    r.r1 = o.r1 ?? 6;
    r.t = 0;
    r.life = o.life ?? 0.5;
    r.pos.copy(o.pos);
    const n = o.normal || this.up;
    r.vel.copy(n).multiplyScalar(o.speed || 0);
    m.position.copy(o.pos);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n.clone().normalize());
    m.visible = true;
    return r;
  }

  update(dt) {
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const k = r.t / r.life;
      if (k >= 1) {
        r.mesh.visible = false;
        continue;
      }
      const e = 1 - (1 - k) * (1 - k); // ease out
      const s = r.r0 + (r.r1 - r.r0) * e;
      r.pos.addScaledVector(r.vel, dt);
      r.mesh.position.copy(r.pos);
      r.mesh.scale.set(s, s, s);
      r.mesh.material.opacity = r.opacity * (1 - k) * (1 - k * 0.3);
    }
  }

  clear() {
    for (const r of this.rings) r.mesh.visible = false;
  }
}
