// Flight effects: air trail behind the hero, supersonic vapour cone and the sonic boom.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

export class FlightFX {
  constructor(scene, particles) {
    this.scene = scene;
    this.particles = particles;
    this.emitAcc = 0;
    this.dir = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.center = new THREE.Vector3();

    // expanding shockwave rings
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.82, 1, 48);
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, fog: false }),
      );
      m.visible = false;
      m.renderOrder = 3;
      scene.add(m);
      this.rings.push({ mesh: m, t: 0, delay: i * 0.08, active: false });
    }

    // vapour cone around the hero: open cone, apex forward
    const coneGeo = new THREE.ConeGeometry(1.5, 3.6, 28, 1, true);
    coneGeo.translate(0, -1.8, 0); // apex at the origin, opening towards -Y
    this.cone = new THREE.Mesh(
      coneGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.cone.visible = false;
    this.cone.renderOrder = 3;
    scene.add(this.cone);
    this.coneFlash = 0;
  }

  frame(player) {
    const speed = player.vel.length();
    if (speed > 0.001) this.dir.copy(player.vel).divideScalar(speed);
    this.right.crossVectors(this.dir, UP);
    if (this.right.lengthSq() < 1e-4) this.right.set(1, 0, 0);
    this.right.normalize();
    this.center.set(player.pos.x, player.pos.y + 1, player.pos.z);
    return speed;
  }

  sonicBoom(player) {
    this.frame(player);
    const p = this.particles;
    const d = this.dir;
    const r = this.right;
    const u = new THREE.Vector3().crossVectors(r, d).normalize();
    // radial burst in the plane perpendicular to the flight direction
    for (let i = 0; i < 220; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 12 + Math.random() * 16;
      const back = -4 - Math.random() * 10;
      const vx = (Math.cos(a) * r.x + Math.sin(a) * u.x) * s + d.x * back;
      const vy = (Math.cos(a) * r.y + Math.sin(a) * u.y) * s + d.y * back;
      const vz = (Math.cos(a) * r.z + Math.sin(a) * u.z) * s + d.z * back;
      p.emit({
        x: this.center.x, y: this.center.y, z: this.center.z,
        vx, vy, vz,
        life: 0.7 + Math.random() * 0.6,
        size: 0.45 + Math.random() * 0.4,
        grow: 2.6,
        alpha: 0.75,
        r: 0.92, g: 0.96, b: 1,
        drag: 2.6,
      });
    }
    for (const ring of this.rings) {
      ring.t = -ring.delay;
      ring.active = true;
      ring.mesh.position.copy(this.center);
      ring.mesh.lookAt(this.center.clone().add(d));
    }
    this.coneFlash = 1;
  }

  update(dt, player) {
    const speed = this.frame(player);
    const p = this.particles;
    const d = this.dir;

    // ---- air trail ----
    if (player.flying && speed > 14) {
      const sup = player.supersonic;
      const rate = speed * (sup ? 7 : 3.2);
      this.emitAcc += rate * dt;
      const n = Math.min(60, Math.floor(this.emitAcc));
      this.emitAcc -= n;
      const strength = Math.min(1, (speed - 14) / 40);
      for (let i = 0; i < n; i++) {
        // stagger along the path travelled this frame so the trail stays continuous
        const back = 0.6 + Math.random() * speed * dt;
        let ox = (Math.random() - 0.5) * 0.5;
        let oy = (Math.random() - 0.5) * 0.5;
        let oz = (Math.random() - 0.5) * 0.5;
        if (sup && i % 3 !== 0) {
          // two contrails off the shoulders
          const side = i % 3 === 1 ? 0.55 : -0.55;
          ox = this.right.x * side;
          oy = this.right.y * side;
          oz = this.right.z * side;
        }
        p.emit({
          x: this.center.x - d.x * back + ox,
          y: this.center.y - d.y * back + oy,
          z: this.center.z - d.z * back + oz,
          vx: player.vel.x * 0.04 + (Math.random() - 0.5) * 1.2,
          vy: player.vel.y * 0.04 + (Math.random() - 0.5) * 1.2,
          vz: player.vel.z * 0.04 + (Math.random() - 0.5) * 1.2,
          life: (sup ? 1.0 : 0.55) + Math.random() * 0.35,
          size: sup ? 0.32 : 0.24,
          grow: sup ? 3.2 : 2.4,
          alpha: (sup ? 0.5 : 0.32) * (0.4 + 0.6 * strength),
          r: 0.94, g: 0.97, b: 1,
          drag: 1.5,
        });
      }
    } else {
      this.emitAcc = 0;
    }

    // ---- shockwave rings ----
    for (const ring of this.rings) {
      if (!ring.active) continue;
      ring.t += dt;
      if (ring.t < 0) continue;
      const k = ring.t / 0.75;
      if (k >= 1) {
        ring.active = false;
        ring.mesh.visible = false;
        continue;
      }
      ring.mesh.visible = true;
      ring.mesh.scale.setScalar(1.5 + k * 34);
      ring.mesh.material.opacity = 0.65 * (1 - k) * (1 - k);
    }

    // ---- vapour cone: flash on the boom, faint while supersonic ----
    this.coneFlash = Math.max(0, this.coneFlash - dt * 2.2);
    const coneAlpha = Math.max(this.coneFlash * 0.55, player.supersonic ? 0.09 + Math.random() * 0.04 : 0);
    this.cone.visible = coneAlpha > 0.005 && player.flying;
    if (this.cone.visible) {
      this.cone.material.opacity = coneAlpha;
      this.cone.position.copy(this.center).addScaledVector(d, 0.9);
      // cone opens along -Y; point -Y backwards (i.e. +Y along the flight direction)
      this.cone.quaternion.setFromUnitVectors(UP, d);
      const s = 1 + (1 - this.coneFlash) * 0.15;
      this.cone.scale.set(s, 1, s);
    }
  }

  clear() {
    this.particles.clear();
    for (const ring of this.rings) {
      ring.active = false;
      ring.mesh.visible = false;
    }
    this.cone.visible = false;
    this.coneFlash = 0;
  }
}
