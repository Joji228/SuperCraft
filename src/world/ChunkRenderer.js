// Owns the chunk meshes: builds them, remeshes edited chunks and hides far ones.
import * as THREE from 'three';
import { meshChunk } from './ChunkMesher.js';
import { CX, CZ, CS } from './World.js';

function toGeometry(d) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(d.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(d.normal, 3, true));
  g.setAttribute('uv', new THREE.BufferAttribute(d.uv, 2, true));
  g.setAttribute('color', new THREE.BufferAttribute(d.color, 3, true));
  g.setAttribute('glow', new THREE.BufferAttribute(d.glow, 1, true));
  g.setIndex(new THREE.BufferAttribute(d.index, 1));
  g.computeBoundingSphere();
  return g;
}

export class ChunkRenderer {
  constructor(world, scene, atlas) {
    this.world = world;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.material = new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true });
    // lit windows, street lamps and beacons glow after dark
    this.night = { value: 0 };
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uNight = this.night;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * uNight * 1.4;');
    };
    this.waterMaterial = new THREE.MeshLambertMaterial({
      map: atlas,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    this.chunks = new Array(CX * CZ).fill(null);
    this.shadows = true;
    this.visibleCount = 0;
  }

  /** Build every chunk, yielding to the browser so a progress bar can update. */
  async buildAll(onProgress) {
    const order = [];
    for (let cz = 0; cz < CZ; cz++) for (let cx = 0; cx < CX; cx++) order.push([cx, cz]);
    let last = performance.now();
    for (let i = 0; i < order.length; i++) {
      this.build(order[i][0], order[i][1]);
      if (performance.now() - last > 30) {
        onProgress?.((i + 1) / order.length);
        await new Promise((r) => setTimeout(r, 0));
        last = performance.now();
      }
    }
    onProgress?.(1);
  }

  build(cx, cz) {
    const i = cx + cz * CX;
    const old = this.chunks[i];
    if (old) {
      for (const m of [old.solid, old.water]) {
        if (!m) continue;
        this.group.remove(m);
        m.geometry.dispose();
      }
    }
    const data = meshChunk(this.world, cx, cz);
    const entry = { solid: null, water: null, cx: (cx + 0.5) * CS, cz: (cz + 0.5) * CS };
    if (data.solid) {
      const m = new THREE.Mesh(toGeometry(data.solid), this.material);
      m.position.set(cx * CS, 0, cz * CS);
      m.castShadow = this.shadows;
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      this.group.add(m);
      entry.solid = m;
    }
    if (data.water) {
      const m = new THREE.Mesh(toGeometry(data.water), this.waterMaterial);
      m.position.set(cx * CS, -0.12, cz * CS);
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      m.renderOrder = 1;
      this.group.add(m);
      entry.water = m;
    }
    this.chunks[i] = entry;
  }

  setNight(k) {
    this.night.value = k;
  }

  setShadows(on) {
    this.shadows = on;
    for (const c of this.chunks) if (c?.solid) c.solid.castShadow = on;
  }

  /** Remesh edited chunks (a few per frame) and cull by render distance. */
  update(camPos, renderDistance) {
    let budget = this.world.dirty.size > 8 ? 6 : 2;
    for (const i of this.world.dirty) {
      if (budget-- <= 0) break;
      this.world.dirty.delete(i);
      this.build(i % CX, Math.floor(i / CX));
    }
    const r = renderDistance + CS * 0.75;
    const r2 = r * r;
    let count = 0;
    for (const c of this.chunks) {
      if (!c) continue;
      const dx = c.cx - camPos.x;
      const dz = c.cz - camPos.z;
      const vis = dx * dx + dz * dz < r2;
      if (c.solid) c.solid.visible = vis;
      if (c.water) c.water.visible = vis;
      if (vis) count++;
    }
    this.visibleCount = count;
  }
}
