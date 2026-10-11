// Voxel storage: one flat Uint8Array for the whole city, plus queries and raycasts.
import { B, SOLID, OPAQUE } from './Blocks.js';

export const SX = 512;
export const SZ = 512;
export const SY = 128;
export const CS = 32; // chunk size in x/z
export const CX = SX / CS;
export const CZ = SZ / CS;

export class World {
  constructor() {
    this.data = new Uint8Array(SX * SY * SZ);
    this.chunkMaxY = new Uint8Array(CX * CZ);
    this.dirty = new Set();
    this.original = new Map(); // index -> block before the first runtime edit
  }

  inBounds(x, y, z) {
    return x >= 0 && z >= 0 && y >= 0 && x < SX && z < SZ && y < SY;
  }

  /** Outside the map counts as stone (an invisible wall); above the map is air. */
  get(x, y, z) {
    if (y >= SY) return B.AIR;
    if (x < 0 || z < 0 || y < 0 || x >= SX || z >= SZ) return B.STONE;
    return this.data[x + SX * (z + SZ * y)];
  }

  set(x, y, z, b) {
    if (!this.inBounds(x, y, z)) return;
    this.data[x + SX * (z + SZ * y)] = b;
    if (b !== B.AIR) {
      const ci = (x >> 5) + (z >> 5) * CX;
      if (y > this.chunkMaxY[ci]) this.chunkMaxY[ci] = y;
    }
  }

  /** Set a block at runtime and mark affected chunks for remeshing. */
  edit(x, y, z, b) {
    if (!this.inBounds(x, y, z)) return;
    const i = x + SX * (z + SZ * y);
    if (!this.original.has(i)) this.original.set(i, this.data[i]);
    this.set(x, y, z, b);
    this.markDirty(x, z);
  }

  /** Undo every runtime edit (melted holes, smashed windows, ice...). */
  revertEdits() {
    for (const [i, b] of this.original) {
      this.data[i] = b;
      const x = i % SX;
      const z = Math.floor(i / SX) % SZ;
      this.markDirty(x, z);
    }
    this.original.clear();
  }

  markDirty(x, z) {
    const cx = x >> 5;
    const cz = z >> 5;
    this.dirty.add(cx + cz * CX);
    if ((x & 31) === 0 && cx > 0) this.dirty.add(cx - 1 + cz * CX);
    if ((x & 31) === 31 && cx < CX - 1) this.dirty.add(cx + 1 + cz * CX);
    if ((z & 31) === 0 && cz > 0) this.dirty.add(cx + (cz - 1) * CX);
    if ((z & 31) === 31 && cz < CZ - 1) this.dirty.add(cx + (cz + 1) * CX);
  }

  isSolid(x, y, z) {
    return SOLID[this.get(x, y, z)] === 1;
  }

  isOpaque(x, y, z) {
    return OPAQUE[this.get(x, y, z)] === 1;
  }

  /** Highest solid block y in a column, or -1. */
  surfaceY(x, z) {
    for (let y = SY - 1; y >= 0; y--) if (SOLID[this.get(x, y, z)]) return y;
    return -1;
  }

  /**
   * Voxel DDA raycast against solid blocks.
   * Returns { t, x, y, z, nx, ny, nz, block } or null.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let x = Math.floor(ox);
    let y = Math.floor(oy);
    let z = Math.floor(oz);
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tMaxX = dx !== 0 ? (dx > 0 ? x + 1 - ox : ox - x) * tDeltaX : Infinity;
    let tMaxY = dy !== 0 ? (dy > 0 ? y + 1 - oy : oy - y) * tDeltaY : Infinity;
    let tMaxZ = dz !== 0 ? (dz > 0 ? z + 1 - oz : oz - z) * tDeltaZ : Infinity;
    let t = 0;
    let nx = 0, ny = 0, nz = 0;
    while (t <= maxDist) {
      const b = this.get(x, y, z);
      if (SOLID[b]) return { t, x, y, z, nx, ny, nz, block: b };
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX;
        t = tMaxX;
        tMaxX += tDeltaX;
        nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY;
        t = tMaxY;
        tMaxY += tDeltaY;
        nx = 0; ny = -stepY; nz = 0;
      } else {
        z += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        nx = 0; ny = 0; nz = -stepZ;
      }
    }
    return null;
  }
}
