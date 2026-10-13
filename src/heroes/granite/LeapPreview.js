// While Granite charges a leap: a see-through dotted arc of where he'll fly and a
// ring where he'll land (sized like the slam), traced with the same physics as the leap.
import * as THREE from 'three';

const DOTS = 60;
const GRAVITY = 32;

export class LeapPreview {
  constructor(scene, world) {
    this.world = world;
    this.dots = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.42, 0.42, 0.42),
      new THREE.MeshBasicMaterial({ color: 0xffd38a, transparent: true, opacity: 0.6, depthWrite: false, fog: false }),
      DOTS,
    );
    this.dots.frustumCulled = false;
    this.dots.count = 0;
    this.dots.renderOrder = 2;
    scene.add(this.dots);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffa64d, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    this.ring.visible = false;
    this.ring.renderOrder = 2;
    scene.add(this.ring);
    this.inner = new THREE.Mesh(
      new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffa64d, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    this.ring.add(this.inner);
    this.m = new THREE.Matrix4();
    this.p = new THREE.Vector3();
    this.v = new THREE.Vector3();
    this.t = 0;
  }

  hide() {
    this.dots.count = 0;
    this.ring.visible = false;
  }

  /** start: launch point (feet), vel: launch velocity, slamRadius: size of the landing ring. */
  show(start, vel, slamRadius, dt) {
    this.t += dt;
    const w = this.world;
    const p = this.p.copy(start).setY(start.y + 1.2);
    const v = this.v.copy(vel);
    const step = 1 / 30;
    let n = 0;
    let landed = null;
    for (let i = 0; i < 240 && n < DOTS; i++) {
      const nx = p.x + v.x * step, ny = p.y + v.y * step, nz = p.z + v.z * step;
      const dx = nx - p.x, dy = ny - p.y, dz = nz - p.z;
      const len = Math.hypot(dx, dy, dz);
      const hit = len > 0 ? w.raycast(p.x, p.y, p.z, dx / len, dy / len, dz / len, len) : null;
      if (hit) {
        landed = { x: p.x + (dx / len) * hit.t, y: hit.y + (hit.ny > 0 ? 1 : 0), z: p.z + (dz / len) * hit.t, floor: hit.ny > 0 };
        break;
      }
      p.set(nx, ny, nz);
      v.y = Math.max(-110, v.y - GRAVITY * step);
      // a dot every third step, gently marching along the arc
      if (i % 3 === 0 && i > 1) {
        const s = 0.7 + 0.3 * Math.sin(this.t * 8 - i * 0.4);
        this.m.makeScale(s, s, s).setPosition(p.x, p.y, p.z);
        this.dots.setMatrixAt(n++, this.m);
      }
    }
    this.dots.count = n;
    this.dots.instanceMatrix.needsUpdate = true;
    if (landed && landed.floor) {
      this.ring.visible = true;
      this.ring.position.set(landed.x, landed.y + 0.06, landed.z);
      const pulse = 1 + Math.sin(this.t * 10) * 0.05;
      this.ring.scale.setScalar(slamRadius * pulse);
    } else {
      this.ring.visible = false;
    }
  }
}
