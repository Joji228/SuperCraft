// Sky dome, sun light, hemisphere light, fog, drifting voxel clouds and an optional day/night cycle.
import * as THREE from 'three';
import { RNG } from '../util/rng.js';
import { clamp, lerp, smoothstep } from '../util/math.js';

const DAY = { top: new THREE.Color(0x3d8fe8), horizon: new THREE.Color(0xbfe3ff), sun: 2.6, hemi: 1.15 };
const DUSK = { top: new THREE.Color(0x2b3f8a), horizon: new THREE.Color(0xffa36b), sun: 1.2, hemi: 0.7 };
const NIGHT = { top: new THREE.Color(0x060a1c), horizon: new THREE.Color(0x1b2a4a), sun: 0.25, hemi: 0.35 };

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
}`;

const skyFrag = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(max(h, 0.0), 0.55));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += vec3(1.0, 0.9, 0.7) * pow(s, 400.0) * 1.5;   // sun disc
  col += vec3(1.0, 0.8, 0.55) * pow(s, 12.0) * 0.25;  // glow
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.time = 0.36; // 0..1, 0.25 sunrise, 0.5 noon, 0.75 sunset
    this.cycle = false;
    this.cycleLength = 480; // seconds per full day

    this.uniforms = {
      uTop: { value: DAY.top.clone() },
      uHorizon: { value: DAY.horizon.clone() },
      uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
    };
    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(1, 24, 12),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: skyVert,
        fragmentShader: skyFrag,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.dome.renderOrder = -1;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    this.hemi = new THREE.HemisphereLight(0xdcefff, 0x8c7a5c, DAY.hemi);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff1dc, DAY.sun);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -90;
    sc.right = 90;
    sc.top = 90;
    sc.bottom = -90;
    sc.near = 1;
    sc.far = 400;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;
    scene.add(this.sun);
    scene.add(this.sun.target);

    scene.fog = new THREE.Fog(DAY.horizon.clone(), 60, 200);
    scene.background = DAY.horizon.clone();

    this.sunDir = new THREE.Vector3();
    this.buildClouds();
    this.apply();
  }

  buildClouds() {
    const rng = new RNG(99);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 });
    const cells = [];
    const CELL = 12;
    const N = 100;
    // blobby cloud field from a few random circles
    const blobs = [];
    for (let i = 0; i < 70; i++) blobs.push([rng.float(0, N), rng.float(0, N), rng.float(2, 6)]);
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        for (const [bx, bz, r] of blobs) {
          if ((x - bx) ** 2 + (z - bz) ** 2 < r * r) {
            cells.push([x, z]);
            break;
          }
        }
      }
    }
    this.cloudSpan = N * CELL;
    this.clouds = new THREE.InstancedMesh(geo, mat, cells.length);
    const m = new THREE.Matrix4();
    cells.forEach(([x, z], i) => {
      m.makeScale(CELL, 4, CELL);
      m.setPosition(x * CELL - this.cloudSpan / 2 + 256, 150, z * CELL - this.cloudSpan / 2 + 256);
      this.clouds.setMatrixAt(i, m);
    });
    this.clouds.frustumCulled = false;
    this.cloudGroup = new THREE.Group();
    this.cloudGroup.add(this.clouds);
    // a second copy one span behind makes the drifting field wrap seamlessly
    const copy = new THREE.InstancedMesh(geo, mat, cells.length);
    copy.instanceMatrix = this.clouds.instanceMatrix;
    copy.frustumCulled = false;
    copy.position.x = -this.cloudSpan;
    this.cloudGroup.add(copy);
    this.scene.add(this.cloudGroup);
    this.cloudOffset = 0;
  }

  setRenderDistance(d) {
    this.scene.fog.near = d * 0.55;
    this.scene.fog.far = d;
  }

  apply() {
    const t = this.time;
    const ang = (t - 0.25) * Math.PI * 2; // 0 at sunrise
    this.sunDir.set(Math.cos(ang) * 0.75, Math.sin(ang), 0.45).normalize();
    const elev = this.sunDir.y;
    // blend palettes by sun elevation
    const dayK = smoothstep(0.05, 0.45, elev);
    const nightK = smoothstep(0.02, -0.25, elev);
    const top = DUSK.top.clone().lerp(DAY.top, dayK).lerp(NIGHT.top, nightK);
    const hor = DUSK.horizon.clone().lerp(DAY.horizon, dayK).lerp(NIGHT.horizon, nightK);
    this.night = Math.min(1, 1 - dayK);
    this.uniforms.uTop.value.copy(top);
    this.uniforms.uHorizon.value.copy(hor);
    this.uniforms.uSunDir.value.copy(this.sunDir);
    this.scene.fog.color.copy(hor);
    this.scene.background.copy(hor);
    const sunI = lerp(lerp(DUSK.sun, DAY.sun, dayK), NIGHT.sun, nightK);
    this.sun.intensity = elev > -0.05 ? sunI : NIGHT.sun;
    this.hemi.intensity = lerp(lerp(DUSK.hemi, DAY.hemi, dayK), NIGHT.hemi, nightK);
    this.sun.color.setHSL(0.1, lerp(0.6, 0.25, dayK), lerp(0.75, 0.93, dayK));
    this.clouds.material.color.setScalar(clamp(0.35 + dayK * 0.65 - nightK * 0.2, 0.2, 1));
  }

  update(dt, camera, focus) {
    if (this.cycle) {
      this.time = (this.time + dt / this.cycleLength) % 1;
      this.apply();
    }
    // dome follows the camera and sits just inside the far plane
    this.dome.position.copy(camera.position);
    this.dome.scale.setScalar(camera.far * 0.9);
    // sun follows the focus point so shadows stay crisp near the hero
    const lightDir = this.sunDir.y > 0 ? this.sunDir : new THREE.Vector3(0.3, 0.8, 0.2).normalize();
    this.sun.position.set(focus.x + lightDir.x * 200, focus.y + lightDir.y * 200, focus.z + lightDir.z * 200);
    this.sun.target.position.copy(focus);
    // clouds drift east and wrap around
    this.cloudOffset = (this.cloudOffset + dt * 2.5) % this.cloudSpan;
    this.cloudGroup.position.x = this.cloudOffset;
  }
}
