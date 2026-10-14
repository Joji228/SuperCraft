// Steel ladders bolted to the river walls and the sea wall, spaced well apart,
// so anyone who ends up in the water (Flux as Deka, mostly) can climb back out.
import * as THREE from 'three';
import { B, SOLID } from './Blocks.js';
import { CITY, riverZ } from './CityGenerator.js';

const { G, LAND0, LAND1 } = CITY;
const BOTTOM = 4; // river and sea bed
const STEP_RIVER = 130;
const STEP_COAST = 150;

export class Ladders {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.find();
    this.build();
  }

  /** A spot is good if there's deep water against a wall with plain walkable ground on top. */
  ok(wx, wz, lx, lz) {
    const w = this.game.world;
    if (w.get(wx, G - 2, wz) !== B.WATER || w.get(wx, BOTTOM + 1, wz) !== B.WATER) return false;
    if (!SOLID[w.get(lx, G - 1, lz)] || w.get(lx, G, lz) !== B.AIR || w.get(lx, G + 1, lz) !== B.AIR) return false;
    // keep the top clear one block further in too, so you can step off
    return SOLID[w.get(lx + (lx - wx), G - 1, lz + (lz - wz))] && w.get(lx + (lx - wx), G, lz + (lz - wz)) === B.AIR;
  }

  /** Walk along one wall placing ladders every `step` blocks (nudged to a valid spot). */
  line(from, to, step, at) {
    for (let s = from; s < to; s += step) {
      for (let k = 0; k < 12; k++) {
        const c = at(s + k * 3);
        if (c && this.ok(c.wx, c.wz, c.lx, c.lz)) {
          this.list.push({
            // the ladder hangs on the wall face, just inside the water column
            x: c.wx + 0.5 + (c.lx - c.wx) * 0.38,
            z: c.wz + 0.5 + (c.lz - c.wz) * 0.38,
            nx: c.lx - c.wx,
            nz: c.lz - c.wz,
            lx: c.lx + 0.5,
            lz: c.lz + 0.5,
          });
          break;
        }
      }
    }
  }

  find() {
    const [rz0, rz1] = riverZ();
    // both river walls
    this.line(40, 470, STEP_RIVER, (x) => ({ wx: x, wz: rz0, lx: x, lz: rz0 - 1 }));
    this.line(40 + STEP_RIVER / 2, 470, STEP_RIVER, (x) => ({ wx: x, wz: rz1 - 1, lx: x, lz: rz1 }));
    // the sea wall around the island
    this.line(LAND0 + 30, LAND1 - 20, STEP_COAST, (s) => ({ wx: s, wz: LAND0 - 1, lx: s, lz: LAND0 }));
    this.line(LAND0 + 60, LAND1 - 20, STEP_COAST, (s) => ({ wx: s, wz: LAND1, lx: s, lz: LAND1 - 1 }));
    this.line(LAND0 + 45, LAND1 - 20, STEP_COAST, (s) => ({ wx: LAND0 - 1, wz: s, lx: LAND0, lz: s }));
    this.line(LAND0 + 75, LAND1 - 20, STEP_COAST, (s) => ({ wx: LAND1, wz: s, lx: LAND1 - 1, lz: s }));
  }

  build() {
    const boxes = [];
    for (const l of this.list) {
      const sx = -l.nz, sz = l.nx; // along the wall
      const h = G + 1 - BOTTOM;
      for (const side of [-0.32, 0.32]) {
        // rails, and grab handles curving over the top onto the ground
        boxes.push([l.x + sx * side, BOTTOM + h / 2, l.z + sz * side, 0.09, h, 0.09, sx, sz]);
        boxes.push([l.x + sx * side + l.nx * 0.45, G + 1, l.z + sz * side + l.nz * 0.45, 0.09, 0.09, 0.9, sx, sz]);
        boxes.push([l.x + sx * side + l.nx * 0.88, G + 0.5, l.z + sz * side + l.nz * 0.88, 0.09, 1, 0.09, sx, sz]);
      }
      for (let y = BOTTOM + 0.4; y < G; y += 0.42) boxes.push([l.x, y, l.z, 0.64, 0.07, 0.07, sx, sz]);
    }
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xa3acb5 }), boxes.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    boxes.forEach(([x, y, z, w, h, d, sx, sz], i) => {
      // boxes are authored with x along the wall and z across it
      q.setFromAxisAngle(p.set(0, 1, 0), Math.atan2(-sz, sx));
      m.compose(p.set(x, y, z), q, s.set(w, h, d));
      mesh.setMatrixAt(i, m);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.game.scene.add(mesh);
    this.mesh = mesh;
  }

  /** The ladder within reach of a point in the water, if any. */
  near(pos, reach = 1.5) {
    if (pos.y > G - 0.3) return null;
    for (const l of this.list) if (Math.hypot(pos.x - l.x, pos.z - l.z) < reach) return l;
    return null;
  }
}
