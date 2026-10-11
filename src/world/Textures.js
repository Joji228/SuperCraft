// Procedural 16x16 pixel-art texture atlas, drawn on a canvas at startup.
import * as THREE from 'three';
import { TILE_NAMES, ATLAS_COLS, ATLAS_CELL, ATLAS_SIZE } from './Blocks.js';
import { RNG } from '../util/rng.js';

const S = 16;

function painter(seed) {
  const px = new Uint8ClampedArray(S * S * 4);
  const rng = new RNG(seed);
  const p = {
    rng,
    px,
    set(x, y, c) {
      if (x < 0 || y < 0 || x >= S || y >= S) return;
      const i = (y * S + x) * 4;
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
      px[i + 3] = 255;
    },
    get(x, y) {
      const i = (y * S + x) * 4;
      return [px[i], px[i + 1], px[i + 2]];
    },
    vary(c, a) {
      const d = (rng.next() * 2 - 1) * a;
      return [c[0] + d, c[1] + d, c[2] + d];
    },
    fill(c, a = 0) {
      p.rect(0, 0, S, S, c, a);
    },
    rect(x0, y0, w, h, c, a = 0) {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) p.set(x, y, p.vary(c, a));
    },
    shade(x, y, f) {
      const c = p.get(x, y);
      p.set(x, y, [c[0] * f, c[1] * f, c[2] * f]);
    },
    speckle(c, n, a = 0) {
      for (let i = 0; i < n; i++) p.set(rng.int(0, S - 1), rng.int(0, S - 1), p.vary(c, a));
    },
  };
  return p;
}

const ASPHALT = [62, 64, 70];

function window(p, base, opts = {}) {
  const frame = opts.frame || [70, 76, 86];
  p.fill(base, 6);
  // vertical gradient: lighter at the top like reflected sky
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) p.shade(x, y, 1.18 - (y / S) * 0.32);
  // diagonal highlight streaks
  for (let i = 0; i < 6; i++) {
    p.set(3 + i, 11 - i, [235, 245, 255]);
    p.set(4 + i, 11 - i, [200, 225, 245]);
  }
  p.set(10, 13, [210, 230, 250]);
  p.set(11, 12, [210, 230, 250]);
  for (let i = 0; i < S; i++) {
    p.set(i, 0, frame);
    p.set(i, S - 1, frame);
    p.set(0, i, frame);
    p.set(S - 1, i, frame);
  }
  if (opts.mullion) for (let y = 1; y < S - 1; y++) p.set(8, y, frame);
}

function panel(p, c) {
  p.fill(c, 5);
  for (let i = 0; i < S; i++) {
    p.shade(i, 0, 0.82);
    p.shade(0, i, 0.82);
    p.shade(i, 8, 0.9);
  }
  p.set(2, 2, [c[0] * 0.75, c[1] * 0.75, c[2] * 0.75]);
  p.set(13, 2, [c[0] * 0.75, c[1] * 0.75, c[2] * 0.75]);
}

function bricks(p, brick, mortar) {
  p.fill(mortar, 6);
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 4 : 0;
    for (let b = -1; b < 2; b++) {
      const x0 = b * 8 + off;
      const tone = p.vary(brick, 14);
      for (let y = row * 4; y < row * 4 + 3; y++) for (let x = x0; x < x0 + 7; x++) p.set(x, y, p.vary(tone, 6));
    }
  }
}

function container(p, c) {
  p.fill(c, 4);
  for (let x = 0; x < S; x += 2) for (let y = 0; y < S; y++) p.shade(x, y, 0.8);
  for (let x = 0; x < S; x++) {
    p.set(x, 0, [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6]);
    p.set(x, S - 1, [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6]);
  }
}

function lineTile(p, axis, hi) {
  p.fill(ASPHALT, 7);
  p.speckle([95, 96, 100], 10);
  const yellow = [240, 196, 40];
  for (let i = 0; i < S; i++) {
    for (let k = 0; k < 2; k++) {
      const edge = hi ? k : S - 1 - k; // hi: row/col 0..1 (top rows = +z, right cols = +x)
      if (axis === 'x') p.set(i, edge, p.vary(yellow, 10));
      else p.set(hi ? S - 1 - k : k, i, p.vary(yellow, 10));
    }
  }
}

const PAINTERS = {
  stone: (p) => {
    p.fill([128, 128, 132], 14);
    p.speckle([95, 95, 100], 18, 8);
  },
  dirt: (p) => {
    p.fill([134, 96, 67], 14);
    p.speckle([100, 70, 48], 16, 6);
  },
  grass_top: (p) => {
    p.fill([104, 178, 64], 18);
    p.speckle([80, 150, 50], 20, 8);
    p.speckle([140, 205, 90], 8, 8);
  },
  grass_side: (p) => {
    p.fill([134, 96, 67], 14);
    p.speckle([100, 70, 48], 12, 6);
    for (let x = 0; x < S; x++) {
      const h = 3 + p.rng.int(0, 2);
      for (let y = 0; y < h; y++) p.set(x, y, p.vary([104, 178, 64], 14));
    }
  },
  sand: (p) => {
    p.fill([222, 210, 162], 10);
    p.speckle([196, 182, 136], 14);
  },
  asphalt: (p) => {
    p.fill(ASPHALT, 7);
    p.speckle([95, 96, 100], 12);
    p.speckle([45, 46, 50], 8);
  },
  line_x_hi: (p) => lineTile(p, 'x', true),
  line_x_lo: (p) => lineTile(p, 'x', false),
  line_z_hi: (p) => lineTile(p, 'z', true),
  line_z_lo: (p) => lineTile(p, 'z', false),
  cross_x: (p) => {
    p.fill(ASPHALT, 7);
    p.rect(0, 3, S, 10, [235, 235, 230], 8);
  },
  cross_z: (p) => {
    p.fill(ASPHALT, 7);
    p.rect(3, 0, 10, S, [235, 235, 230], 8);
  },
  sidewalk: (p) => {
    p.fill([184, 184, 178], 6);
    for (let i = 0; i < S; i++) {
      p.set(i, 0, [150, 150, 146]);
      p.set(0, i, [150, 150, 146]);
      p.set(i, 8, [165, 165, 160]);
      p.set(8, i, [165, 165, 160]);
    }
  },
  concrete: (p) => {
    p.fill([196, 196, 190], 7);
    p.speckle([170, 170, 166], 10);
  },
  concrete_dark: (p) => {
    p.fill([118, 122, 130], 7);
    p.speckle([98, 100, 108], 10);
  },
  brick: (p) => bricks(p, [172, 72, 56], [205, 196, 186]),
  brick_tan: (p) => bricks(p, [205, 166, 112], [226, 220, 205]),
  stone_beige: (p) => {
    p.fill([222, 206, 172], 7);
    for (let i = 0; i < S; i++) {
      p.set(i, 7, [190, 174, 142]);
      p.set(i, 15, [190, 174, 142]);
      p.set(i < 8 ? 4 : 12, i, [190, 174, 142]);
    }
  },
  glass_blue: (p) => window(p, [74, 136, 204]),
  glass_teal: (p) => window(p, [62, 178, 176]),
  glass_gold: (p) => window(p, [214, 172, 72], { frame: [120, 96, 50] }),
  glass_lit: (p) => {
    window(p, [255, 214, 120]);
    p.rect(2, 9, 5, 5, [235, 170, 90], 10);
  },
  glass_dark: (p) => window(p, [52, 68, 92]),
  metal: (p) => {
    p.fill([156, 162, 172], 5);
    for (let y = 0; y < S; y += 3) for (let x = 0; x < S; x++) p.shade(x, y, 0.92);
    for (const [x, y] of [[1, 1], [14, 1], [1, 14], [14, 14]]) p.set(x, y, [110, 114, 122]);
  },
  roof: (p) => {
    p.fill([120, 120, 118], 20);
    p.speckle([90, 90, 88], 20);
  },
  water: (p) => {
    p.fill([44, 118, 200], 8);
    for (let i = 0; i < 7; i++) {
      const x = p.rng.int(0, 12);
      const y = p.rng.int(0, 15);
      p.rect(x, y, 4, 1, [110, 175, 235], 6);
    }
  },
  leaves: (p) => {
    p.fill([62, 146, 52], 26);
    p.speckle([36, 96, 34], 26, 8);
    p.speckle([110, 190, 80], 10, 8);
  },
  log_side: (p) => {
    p.fill([104, 76, 48], 8);
    for (let x = 0; x < S; x += 3) for (let y = 0; y < S; y++) p.shade(x, y, 0.78);
  },
  log_top: (p) => {
    p.fill([104, 76, 48], 6);
    p.rect(2, 2, 12, 12, [182, 146, 96], 8);
    p.rect(5, 5, 6, 6, [160, 124, 80], 6);
    p.rect(7, 7, 2, 2, [182, 146, 96], 4);
  },
  planks: (p) => {
    p.fill([182, 140, 88], 8);
    for (let y = 0; y < S; y += 4) for (let x = 0; x < S; x++) p.set(x, y, [130, 96, 58]);
    p.set(6, 1, [130, 96, 58]);
    p.set(12, 5, [130, 96, 58]);
    p.set(3, 9, [130, 96, 58]);
    p.set(10, 13, [130, 96, 58]);
  },
  panel_white: (p) => panel(p, [236, 236, 230]),
  panel_red: (p) => panel(p, [222, 66, 60]),
  panel_orange: (p) => panel(p, [244, 146, 46]),
  panel_yellow: (p) => panel(p, [246, 210, 64]),
  panel_teal: (p) => panel(p, [40, 178, 164]),
  panel_purple: (p) => panel(p, [134, 92, 196]),
  interior: (p) => {
    p.fill([58, 52, 52], 6);
    p.speckle([80, 72, 70], 10);
  },
  lamp: (p) => {
    p.fill([255, 236, 170], 6);
    p.rect(4, 4, 8, 8, [255, 252, 225], 4);
  },
  door: (p) => {
    window(p, [60, 84, 110], { frame: [60, 60, 66], mullion: true });
    p.set(6, 8, [220, 200, 120]);
    p.set(9, 8, [220, 200, 120]);
  },
  red_light: (p) => {
    p.fill([236, 44, 40], 6);
    p.rect(5, 5, 6, 6, [255, 130, 120], 4);
  },
  hazard: (p) => {
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) p.set(x, y, ((x + y) >> 2) % 2 ? [30, 30, 30] : p.vary([246, 196, 32], 6));
  },
  container_blue: (p) => container(p, [46, 104, 186]),
  container_red: (p) => container(p, [196, 58, 46]),
  container_green: (p) => container(p, [58, 150, 76]),
  paint_white: (p) => p.fill([238, 238, 236], 4),
  flowers: (p) => {
    PAINTERS.grass_top(p);
    const colors = [[240, 70, 80], [250, 220, 60], [255, 255, 255], [180, 110, 230]];
    for (let i = 0; i < 9; i++) {
      const x = p.rng.int(1, 14);
      const y = p.rng.int(1, 14);
      p.set(x, y, p.rng.pick(colors));
    }
  },
  metal_roof: (p) => {
    p.fill([150, 156, 164], 4);
    for (let x = 0; x < S; x += 4) for (let y = 0; y < S; y++) p.shade(x, y, 0.75);
  },
};

export function createAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d');
  const cell = ctx.createImageData(ATLAS_CELL, ATLAS_CELL);
  const pad = (ATLAS_CELL - S) / 2;

  TILE_NAMES.forEach((name, index) => {
    const p = painter(1000 + index * 7919);
    PAINTERS[name](p);
    // copy the tile with wrap-around padding so mipmaps and filtering don't bleed
    for (let y = 0; y < ATLAS_CELL; y++) {
      for (let x = 0; x < ATLAS_CELL; x++) {
        const sx = (((x - pad) % S) + S) % S;
        const sy = (((y - pad) % S) + S) % S;
        const si = (sy * S + sx) * 4;
        const di = (y * ATLAS_CELL + x) * 4;
        cell.data[di] = p.px[si];
        cell.data[di + 1] = p.px[si + 1];
        cell.data[di + 2] = p.px[si + 2];
        cell.data[di + 3] = 255;
      }
    }
    const cx = (index % ATLAS_COLS) * ATLAS_CELL;
    const cy = Math.floor(index / ATLAS_COLS) * ATLAS_CELL;
    ctx.putImageData(cell, cx, cy);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  return tex;
}
