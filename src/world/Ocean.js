// The open sea around the island: flat water and sea-floor planes that continue the
// voxel map's water out to the edge of the world, so the city sits in a big ocean.
import * as THREE from 'three';
import { SX, SZ, SEA } from './World.js';
import { tileTexture } from './Textures.js';

/** A square ring (big square minus the map square) as one flat geometry with world-space UVs. */
function ringGeometry(y) {
  const o0 = -SEA, o1 = SX + SEA;
  // four rectangles around the map: north, south, west, east
  const rects = [
    [o0, o0, o1, 0],
    [o0, SZ, o1, o1],
    [o0, 0, 0, SZ],
    [SX, 0, o1, SZ],
  ];
  const pos = [], uv = [], nrm = [], idx = [];
  for (const [x0, z0, x1, z1] of rects) {
    const b = pos.length / 3;
    for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) {
      pos.push(x, y, z);
      uv.push(x, -z); // one texture repeat per block, matching the voxel water
      nrm.push(0, 1, 0);
    }
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

export function createOcean(scene) {
  const water = new THREE.Mesh(
    ringGeometry(11 - 0.12),
    new THREE.MeshLambertMaterial({ map: tileTexture('water'), transparent: true, opacity: 0.78, depthWrite: false }),
  );
  water.renderOrder = 1;
  const sandTex = tileTexture('sand');
  const floor = new THREE.Mesh(ringGeometry(4), new THREE.MeshLambertMaterial({ map: sandTex }));
  floor.receiveShadow = true;
  for (const m of [water, floor]) {
    m.frustumCulled = false;
    m.matrixAutoUpdate = false;
    scene.add(m);
  }
  return { water, floor };
}
