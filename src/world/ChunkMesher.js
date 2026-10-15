// Turns one 32x32 column chunk of voxels into compact mesh data with hidden-face
// removal and per-vertex ambient occlusion.
//
// Built for speed (it runs for every chunk at load and whenever a block is destroyed):
// the chunk plus a one-block border is copied into a small padded grid so neighbour
// lookups are plain index offsets, everything that only depends on the face direction
// is precomputed, and vertices go into reusable typed arrays.
import { B, T, BLOCK_TILES, OPAQUE, ATLAS_COLS, ATLAS_CELL, ATLAS_SIZE } from './Blocks.js';
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
const AO_LIGHT = [0.52, 0.7, 0.85, 1.0].map((l) => Math.round(l * 255));
const PAD = (ATLAS_CELL - 16) / 2;

// padded grid: the chunk plus one block on every side
const PX = CS + 2;
const PZ = CS + 2;
const PXZ = PX * PZ;

// per face: corner offsets from the block (position and texture coords)
const CORNERS = DIRS.map((d) => {
  const [nx, ny, nz, ux, uy, uz, vx, vy, vz] = d;
  const out = [];
  for (let k = 0; k < 4; k++) {
    const dx = (nx > 0 ? 1 : 0) + CU[k] * ux + CV[k] * vx;
    const dy = (ny > 0 ? 1 : 0) + CU[k] * uy + CV[k] * vy;
    const dz = (nz > 0 ? 1 : 0) + CU[k] * uz + CV[k] * vz;
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
    out.push({ dx, dy, dz, tu, tv });
  }
  return out;
});

// per face: padded-grid offset of the neighbour, and of the 3 AO samples per corner
const off = (x, y, z) => x + z * PX + y * PXZ;
const N_OFF = DIRS.map((d) => off(d[0], d[1], d[2]));
const AO_OFF = DIRS.map((d) => {
  const [nx, ny, nz, ux, uy, uz, vx, vy, vz] = d;
  const out = [];
  for (let k = 0; k < 4; k++) {
    const su = CU[k] ? 1 : -1;
    const sv = CV[k] ? 1 : -1;
    out.push(
      off(nx + su * ux, ny + su * uy, nz + su * uz),
      off(nx + sv * vx, ny + sv * vy, nz + sv * vz),
      off(nx + su * ux + sv * vx, ny + su * uy + sv * vy, nz + su * uz + sv * vz),
    );
  }
  return out;
});

// per tile: packed uv for the four (tu, tv) combinations, and whether it glows at night
const TILE_UV = new Uint16Array(256 * 8);
for (let tile = 0; tile < 256; tile++) {
  const tcx = (tile % ATLAS_COLS) * ATLAS_CELL + PAD;
  const tcy = Math.floor(tile / ATLAS_COLS) * ATLAS_CELL + PAD;
  for (let tu = 0; tu < 2; tu++) {
    for (let tv = 0; tv < 2; tv++) {
      const U = (tcx + tu * 16) / ATLAS_SIZE;
      const V = 1 - (tcy + (1 - tv) * 16) / ATLAS_SIZE;
      const i = tile * 8 + (tu * 2 + tv) * 2;
      TILE_UV[i] = Math.round(U * 65535);
      TILE_UV[i + 1] = Math.round(V * 65535);
    }
  }
}
const GLOW = new Uint8Array(256);
for (const t of [T.glass_lit, T.lamp, T.red_light]) GLOW[t] = 255;

/** Growable typed vertex/index buffers, reused between chunks. */
class Buffers {
  constructor() {
    this.cap = 0;
    this.icap = 0;
    this.grow(4096);
    this.growIndex(6144);
    this.reset();
  }
  reset() {
    this.verts = 0;
    this.indices = 0;
  }
  grow(cap) {
    const copy = (Type, old, n) => {
      const a = new Type(cap * n);
      if (old) a.set(old);
      return a;
    };
    this.pos = copy(Uint8Array, this.pos, 3);
    this.nrm = copy(Int8Array, this.nrm, 3);
    this.uv = copy(Uint16Array, this.uv, 2);
    this.col = copy(Uint8Array, this.col, 3);
    this.glow = copy(Uint8Array, this.glow, 1);
    this.cap = cap;
  }
  growIndex(cap) {
    const a = new Uint32Array(cap);
    if (this.idx) a.set(this.idx);
    this.idx = a;
    this.icap = cap;
  }
  build() {
    const v = this.verts;
    if (v === 0) return null;
    const n = this.indices;
    return {
      position: this.pos.slice(0, v * 3),
      normal: this.nrm.slice(0, v * 3),
      uv: this.uv.slice(0, v * 2),
      color: this.col.slice(0, v * 3),
      glow: this.glow.slice(0, v),
      index: v > 65535 ? this.idx.slice(0, n) : new Uint16Array(this.idx.subarray(0, n)),
    };
  }
}

const solid = new Buffers();
const water = new Buffers();
let grid = new Uint8Array(0);

/** Mesh a chunk straight away (used while loading). */
export function meshChunk(world, cx, cz) {
  const { grid: g, maxY } = copyChunk(world, cx, cz, false);
  return meshGrid(g, maxY);
}

/**
 * Copy a chunk and its one-block border into a padded grid (y from -1 to maxY + 1).
 * `fresh` gives a new array (to hand to the meshing worker); otherwise a shared one is reused.
 */
export function copyChunk(world, cx, cz, fresh) {
  const data = world.data;
  const x0 = cx * CS;
  const z0 = cz * CS;
  const maxY = Math.min(SY - 1, world.chunkMaxY[cx + cz * (SX / CS)] + 1);
  const PY = maxY + 3;
  if (fresh) grid = new Uint8Array(PXZ * PY);
  else if (grid.length < PXZ * PY) grid = new Uint8Array(PXZ * PY);
  for (let py = 0; py < PY; py++) {
    const y = py - 1;
    for (let pz = 0; pz < PZ; pz++) {
      const z = z0 + pz - 1;
      const row = pz * PX + py * PXZ;
      if (y >= 0 && y < SY && z >= 0 && z < SZ && x0 > 0 && x0 + CS < SX) {
        // whole row inside the map: straight copy
        const src = x0 - 1 + SX * (z + SZ * y);
        for (let px = 0; px < PX; px++) grid[row + px] = data[src + px];
      } else {
        for (let px = 0; px < PX; px++) grid[row + px] = world.get(x0 + px - 1, y, z);
      }
    }
  }

  return { grid, maxY };
}

/** Turn a padded grid (from copyChunk) into mesh data. Pure, so it also runs in a worker. */
export function meshGrid(grid, maxY) {
  solid.reset();
  water.reset();
  // locals keep the hot loop free of module-binding and property lookups
  const g = grid;
  const OP = OPAQUE, TILES = BLOCK_TILES, UVS = TILE_UV, GL = GLOW;
  const AIR = B.AIR, WATER = B.WATER;
  const n0 = N_OFF[0], n1 = N_OFF[1], n2 = N_OFF[2], n3 = N_OFF[3], n4 = N_OFF[4], n5 = N_OFF[5];
  const ao = [0, 0, 0, 0];
  for (let y = 0; y <= maxY; y++) {
    for (let z = 0; z < CS; z++) {
      let gi = 1 + (z + 1) * PX + (y + 1) * PXZ;
      for (let x = 0; x < CS; x++, gi++) {
        const b = g[gi];
        if (b === AIR) continue;
        const isWater = b === WATER;
        // most blocks are buried: skip them with six quick checks
        if (!isWater && OP[g[gi + n0]] && OP[g[gi + n1]] && OP[g[gi + n2]] && OP[g[gi + n3]] && OP[g[gi + n4]] && OP[g[gi + n5]]) continue;
        for (let f = 0; f < 6; f++) {
          const nb = g[gi + N_OFF[f]];
          if (isWater) {
            if (f !== 2 || nb !== AIR) continue; // water: only the surface
          } else if (OP[nb]) continue;

          // ambient occlusion
          if (isWater) {
            ao[0] = ao[1] = ao[2] = ao[3] = 3;
          } else {
            const ar = AO_OFF[f];
            for (let k = 0, j = 0; k < 4; k++, j += 3) {
              const s1 = OP[g[gi + ar[j]]];
              const s2 = OP[g[gi + ar[j + 1]]];
              const c = OP[g[gi + ar[j + 2]]];
              ao[k] = s1 && s2 ? 0 : 3 - s1 - s2 - c;
            }
          }

          const buf = isWater ? water : solid;
          if (buf.verts + 4 > buf.cap) buf.grow(buf.cap * 2);
          if (buf.indices + 6 > buf.icap) buf.growIndex(buf.icap * 2);
          const tile = TILES[b * 3 + TILE_SLOT[f]];
          const glow = GL[tile];
          const d = DIRS[f];
          const nx = d[0] * 127, ny = d[1] * 127, nz = d[2] * 127;
          const corners = CORNERS[f];
          const base = buf.verts;
          const { pos, nrm, uv, col } = buf;
          for (let k = 0; k < 4; k++) {
            const cn = corners[k];
            const v = base + k;
            const p3 = v * 3;
            pos[p3] = x + cn.dx;
            pos[p3 + 1] = y + cn.dy;
            pos[p3 + 2] = z + cn.dz;
            nrm[p3] = nx;
            nrm[p3 + 1] = ny;
            nrm[p3 + 2] = nz;
            const t = tile * 8 + (cn.tu * 2 + cn.tv) * 2;
            uv[v * 2] = UVS[t];
            uv[v * 2 + 1] = UVS[t + 1];
            const l = AO_LIGHT[ao[k]];
            col[p3] = col[p3 + 1] = col[p3 + 2] = l;
            buf.glow[v] = glow;
          }
          // flip the quad diagonal so AO interpolates without artefacts
          const idx = buf.idx;
          let i = buf.indices;
          if (ao[0] + ao[2] < ao[1] + ao[3]) {
            idx[i++] = base + 1; idx[i++] = base + 2; idx[i++] = base + 3;
            idx[i++] = base + 1; idx[i++] = base + 3; idx[i++] = base;
          } else {
            idx[i++] = base; idx[i++] = base + 1; idx[i++] = base + 2;
            idx[i++] = base; idx[i++] = base + 2; idx[i++] = base + 3;
          }
          buf.indices = i;
          buf.verts += 4;
        }
      }
    }
  }
  return { solid: solid.build(), water: water.build() };
}
