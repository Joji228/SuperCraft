// Procedural generation of Brightport: road grid, districts, river, bridge and harbour.
import { B } from './Blocks.js';
import { SX, SZ, SY } from './World.js';
import { RNG, hash3 } from '../util/rng.js';

export const CITY = {
  G: 12, // first air layer above the ground (ground surface block is at y = 11)
  O: 16, // city origin (x and z)
  CELL: 40, // road + lot pitch
  ROAD: 8,
  NC: 11, // lots per side
  RIVER_ROW: 6, // lot row replaced by the river
  BRIDGE_ROAD: 5, // north-south road that crosses the river
  LAND0: 8,
  LAND1: 472,
};

const { G, O, CELL, ROAD, NC, RIVER_ROW, BRIDGE_ROAD, LAND0, LAND1 } = CITY;
const SURF = G - 1;
const CITY_END = O + NC * CELL + ROAD;
const LOT = CELL - ROAD; // 32
const INNER = LOT - 4; // 28, inside the sidewalks

export function lotOrigin(i, j) {
  return [O + i * CELL + ROAD, O + j * CELL + ROAD];
}

export function riverZ() {
  const z0 = O + RIVER_ROW * CELL + ROAD;
  return [z0 + 2, z0 + LOT - 2]; // water channel [z0, z1)
}

/** Spawn point and facing for the hero (plaza south of the fountain, looking north at downtown). */
export function spawnPoint() {
  const [x0, z0] = lotOrigin(5, 3);
  return { x: x0 + 16.5, y: G, z: z0 + 28.5, yaw: 0 };
}

/** Road and sidewalk surface block for a city column, or null for lot interiors / outside. */
function streetSurface(x, z) {
  const lx = x - O;
  const lz = z - O;
  if (lx < 0 || lz < 0 || x >= CITY_END || z >= CITY_END) return null;
  const ox = lx % CELL;
  const oz = lz % CELL;
  const roadX = ox < ROAD; // inside a north-south road
  const roadZ = oz < ROAD; // inside an east-west road
  if (roadX && roadZ) return B.ASPHALT;
  if (roadX) {
    if (oz < ROAD + 3 || oz >= CELL - 3) return B.CROSS_Z;
    if (lz % 6 < 4) {
      if (ox === 3) return B.LINE_Z_HI;
      if (ox === 4) return B.LINE_Z_LO;
    }
    return B.ASPHALT;
  }
  if (roadZ) {
    if (ox < ROAD + 3 || ox >= CELL - 3) return B.CROSS_X;
    if (lx % 6 < 4) {
      if (oz === 3) return B.LINE_X_HI;
      if (oz === 4) return B.LINE_X_LO;
    }
    return B.ASPHALT;
  }
  const ix = ox - ROAD;
  const iz = oz - ROAD;
  if (ix < 2 || iz < 2 || ix >= LOT - 2 || iz >= LOT - 2) return B.SIDEWALK;
  return null;
}

export function generateCity(world, seed = 20261011) {
  const rng = new RNG(seed);
  world.buildings = []; // footprints, used by missions and events
  const set = (x, y, z, b) => world.set(x, y, z, b);
  const get = (x, y, z) => world.get(x, y, z);
  const fillBox = (x0, y0, z0, x1, y1, z1, b) => {
    for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) set(x, y, z, b);
  };
  const setTop = (x0, z0, x1, z1, b) => fillBox(x0, SURF, z0, x1, SURF + 1, z1, b);

  // ---------- terrain, sea and beach ----------
  for (let z = 0; z < SZ; z++) {
    for (let x = 0; x < SX; x++) {
      const land = x >= LAND0 && x < LAND1 && z >= LAND0 && z < LAND1;
      if (land) {
        for (let y = 0; y < SURF - 2; y++) set(x, y, z, B.STONE);
        set(x, SURF - 2, z, B.DIRT);
        set(x, SURF - 1, z, B.DIRT);
        const edge = Math.min(x - LAND0, LAND1 - 1 - x, z - LAND0, LAND1 - 1 - z);
        set(x, SURF, z, edge < 4 ? B.SAND : B.GRASS);
      } else {
        for (let y = 0; y < 3; y++) set(x, y, z, B.STONE);
        set(x, 3, z, B.SAND);
        for (let y = 4; y < SURF; y++) set(x, y, z, B.WATER);
      }
    }
  }

  // ---------- streets and sidewalks ----------
  for (let z = O; z < CITY_END; z++) {
    for (let x = O; x < CITY_END; x++) {
      const s = streetSurface(x, z);
      if (s !== null) set(x, SURF, z, s);
    }
  }

  // ---------- river ----------
  const [rz0, rz1] = riverZ();
  for (let z = rz0; z < rz1; z++) {
    for (let x = 0; x < SX; x++) {
      for (let y = 3; y <= SURF; y++) set(x, y, z, B.AIR);
      set(x, 3, z, B.SAND);
      for (let y = 4; y < SURF; y++) set(x, y, z, B.WATER);
    }
  }
  // barriers where north-south roads end at the river
  for (let r = 0; r <= NC; r++) {
    if (r === BRIDGE_ROAD) continue;
    const rx = O + r * CELL;
    for (let x = rx; x < rx + ROAD; x++) {
      set(x, G, rz0 - 1, B.HAZARD);
      set(x, G, rz1, B.HAZARD);
    }
  }

  // ---------- helpers for structures ----------
  function tree(x, z, h = rng.int(4, 6), r = 2) {
    const yb = G;
    for (let y = yb; y < yb + h; y++) set(x, y, z, B.LOG);
    const cy = yb + h - 1;
    for (let dy = -r; dy <= r + 1; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const d = dx * dx + dz * dz + dy * dy * 1.3;
          if (d > r * r + 1.2) continue;
          if (d > r * r - 0.5 && hash3(x + dx, cy + dy, z + dz, 7) < 0.4) continue;
          if (get(x + dx, cy + dy, z + dz) === B.AIR) set(x + dx, cy + dy, z + dz, B.LEAVES);
        }
      }
    }
  }

  function lamp(x, z) {
    for (let y = G; y < G + 4; y++) set(x, y, z, B.METAL);
    set(x, G + 4, z, B.LAMP);
  }

  function cylinder(cx, cz, r, y0, y1, blockFn) {
    for (let y = y0; y < y1; y++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dz * dz <= r * r + r * 0.8) set(cx + dx, y, cz + dz, blockFn(y, dx, dz));
        }
      }
    }
  }

  function facade(st, u, len, ry, corner, x, y, z) {
    const win = hash3(x, y, z, 3) < 0.1 ? B.GLASS_LIT : st.glass;
    const mid = len >> 1;
    if (ry < 4 && st.storefront) {
      if (corner || ry === 3) return st.trim;
      if ((u === mid || u === mid - 1) && ry < 3) return B.DOOR;
      if (u % 4 === 0) return st.trim;
      return B.GLASS_DARK;
    }
    switch (st.kind) {
      case 'glass':
        if (corner || u % 4 === 0) return st.trim;
        if (ry % 4 === 3) return st.spandrel;
        return win;
      case 'office':
        if (corner || ry % 4 === 3) return st.trim;
        if (u % 3 === 0) return st.wall;
        return win;
      case 'brick':
        if (corner) return st.trim;
        if (ry % 4 === 0 || ry % 4 === 3 || u % 3 === 0) return st.wall;
        return win;
      case 'panel':
        if (corner) return st.trim;
        if (ry % 4 === 3) return st.accent;
        if (u % 2 === 0) return st.wall;
        return win;
      case 'house':
        if (corner) return st.trim;
        if (ry < 2 && u === mid) return B.DOOR;
        if (ry % 3 === 1 && u % 3 === 1) return win;
        return st.wall;
      case 'warehouse':
        if (ry === 0) return B.HAZARD;
        if (Math.abs(u - mid) < 3 && ry < 5) return B.CONCRETE_DARK;
        if (ry === st.height - 2 && u % 2 === 1) return B.GLASS_DARK;
        if (corner) return st.trim;
        return st.wall;
      default:
        return st.wall;
    }
  }

  /** Solid box with facades on the perimeter; parapet on top. yt is exclusive. */
  function box(x0, z0, x1, z1, yb, yt, st) {
    for (let z = z0; z < z1; z++) {
      for (let x = x0; x < x1; x++) {
        const ex = x === x0 || x === x1 - 1;
        const ez = z === z0 || z === z1 - 1;
        const perim = ex || ez;
        const corner = ex && ez;
        if (!perim) {
          for (let y = yb; y < yt - 1; y++) set(x, y, z, B.INTERIOR);
          set(x, yt - 1, z, st.roof || B.ROOF);
          continue;
        }
        const alongX = ez && !ex;
        const u = alongX ? x - x0 : z - z0;
        const len = alongX ? x1 - x0 : z1 - z0;
        for (let y = yb; y < yt; y++) set(x, y, z, facade(st, u, len, y - G, corner, x, y, z));
        if (st.parapet !== false) set(x, yt, z, st.trim);
      }
    }
  }

  function roofProps(x0, z0, x1, z1, top, st, opts = {}) {
    const ix0 = x0 + 1, iz0 = z0 + 1, ix1 = x1 - 1, iz1 = z1 - 1;
    const w = ix1 - ix0, d = iz1 - iz0;
    if (w < 4 || d < 4) return;
    const cx = (ix0 + ix1) >> 1;
    const cz = (iz0 + iz1) >> 1;
    if (opts.helipad && w >= 9 && d >= 9) {
      for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) set(cx + dx, top - 1, cz + dz, B.CONCRETE_DARK);
      for (let dz = -3; dz <= 3; dz++) {
        set(cx - 2, top - 1, cz + dz, B.PAINT_WHITE);
        set(cx + 2, top - 1, cz + dz, B.PAINT_WHITE);
      }
      set(cx - 1, top - 1, cz, B.PAINT_WHITE);
      set(cx, top - 1, cz, B.PAINT_WHITE);
      set(cx + 1, top - 1, cz, B.PAINT_WHITE);
      return;
    }
    if (opts.antenna) {
      const h = Math.min(rng.int(6, 14), SY - 2 - top);
      for (let y = top; y < top + h; y++) set(cx, y, cz, B.METAL);
      set(cx, top + h, cz, B.RED_LIGHT);
      set(cx - 1, top, cz, B.METAL);
      set(cx + 1, top, cz, B.METAL);
    }
    if (opts.waterTower && w >= 7 && d >= 7) {
      const tx = ix0 + 3, tz = iz0 + 3;
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (let y = top; y < top + 3; y++) set(tx + lx, y, tz + lz, B.LOG);
      cylinder(tx, tz, 2, top + 3, top + 7, () => B.PLANKS);
      cylinder(tx, tz, 1, top + 7, top + 8, () => B.METAL_ROOF);
    }
    const units = rng.int(1, 4);
    for (let k = 0; k < units; k++) {
      const ax = rng.int(ix0, ix1 - 2);
      const az = rng.int(iz0, iz1 - 2);
      if (get(ax, top, az) !== B.AIR || get(ax + 1, top, az + 1) !== B.AIR) continue;
      fillBox(ax, top, az, ax + 2, top + 1 + (rng.chance(0.4) ? 1 : 0), az + 2, B.METAL);
    }
  }

  function randomGlass() {
    return rng.pick([B.GLASS_BLUE, B.GLASS_BLUE, B.GLASS_TEAL, B.GLASS_GOLD]);
  }

  function styleFor(kind) {
    switch (kind) {
      case 'glass': {
        const glass = randomGlass();
        return { kind, glass, trim: rng.pick([B.METAL, B.CONCRETE_DARK, B.PANEL_WHITE]), spandrel: rng.chance(0.5) ? glass : B.GLASS_DARK, storefront: true };
      }
      case 'office':
        return { kind, wall: rng.pick([B.CONCRETE, B.STONE_BEIGE, B.PANEL_WHITE]), trim: rng.pick([B.CONCRETE_DARK, B.STONE_BEIGE, B.CONCRETE]), glass: rng.pick([B.GLASS_BLUE, B.GLASS_DARK, B.GLASS_TEAL]), storefront: true };
      case 'brick': {
        const wall = rng.pick([B.BRICK, B.BRICK, B.BRICK_TAN]);
        return { kind, wall, trim: wall === B.BRICK ? B.STONE_BEIGE : B.BRICK, glass: rng.pick([B.GLASS_DARK, B.GLASS_BLUE]), storefront: rng.chance(0.6) };
      }
      case 'panel':
        return { kind, wall: B.PANEL_WHITE, trim: B.CONCRETE_DARK, accent: rng.pick([B.PANEL_RED, B.PANEL_ORANGE, B.PANEL_YELLOW, B.PANEL_TEAL, B.PANEL_PURPLE]), glass: rng.pick([B.GLASS_TEAL, B.GLASS_BLUE]), storefront: true };
      case 'house': {
        const wall = rng.pick([B.PANEL_YELLOW, B.PANEL_TEAL, B.PANEL_ORANGE, B.PANEL_WHITE, B.PLANKS, B.BRICK, B.PANEL_PURPLE, B.PANEL_RED]);
        return { kind, wall, trim: B.PANEL_WHITE, glass: B.GLASS_BLUE, roof: rng.pick([B.ROOF, B.METAL_ROOF]), storefront: false };
      }
      case 'warehouse':
        return { kind, wall: B.METAL, trim: B.CONCRETE_DARK, glass: B.GLASS_DARK, roof: B.METAL_ROOF, storefront: false };
      default:
        return styleFor('office');
    }
  }

  /** A building, with setback tiers when tall enough. */
  function tower(x0, z0, x1, z1, h, kind) {
    const st = styleFor(kind);
    st.height = h;
    const w = x1 - x0, d = z1 - z0;
    const top = G + h;
    const tiers = [];
    if (h >= 45 && Math.min(w, d) >= 14) {
      const h1 = G + Math.round(h * 0.6);
      const h2 = G + Math.round(h * 0.84);
      tiers.push([x0, z0, x1, z1, G, h1]);
      tiers.push([x0 + 2, z0 + 2, x1 - 2, z1 - 2, h1, h2]);
      tiers.push([x0 + 4, z0 + 4, x1 - 4, z1 - 4, h2, top]);
    } else {
      tiers.push([x0, z0, x1, z1, G, top]);
    }
    for (const [a, b, c, e, yb, yt] of tiers) box(a, b, c, e, yb, yt, st);
    world.buildings.push({ x0, z0, x1, z1, top, kind, tiers });
    const [fx0, fz0, fx1, fz1] = tiers[tiers.length - 1];
    roofProps(fx0, fz0, fx1, fz1, top, st, {
      helipad: kind === 'glass' && rng.chance(0.35),
      antenna: h > 30 && rng.chance(0.6),
      waterTower: kind === 'brick' && rng.chance(0.6),
    });
  }

  function containerStack(x, z, alongX) {
    const colors = [B.CONT_BLUE, B.CONT_RED, B.CONT_GREEN, B.PANEL_ORANGE];
    const n = rng.int(1, 3);
    for (let k = 0; k < n; k++) {
      const c = rng.pick(colors);
      const y0 = G + k * 2;
      if (alongX) fillBox(x, y0, z, x + 6, y0 + 2, z + 2, c);
      else fillBox(x, y0, z, x + 2, y0 + 2, z + 6, c);
    }
  }

  // ---------- districts ----------
  function district(i, j) {
    if (j > RIVER_ROW) {
      if (i === NC - 1) return 'harbor';
      return i <= 2 ? 'residential' : 'industrial';
    }
    if ((i === 1 || i === 2) && (j === 1 || j === 2)) return 'park';
    if (i === 5 && j === 3) return 'plaza';
    const d = Math.hypot(i - 5.5, j - 2.5);
    if (d < 2.3) return 'downtown';
    if (d < 4.3) return 'midtown';
    return 'residential';
  }

  const builders = {
    downtown(ax, az) {
      setTop(ax, az, ax + INNER, az + INNER, B.CONCRETE);
      const r = rng.next();
      const kind = () => (rng.chance(0.6) ? 'glass' : 'office');
      if (r < 0.5) {
        const m = rng.int(1, 3);
        tower(ax + m, az + m, ax + INNER - m, az + INNER - m, rng.int(55, 100), kind());
      } else if (r < 0.8) {
        if (rng.chance(0.5)) {
          tower(ax + 1, az + 1, ax + 13, az + INNER - 1, rng.int(40, 92), kind());
          tower(ax + 15, az + 1, ax + INNER - 1, az + INNER - 1, rng.int(40, 92), kind());
        } else {
          tower(ax + 1, az + 1, ax + INNER - 1, az + 13, rng.int(40, 92), kind());
          tower(ax + 1, az + 15, ax + INNER - 1, az + INNER - 1, rng.int(40, 92), kind());
        }
      } else {
        for (const [qx, qz] of [[0, 0], [14, 0], [0, 14], [14, 14]]) tower(ax + qx + 1, az + qz + 1, ax + qx + 13, az + qz + 13, rng.int(32, 80), kind());
      }
    },
    midtown(ax, az) {
      setTop(ax, az, ax + INNER, az + INNER, B.CONCRETE);
      const kind = () => rng.pick(['office', 'brick', 'panel', 'panel', 'glass']);
      if (rng.chance(0.4)) {
        if (rng.chance(0.5)) {
          tower(ax + 1, az + 1, ax + 13, az + INNER - 1, rng.int(16, 46), kind());
          tower(ax + 15, az + 1, ax + INNER - 1, az + INNER - 1, rng.int(16, 46), kind());
        } else {
          tower(ax + 1, az + 1, ax + INNER - 1, az + 13, rng.int(16, 46), kind());
          tower(ax + 1, az + 15, ax + INNER - 1, az + INNER - 1, rng.int(16, 46), kind());
        }
      } else {
        for (const [qx, qz] of [[0, 0], [14, 0], [0, 14], [14, 14]]) tower(ax + qx + 1, az + qz + 1, ax + qx + 13, az + qz + 13, rng.int(12, 40), kind());
      }
    },
    residential(ax, az) {
      for (const [qx, qz] of [[0, 0], [14, 0], [0, 14], [14, 14]]) {
        const bx = ax + qx, bz = az + qz;
        if (rng.chance(0.4)) {
          const s = rng.int(9, 11);
          const o = Math.floor((14 - s) / 2);
          tower(bx + o, bz + o, bx + o + s, bz + o + s, rng.int(8, 18), 'brick');
        } else {
          const s = rng.int(7, 9);
          const o = rng.int(1, 14 - s - 1);
          tower(bx + o, bz + o, bx + o + s, bz + o + s, rng.int(5, 8), 'house');
          // little garden path and a tree
          const tx = bx + (o > 6 ? 2 : 11);
          const tz = bz + (o > 6 ? 2 : 11);
          if (get(tx, G, tz) === B.AIR) tree(tx, tz, rng.int(4, 5), 2);
        }
      }
      for (let k = 0; k < 6; k++) {
        const fx = ax + rng.int(0, INNER - 1), fz = az + rng.int(0, INNER - 1);
        if (get(fx, G, fz) === B.AIR && get(fx, SURF, fz) === B.GRASS) set(fx, SURF, fz, B.FLOWERS);
      }
    },
    park(ax, az, i, j) {
      // paths crossing the lot
      setTop(ax + 13, az, ax + 15, az + INNER, B.SAND);
      setTop(ax, az + 13, ax + INNER, az + 15, B.SAND);
      const pond = i === 2 && j === 2;
      if (pond) {
        for (let z = az; z < az + INNER; z++) {
          for (let x = ax; x < ax + INNER; x++) {
            const dx = (x - (ax + 6.5)) / 5.5, dz = (z - (az + 6.5)) / 4.5;
            if (dx * dx + dz * dz < 1) {
              set(x, SURF - 2, z, B.SAND);
              set(x, SURF - 1, z, B.WATER);
              set(x, SURF, z, B.WATER);
            }
          }
        }
      }
      for (let k = 0; k < 14; k++) {
        const tx = ax + rng.int(2, INNER - 3), tz = az + rng.int(2, INNER - 3);
        if (get(tx, SURF, tz) !== B.GRASS) continue;
        if (Math.abs(tx - (ax + 13.5)) < 3 || Math.abs(tz - (az + 13.5)) < 3) continue;
        if (get(tx, G, tz) !== B.AIR) continue;
        tree(tx, tz, rng.int(4, 7), rng.chance(0.3) ? 3 : 2);
      }
      for (let k = 0; k < 24; k++) {
        const fx = ax + rng.int(0, INNER - 1), fz = az + rng.int(0, INNER - 1);
        if (get(fx, SURF, fz) === B.GRASS && get(fx, G, fz) === B.AIR) set(fx, SURF, fz, B.FLOWERS);
      }
    },
    plaza(ax, az) {
      setTop(ax, az, ax + INNER, az + INNER, B.STONE_BEIGE);
      const cx = ax + 14, cz = az + 14;
      for (let dz = -6; dz <= 6; dz++) {
        for (let dx = -6; dx <= 6; dx++) {
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d <= 4.6) set(cx + dx, SURF, cz + dz, B.WATER);
          else if (d <= 5.6) set(cx + dx, G, cz + dz, B.STONE_BEIGE);
        }
      }
      for (let y = SURF; y < G + 3; y++) set(cx, y, cz, B.STONE_BEIGE);
      set(cx, G + 3, cz, B.WATER);
      for (const [dx, dz] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) {
        set(cx + dx, SURF, cz + dz, B.GRASS);
        tree(cx + dx, cz + dz, 5, 2);
      }
      for (const [dx, dz] of [[-12, 0], [12, 0], [0, -12]]) lamp(cx + dx, cz + dz);
    },
    industrial(ax, az) {
      setTop(ax, az, ax + INNER, az + INNER, B.CONCRETE_DARK);
      const wd = rng.int(12, 16);
      tower(ax + 1, az + 1, ax + INNER - 1, az + 1 + wd, rng.int(8, 12), 'warehouse');
      const sz = az + wd + 3;
      if (rng.chance(0.5)) {
        const r = 3;
        for (let k = 0; k < 2; k++) {
          const cx = ax + 6 + k * 13, cz = Math.min(sz + 4, az + INNER - 5);
          const h = rng.int(8, 13);
          cylinder(cx, cz, r, G, G + h, (y) => (y === G + 2 || y === G + h - 1 ? B.HAZARD : B.METAL));
          cylinder(cx, cz, r - 1, G + h, G + h + 1, () => B.METAL_ROOF);
        }
      } else {
        for (let x = ax + 1; x < ax + INNER - 6; x += 7) containerStack(x, sz, true);
        if (sz + 4 < az + INNER - 2) for (let x = ax + 1; x < ax + INNER - 6; x += 7) containerStack(x, sz + 3, true);
      }
      if (rng.chance(0.45)) {
        const cx = ax + INNER - 3, cz = az + INNER - 3;
        const h = rng.int(24, 34);
        fillBox(cx, G, cz, cx + 2, G + h, cz + 2, B.BRICK);
        fillBox(cx, G + h, cz, cx + 2, G + h + 1, cz + 2, B.CONCRETE_DARK);
        set(cx, G + h + 1, cz, B.RED_LIGHT);
      }
    },
    harbor(ax, az) {
      setTop(ax, az, ax + INNER, az + INNER, B.CONCRETE_DARK);
      for (let z = az + 3; z < az + INNER - 3; z += 3) {
        for (let x = ax + 3; x < ax + INNER - 7; x += 7) if (rng.chance(0.8)) containerStack(x, z, true);
      }
      // gantry crane
      const H = 18;
      const legs = [[ax + 1, az + 1], [ax + INNER - 2, az + 1], [ax + 1, az + INNER - 2], [ax + INNER - 2, az + INNER - 2]];
      for (const [lx, lz] of legs) fillBox(lx, G, lz, lx + 1, G + H, lz + 1, B.PANEL_YELLOW);
      fillBox(ax + 1, G + H, az + 1, ax + INNER - 1, G + H + 1, az + 2, B.PANEL_YELLOW);
      fillBox(ax + 1, G + H, az + INNER - 2, ax + INNER - 1, G + H + 1, az + INNER - 1, B.PANEL_YELLOW);
      fillBox(ax + 12, G + H, az + 1, ax + 14, G + H + 1, az + INNER - 1, B.PANEL_YELLOW);
      fillBox(ax + 12, G + H - 2, az + 12, ax + 14, G + H, az + 15, B.HAZARD);
    },
  };

  for (let j = 0; j < NC; j++) {
    for (let i = 0; i < NC; i++) {
      if (j === RIVER_ROW) continue;
      const [x0, z0] = lotOrigin(i, j);
      const kind = district(i, j);
      builders[kind](x0 + 2, z0 + 2, i, j);
      // street lamps on the sidewalk edge
      for (const k of [10, 22]) {
        lamp(x0 + k, z0);
        lamp(x0 + k, z0 + LOT - 1);
        lamp(x0, z0 + k);
        lamp(x0 + LOT - 1, z0 + k);
      }
    }
  }

  // ---------- bridge ----------
  const bx = O + BRIDGE_ROAD * CELL;
  const qz0 = rz0 - 2;
  const qz1 = rz1 + 2;
  for (let z = qz0; z < qz1; z++) {
    for (let x = bx - 2; x < bx + ROAD + 2; x++) {
      set(x, SURF, z, streetSurface(x, z) ?? B.ASPHALT);
      set(x, SURF - 1, z, B.METAL);
    }
    for (const rx of [bx - 3, bx + ROAD + 2]) {
      set(rx, SURF, z, B.METAL);
      set(rx, G, z, B.METAL);
    }
  }
  // girders under the deck
  for (let z = rz0; z < rz1; z += 4) fillBox(bx - 2, SURF - 2, z, bx + ROAD + 2, SURF - 1, z + 1, B.METAL);
  const towerZ = [rz0 + 4, rz1 - 6];
  const TOP = G + 28;
  for (const tz of towerZ) {
    for (const tx of [bx - 4, bx + ROAD + 2]) {
      fillBox(tx, 3, tz, tx + 2, TOP + 1, tz + 2, B.PANEL_RED);
      set(tx, TOP + 1, tz, B.RED_LIGHT);
    }
    for (const by of [TOP - 1, TOP - 13]) fillBox(bx - 4, by, tz, bx + ROAD + 4, by + 2, tz + 2, B.PANEL_RED);
  }
  // suspension cables and hangers
  const zA = towerZ[0] + 1, zB = towerZ[1] + 1;
  const zm = (zA + zB) / 2;
  const half = (zB - zA) / 2;
  const cableY = (z) => {
    if (z < zA) return Math.round(G + 1 + ((TOP - G - 1) * (z - qz0)) / (zA - qz0));
    if (z > zB) return Math.round(G + 1 + ((TOP - G - 1) * (qz1 - 1 - z)) / (qz1 - 1 - zB));
    const t = (z - zm) / half;
    return Math.round(G + 3 + (TOP - G - 3) * t * t);
  };
  for (const cx of [bx - 3, bx + ROAD + 2]) {
    let prev = null;
    for (let z = qz0; z < qz1; z++) {
      const y = cableY(z);
      const lo = prev === null ? y : Math.min(prev, y);
      const hi = prev === null ? y : Math.max(prev, y);
      for (let yy = lo; yy <= hi; yy++) if (get(cx, yy, z) === B.AIR) set(cx, yy, z, B.METAL);
      if (z > zA && z < zB && z % 2 === 0) for (let yy = G + 1; yy < y; yy++) set(cx, yy, z, B.METAL);
      prev = y;
    }
  }

  // ---------- harbour piers and lighthouse ----------
  for (const pz of [40, 120, 200, 330, 410]) {
    for (let x = LAND1; x < LAND1 + 26; x++) {
      for (let z = pz; z < pz + 4; z++) set(x, SURF, z, B.PLANKS);
      if ((x - LAND1) % 5 === 4) {
        for (let y = 4; y < SURF; y++) {
          set(x, y, pz, B.LOG);
          set(x, y, pz + 3, B.LOG);
        }
      }
    }
    set(LAND1 + 25, G, pz, B.METAL);
    set(LAND1 + 25, G, pz + 3, B.METAL);
  }
  const lx = 494, lz = 494;
  cylinder(lx, lz, 5, 3, SURF + 1, (y) => (y === SURF ? B.STONE_BEIGE : B.STONE));
  cylinder(lx, lz, 2, G, G + 22, (y) => (Math.floor((y - G) / 4) % 2 ? B.PANEL_RED : B.PANEL_WHITE));
  cylinder(lx, lz, 3, G + 22, G + 23, () => B.CONCRETE_DARK);
  cylinder(lx, lz, 1, G + 23, G + 25, () => B.LAMP);
  cylinder(lx, lz, 2, G + 25, G + 26, () => B.PANEL_RED);
  set(lx, G + 26, lz, B.PANEL_RED);

  // ---------- a few extra midtown towers ----------
  // Added later (for the web-swinging hero): some of the midtown lots closest to
  // downtown get a taller tower, so the skyline steps down gradually instead of
  // dropping off and there's more to swing from. Done last, so the random choices
  // for everything above stay exactly as they were; none ends up taller than the
  // tallest downtown tower.
  const tallest = Math.max(...world.buildings.map((b) => b.top));
  const ring = [];
  for (let j = 0; j < NC; j++) {
    for (let i = 0; i < NC; i++) {
      if (j === RIVER_ROW || district(i, j) !== 'midtown') continue;
      ring.push({ i, j, d: Math.hypot(i - 5.5, j - 2.5) });
    }
  }
  ring.sort((a, b) => a.d - b.d);
  const picks = ring.slice(0, 12).filter(() => rng.chance(0.55)).slice(0, 7);
  for (const { i, j } of picks) {
    const [x0, z0] = lotOrigin(i, j);
    const ax = x0 + 2, az = z0 + 2;
    // clear the lot and forget its old buildings
    fillBox(ax, G, az, ax + INNER, SY, az + INNER, B.AIR);
    world.buildings = world.buildings.filter((b) => b.x1 <= ax || b.x0 >= ax + INNER || b.z1 <= az || b.z0 >= az + INNER);
    const kind = rng.chance(0.55) ? 'glass' : 'office';
    const cap = tallest - G - 8;
    if (rng.chance(0.6)) {
      const m = rng.int(1, 3);
      tower(ax + m, az + m, ax + INNER - m, az + INNER - m, Math.min(cap, rng.int(48, 76)), kind);
    } else if (rng.chance(0.5)) {
      tower(ax + 1, az + 1, ax + 13, az + INNER - 1, Math.min(cap, rng.int(42, 70)), kind);
      tower(ax + 15, az + 1, ax + INNER - 1, az + INNER - 1, Math.min(cap, rng.int(30, 58)), kind);
    } else {
      tower(ax + 1, az + 1, ax + INNER - 1, az + 13, Math.min(cap, rng.int(42, 70)), kind);
      tower(ax + 1, az + 15, ax + INNER - 1, az + INNER - 1, Math.min(cap, rng.int(30, 58)), kind);
    }
  }
}
