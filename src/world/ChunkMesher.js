// Turns one 32x32 column chunk of voxels into compact mesh data with hidden-face
// removal and per-vertex ambient occlusion.
import { B, BLOCK_TILES, OPAQUE, ATLAS_COLS, ATLAS_CELL, ATLAS_SIZE } from './Blocks.js';
import { SX, SZ, SY, CS } from './World.js';

// normal, u axis, v axis (u x v = normal, so corners 0,u,u+v,v wind counter-clockwise)
const DIRS = [
  [1, 0, 0, 0, 1, 0, 0, 0, 1],
  [-1, 0, 0, 0, 0, 1, 0, 1, 0],
  [0, 1, 0, 0, 0, 1, 1, 0, 0],
  [0, -1, 0, 1, 0, 0, 0, 0, 1],
  [0, 0, 1, 1, 0, 0, 0, 1, 0],
  [0, 0, -1, 0, 1, 0, 1, 0, 0],
];
const TILE_SLOT = [1, 1, 0, 2, 1, 1]; // side, side, top, bottom, side, side
const CU = [0, 1, 1, 0];
const CV = [0, 0, 1, 1];
const AO_LEVELS = [0.52, 0.7, 0.85, 1.0];
const PAD = (ATLAS_CELL - 16) / 2;

class Buffers {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
    this.verts = 0;
  }
  build() {
    if (this.verts === 0) return null;
    return {
      position: new Uint8Array(this.pos),
      normal: new Int8Array(this.nrm),
      uv: new Uint16Array(this.uv),
      color: new Uint8Array(this.col),
      index: this.verts > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx),
    };
  }
}

export function meshChunk(world, cx, cz) {
  const data = world.data;
  const x0 = cx * CS;
  const z0 = cz * CS;
  const maxY = Math.min(SY - 1, world.chunkMaxY[cx + cz * (SX / CS)] + 1);
  const solid = new Buffers();
  const water = new Buffers();

  const get = (x, y, z) => {
    if (y >= SY) return B.AIR;
    if (x < 0 || z < 0 || y < 0 || x >= SX || z >= SZ) return B.STONE;
    return data[x + SX * (z + SZ * y)];
  };
  const opaque = (x, y, z) => OPAQUE[get(x, y, z)];

  const ao = [0, 0, 0, 0];
  for (let y = 0; y <= maxY; y++) {
    for (let z = z0; z < z0 + CS; z++) {
      for (let x = x0; x < x0 + CS; x++) {
        const b = data[x + SX * (z + SZ * y)];
        if (b === B.AIR) continue;
        const isWater = b === B.WATER;
        for (let f = 0; f < 6; f++) {
          const d = DIRS[f];
          const nx = d[0], ny = d[1], nz = d[2];
          const nb = get(x + nx, y + ny, z + nz);
          if (isWater) {
            if (f !== 2 || nb !== B.AIR) continue; // water: only the surface
          } else if (OPAQUE[nb]) continue;

          const ux = d[3], uy = d[4], uz = d[5];
          const vx = d[6], vy = d[7], vz = d[8];
          const bx = x + (nx > 0 ? 1 : 0);
          const by = y + (ny > 0 ? 1 : 0);
          const bz = z + (nz > 0 ? 1 : 0);
          const ox = x + nx, oy = y + ny, oz = z + nz;

          // ambient occlusion
          for (let k = 0; k < 4; k++) {
            if (isWater) {
              ao[k] = 3;
              continue;
            }
            const su = CU[k] ? 1 : -1;
            const sv = CV[k] ? 1 : -1;
            const s1 = opaque(ox + su * ux, oy + su * uy, oz + su * uz);
            const s2 = opaque(ox + sv * vx, oy + sv * vy, oz + sv * vz);
            const c = opaque(ox + su * ux + sv * vx, oy + su * uy + sv * vy, oz + su * uz + sv * vz);
            ao[k] = s1 && s2 ? 0 : 3 - s1 - s2 - c;
          }

          const buf = isWater ? water : solid;
          const tile = BLOCK_TILES[b * 3 + TILE_SLOT[f]];
          const tcx = (tile % ATLAS_COLS) * ATLAS_CELL + PAD;
          const tcy = Math.floor(tile / ATLAS_COLS) * ATLAS_CELL + PAD;
          const base = buf.verts;

          for (let k = 0; k < 4; k++) {
            const px = bx + CU[k] * ux + CV[k] * vx;
            const py = by + CU[k] * uy + CV[k] * vy;
            const pz = bz + CU[k] * uz + CV[k] * vz;
            const dx = px - x, dy = py - y, dz = pz - z;
            let tu, tv;
            if (ny !== 0) {
              tu = dx;
              tv = dz;
            } else if (nx !== 0) {
              tu = nx > 0 ? 1 - dz : dz;
              tv = dy;
            } else {
              tu = nz > 0 ? dx : 1 - dx;
              tv = dy;
            }
            buf.pos.push(px - x0, py, pz - z0);
            buf.nrm.push(nx * 127, ny * 127, nz * 127);
            const U = (tcx + tu * 16) / ATLAS_SIZE;
            const V = 1 - (tcy + (1 - tv) * 16) / ATLAS_SIZE;
            buf.uv.push(Math.round(U * 65535), Math.round(V * 65535));
            const l = Math.round(AO_LEVELS[ao[k]] * 255);
            buf.col.push(l, l, l);
          }
          // flip the quad diagonal so AO interpolates without artefacts
          if (ao[0] + ao[2] < ao[1] + ao[3]) {
            buf.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
          } else {
            buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
          buf.verts += 4;
        }
      }
    }
  }
  return { solid: solid.build(), water: water.build() };
}
