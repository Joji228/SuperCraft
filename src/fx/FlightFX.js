// Flight effects: air trail behind the hero, sonic boom, and spray/wake over water.
import * as THREE from 'three';
import { B } from '../world/Blocks.js';

const UP = new THREE.Vector3(0, 1, 0);

export class FlightFX {
  constructor(scene, particles, world) {
    this.scene = scene;
    this.particles = particles;
    this.world = world;
    this.emitAcc = 0;
    this.sprayAcc = 0;
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

    // ---- super-speed running trail: glowing streaks and crackling sparks ----
    if (!player.flying && player.sprinting) {
      const hs = Math.hypot(player.vel.x, player.vel.z);
      if (hs > 14) {
        const k = Math.min(1, (hs - 14) / 20);
        this.runAcc = (this.runAcc || 0) + hs * 9 * k * dt;
        const n = Math.min(60, Math.floor(this.runAcc));
        this.runAcc -= n;
        const hx = player.vel.x / hs, hz = player.vel.z / hs;
        for (let i = 0; i < n; i++) {
          const back = 0.3 + Math.random() * (hs * dt + 0.6);
          const h = 0.2 + Math.random() * 1.7;
          const hot = Math.random();
          p.emit({
            x: player.pos.x - hx * back + (Math.random() - 0.5) * 0.5,
            y: player.pos.y + h,
            z: player.pos.z - hz * back + (Math.random() - 0.5) * 0.5,
            vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.3) * 0.6, vz: (Math.random() - 0.5) * 0.6,
            life: 0.5 + Math.random() * 0.45,
            size: 0.3 + Math.random() * 0.25, grow: 1.8,
            alpha: k,
            r: 1, g: 0.55 + hot * 0.4, b: 0.05 + hot * 0.35,
            drag: 2,
          });
        }
        // little lightning crackles flicking off the body
        if (Math.random() < dt * 12 * k) {
          const c = this.center;
          for (let i = 0; i < 6; i++) {
            const a = Math.random() * Math.PI * 2;
            p.emit({ x: c.x - hx, y: c.y + (Math.random() - 0.5), z: c.z - hz, vx: Math.cos(a) * 6, vy: (Math.random() - 0.5) * 6, vz: Math.sin(a) * 6, life: 0.18, size: 0.1, grow: 0.5, alpha: 1, r: 1, g: 0.95, b: 0.5, drag: 3 });
          }
        }
        // dust kicked up from the feet
        if (Math.random() < dt * 20 * k) {
          p.emit({ x: player.pos.x - hx, y: player.pos.y + 0.1, z: player.pos.z - hz, vx: -hx * 3 + (Math.random() - 0.5) * 2, vy: 1 + Math.random(), vz: -hz * 3 + (Math.random() - 0.5) * 2, life: 0.6, size: 0.35, grow: 3, alpha: 0.35, r: 0.8, g: 0.76, b: 0.68, drag: 3 });
        }
      }
    }

    // ---- air trail ----
    if (player.flying && speed > 14) {
      const sup = player.supersonic;
      const rate = speed * (sup ? 8.5 : 4);
      this.emitAcc += rate * dt;
      const n = Math.min(60, Math.floor(this.emitAcc));
      this.emitAcc -= n;
      const strength = Math.min(1, (speed - 14) / 40);
      for (let i = 0; i < n; i++) {
        // stagger along the path travelled this frame so the trail stays continuous
        const back = 0.6 + Math.random() * speed * dt;
        let ox = (Math.random() - 0.5) * 0.8;
        let oy = (Math.random() - 0.5) * 0.8;
        let oz = (Math.random() - 0.5) * 0.8;
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
          life: (sup ? 1.15 : 0.65) + Math.random() * 0.35,
          size: sup ? 0.5 : 0.38,
          grow: sup ? 3.8 : 3,
          alpha: (sup ? 0.6 : 0.4) * (0.45 + 0.55 * strength),
          r: 0.94, g: 0.97, b: 1,
          drag: 1.5,
        });
      }
    } else {
      this.emitAcc = 0;
    }

    this.waterSpray(dt, player, speed);

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

    // ---- vapour cone: only flashes at the boom and fades out in about half a second ----
    this.coneFlash = Math.max(0, this.coneFlash - dt * 2);
    const coneAlpha = this.coneFlash * this.coneFlash * 0.55;
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

  /** Height of the water surface within a few blocks below the hero, or null. */
  waterBelow(player, range) {
    const x = Math.floor(player.pos.x), z = Math.floor(player.pos.z);
    const y0 = Math.floor(player.pos.y);
    for (let y = y0; y >= y0 - range; y--) {
      const b = this.world.get(x, y, z);
      if (b === B.WATER) return y + 0.9;
      if (b !== B.AIR) return null;
    }
    return null;
  }

  /** Fighter-jet style rooster tail and foam wake when skimming low and fast over water. */
  waterSpray(dt, player, speed) {
    const MAX_H = 7;
    if (!player.flying || speed < 18) {
      this.sprayAcc = 0;
      return;
    }
    const surface = this.waterBelow(player, MAX_H);
    if (surface === null) {
      this.sprayAcc = 0;
      return;
    }
    const h = player.pos.y - surface;
    const low = Math.max(0, 1 - h / MAX_H);
    const fast = Math.min(1, (speed - 18) / 50);
    const k = low * (0.35 + 0.65 * fast);
    if (k <= 0.02) return;
    const p = this.particles;
    const d = this.dir;
    const r = this.right;
    // horizontal flight direction
    const hl = Math.hypot(d.x, d.z) || 1;
    const fx = d.x / hl, fz = d.z / hl;
    const rate = 220 * k * (player.supersonic ? 1.5 : 1);
    this.sprayAcc += rate * dt;
    const n = Math.min(80, Math.floor(this.sprayAcc));
    this.sprayAcc -= n;
    const px = player.pos.x, pz = player.pos.z;
    for (let i = 0; i < n; i++) {
      const back = 1 + Math.random() * (speed * dt + 2);
      const bx = px - fx * back, bz = pz - fz * back;
      const kind = i % 4;
      if (kind === 0) {
        // foam left on the surface: a widening V-shaped wake
        const side = (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 1.2);
        p.emit({
          x: bx + r.x * side, y: surface + 0.05, z: bz + r.z * side,
          vx: r.x * side * 1.6, vy: 0, vz: r.z * side * 1.6,
          life: 1.6 + Math.random() * 1.2,
          size: 0.5, grow: 3,
          alpha: 0.55 * k + 0.15,
          r: 0.9, g: 0.96, b: 1,
          drag: 1.2,
        });
      } else {
        // rooster tail: water thrown up and back, falling under gravity
        const up = (7 + Math.random() * 11) * k * (player.supersonic ? 1.4 : 1);
        const spread = (Math.random() - 0.5) * 6 * k;
        p.emit({
          x: bx + (Math.random() - 0.5) * 0.8, y: surface + 0.1, z: bz + (Math.random() - 0.5) * 0.8,
          vx: -fx * speed * 0.05 * Math.random() + r.x * spread,
          vy: up,
          vz: -fz * speed * 0.05 * Math.random() + r.z * spread,
          life: 0.7 + Math.random() * 0.7,
          size: 0.28 + Math.random() * 0.28, grow: 2.4,
          alpha: 0.75,
          r: 0.78 + Math.random() * 0.2, g: 0.9 + Math.random() * 0.1, b: 1,
          drag: 0.6,
          gravity: 18,
        });
      }
    }
    // a little rumble when skimming really low
    if (low > 0.75 && fast > 0.3) this.shake = Math.max(this.shake || 0, 0.15 * fast);
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
