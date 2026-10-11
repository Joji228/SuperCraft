// Pooled square "pixel" particles drawn as one THREE.Points, sized in world units.
import * as THREE from 'three';

const vert = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 color;
uniform float uScale;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / -mv.z, 1.0, 256.0);
  vAlpha = aAlpha;
  vColor = color;
}`;

const frag = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main() {
  // soften the square's edge a little so big puffs don't look like hard tiles
  vec2 c = abs(gl_PointCoord - 0.5) * 2.0;
  float edge = 1.0 - smoothstep(0.75, 1.0, max(c.x, c.y));
  gl_FragColor = vec4(vColor, vAlpha * edge);
}`;

export class Particles {
  constructor(scene, max = 3000) {
    this.max = max;
    this.count = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    // simulation state
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.alpha0 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);

    const g = new THREE.BufferGeometry();
    this.attrs = {
      position: new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage),
      color: new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage),
      aSize: new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage),
      aAlpha: new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage),
    };
    for (const [k, a] of Object.entries(this.attrs)) g.setAttribute(k, a);
    g.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    scene.add(this.points);
  }

  /**
   * p: { x,y,z, vx,vy,vz, life, size, grow, alpha, r,g,b, drag, gravity }
   */
  emit(p) {
    if (this.count >= this.max) return;
    const i = this.count++;
    const i3 = i * 3;
    this.pos[i3] = p.x;
    this.pos[i3 + 1] = p.y;
    this.pos[i3 + 2] = p.z;
    this.vel[i3] = p.vx || 0;
    this.vel[i3 + 1] = p.vy || 0;
    this.vel[i3 + 2] = p.vz || 0;
    this.col[i3] = p.r ?? 1;
    this.col[i3 + 1] = p.g ?? 1;
    this.col[i3 + 2] = p.b ?? 1;
    this.life[i] = 0;
    this.maxLife[i] = p.life || 1;
    this.size0[i] = p.size || 0.3;
    this.size1[i] = (p.size || 0.3) * (p.grow || 1);
    this.alpha0[i] = p.alpha ?? 0.6;
    this.drag[i] = p.drag || 0;
    this.grav[i] = p.gravity || 0;
  }

  clear() {
    this.count = 0;
    this.points.geometry.setDrawRange(0, 0);
  }

  update(dt, camera, viewportHeight) {
    this.material.uniforms.uScale.value = viewportHeight / (2 * Math.tan((camera.fov * Math.PI) / 360));
    let i = 0;
    while (i < this.count) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) {
        this.kill(i);
        continue;
      }
      const i3 = i * 3;
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= k;
      this.vel[i3 + 1] = this.vel[i3 + 1] * k - this.grav[i] * dt;
      this.vel[i3 + 2] *= k;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      // quick fade-in, long fade-out
      this.alpha[i] = this.alpha0[i] * Math.min(1, t * 8) * (1 - t) * (1 - t);
      i++;
    }
    this.points.geometry.setDrawRange(0, this.count);
    for (const a of Object.values(this.attrs)) a.needsUpdate = true;
  }

  /** Remove particle i by moving the last particle into its slot. */
  kill(i) {
    const j = --this.count;
    if (i === j) return;
    const i3 = i * 3, j3 = j * 3;
    for (let c = 0; c < 3; c++) {
      this.pos[i3 + c] = this.pos[j3 + c];
      this.vel[i3 + c] = this.vel[j3 + c];
      this.col[i3 + c] = this.col[j3 + c];
    }
    this.life[i] = this.life[j];
    this.maxLife[i] = this.maxLife[j];
    this.size0[i] = this.size0[j];
    this.size1[i] = this.size1[j];
    this.alpha0[i] = this.alpha0[j];
    this.drag[i] = this.drag[j];
    this.grav[i] = this.grav[j];
  }
}
