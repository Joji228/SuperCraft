// Helpers for picking places in the city for events and missions.
import * as THREE from 'three';
import { B } from '../world/Blocks.js';
import { CITY, lotOrigin } from '../world/CityGenerator.js';

const STREET = new Set([B.SIDEWALK, B.ASPHALT, B.LINE_X_HI, B.LINE_X_LO, B.LINE_Z_HI, B.LINE_Z_LO, B.CROSS_X, B.CROSS_Z, B.STONE_BEIGE, B.CONCRETE]);

/** Is (x, z) open street-level ground with headroom? */
export function isStreet(world, x, z, clear = 3) {
  const bx = Math.floor(x), bz = Math.floor(z);
  if (!STREET.has(world.get(bx, CITY.G - 1, bz))) return false;
  for (let y = CITY.G; y < CITY.G + clear; y++) if (world.get(bx, y, bz) !== B.AIR) return false;
  return true;
}

/** Random street spot at a distance from (cx, cz) whose surroundings are open too. */
export function findStreetSpot(world, cx, cz, minR, maxR, margin = 2) {
  for (let i = 0; i < 80; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = minR + Math.random() * (maxR - minR);
    const x = Math.floor(cx + Math.cos(a) * r) + 0.5;
    const z = Math.floor(cz + Math.sin(a) * r) + 0.5;
    if (x < 20 || z < 20 || x > 460 || z > 460) continue;
    let ok = isStreet(world, x, z);
    if (margin > 0) {
      for (let dz = -margin; dz <= margin && ok; dz += margin) for (let dx = -margin; dx <= margin && ok; dx += margin) ok = isStreet(world, x + dx, z + dz);
    }
    if (ok) return new THREE.Vector3(x, CITY.G, z);
  }
  return null;
}

/** Nearest intersection centre to a point. */
export function nearestIntersection(x, z) {
  const i = Math.round((x - CITY.O - 4) / CITY.CELL);
  const j = Math.round((z - CITY.O - 4) / CITY.CELL);
  const ci = Math.max(0, Math.min(CITY.NC, i));
  const cj = Math.max(0, Math.min(CITY.NC, j));
  return new THREE.Vector3(CITY.O + ci * CITY.CELL + 4, CITY.G, CITY.O + cj * CITY.CELL + 4);
}

/** Buildings whose footprint centre is within a radius, optionally filtered. */
export function buildingsNear(world, x, z, radius, filter) {
  return world.buildings.filter((b) => {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    return Math.hypot(cx - x, cz - z) < radius && (!filter || filter(b));
  });
}

/**
 * Points just outside a building's walls at given heights: good spots for facade fires.
 * Returns [{ pos, nx, nz }] with the outward normal.
 */
export function facadePoints(world, b, count, yMin, yMax) {
  const out = [];
  for (let i = 0; i < count * 6 && out.length < count; i++) {
    const side = Math.floor(Math.random() * 4);
    const y = Math.floor(yMin + Math.random() * (yMax - yMin));
    let x, z, nx = 0, nz = 0;
    if (side === 0) { x = b.x0 + 1 + Math.floor(Math.random() * (b.x1 - b.x0 - 2)); z = b.z0 - 1; nz = -1; }
    else if (side === 1) { x = b.x0 + 1 + Math.floor(Math.random() * (b.x1 - b.x0 - 2)); z = b.z1; nz = 1; }
    else if (side === 2) { x = b.x0 - 1; z = b.z0 + 1 + Math.floor(Math.random() * (b.z1 - b.z0 - 2)); nx = -1; }
    else { x = b.x1; z = b.z0 + 1 + Math.floor(Math.random() * (b.z1 - b.z0 - 2)); nx = 1; }
    // the wall block behind must be solid and the spot itself open
    if (world.get(x, y, z) !== B.AIR || !world.isSolid(x - nx, y, z - nz)) continue;
    if (out.some((o) => Math.abs(o.pos.x - x - 0.5) + Math.abs(o.pos.y - y) + Math.abs(o.pos.z - z - 0.5) < 3)) continue;
    out.push({ pos: new THREE.Vector3(x + 0.5, y + 0.2, z + 0.5), nx, nz, wx: x - nx, wz: z - nz, y });
  }
  return out;
}

export function lotCenter(i, j) {
  const [x0, z0] = lotOrigin(i, j);
  return new THREE.Vector3(x0 + 16, CITY.G, z0 + 16);
}
