// Rotating radar minimap with compass letters. The city map is rendered once from
// the voxel tops; markers (events, objectives, enemies, zones) are drawn on top.
import { B } from '../world/Blocks.js';
import { SX, SZ, SY } from '../world/World.js';
import { CITY } from '../world/CityGenerator.js';

const COLORS = {
  [B.ASPHALT]: [70, 72, 80], [B.LINE_X_HI]: [70, 72, 80], [B.LINE_X_LO]: [70, 72, 80], [B.LINE_Z_HI]: [70, 72, 80], [B.LINE_Z_LO]: [70, 72, 80],
  [B.CROSS_X]: [90, 92, 100], [B.CROSS_Z]: [90, 92, 100],
  [B.SIDEWALK]: [170, 170, 165], [B.GRASS]: [96, 160, 70], [B.FLOWERS]: [110, 170, 80], [B.SAND]: [215, 200, 150],
  [B.WATER]: [52, 120, 200], [B.ICE]: [180, 225, 250], [B.LEAVES]: [60, 130, 50], [B.PLANKS]: [170, 130, 80],
  [B.STONE_BEIGE]: [205, 190, 160], [B.CONCRETE]: [160, 160, 156], [B.CONCRETE_DARK]: [110, 112, 120],
};

export class Minimap {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.map = document.createElement('canvas');
    this.map.width = SX;
    this.map.height = SZ;
    this.render();
    this.range = 90; // metres from centre to edge
  }

  /** Bake the top-down city colours (buildings shaded by height). */
  render() {
    const w = this.world;
    const ctx = this.map.getContext('2d');
    const img = ctx.createImageData(SX, SZ);
    const d = w.data;
    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        let y = SY - 1;
        let b = 0;
        for (; y >= 0; y--) {
          b = d[x + SX * (z + SZ * y)];
          if (b) break;
        }
        let c;
        if (y >= CITY.G) {
          // building or rooftop: lighter the taller it is
          const k = Math.min(1, (y - CITY.G) / 90);
          const base = b === B.LEAVES ? [60, 130, 50] : b === B.WATER ? [52, 120, 200] : [128, 120, 140];
          c = [base[0] + k * 90, base[1] + k * 90, base[2] + k * 80];
        } else c = COLORS[b] || [120, 120, 120];
        const i = (z * SX + x) * 4;
        img.data[i] = c[0];
        img.data[i + 1] = c[1];
        img.data[i + 2] = c[2];
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  /**
   * markers: [{ x, z, color, size, shape: 'dot'|'diamond'|'ring', edge: bool }]
   */
  draw(px, pz, yaw, markers) {
    const ctx = this.ctx;
    const W = this.canvas.width, R = W / 2;
    const scale = (R - 10) / this.range;
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 8, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#2a5a9a';
    ctx.fillRect(0, 0, W, W);
    ctx.translate(R, R);
    ctx.rotate(yaw); // camera forward points up
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = false;
    // only the part of the city map that can show (much cheaper than the whole 512x512)
    const S = Math.ceil(this.range * 1.5);
    const sx = Math.max(0, Math.floor(px - S)), sz = Math.max(0, Math.floor(pz - S));
    const sw = Math.min(SX, Math.floor(px + S)) - sx, sh = Math.min(SZ, Math.floor(pz + S)) - sz;
    if (sw > 0 && sh > 0) ctx.drawImage(this.map, sx, sz, sw, sh, sx - px, sz - pz, sw, sh);
    ctx.restore();

    // markers
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    for (const m of markers) {
      let dx = (m.x - px) * scale, dz = (m.z - pz) * scale;
      let x = dx * cos - dz * sin;
      let y = dx * sin + dz * cos;
      const dist = Math.hypot(x, y);
      const maxR = R - 14;
      const clamped = dist > maxR;
      if (clamped) {
        if (!m.edge) continue;
        x = (x / dist) * maxR;
        y = (y / dist) * maxR;
      }
      ctx.fillStyle = m.color;
      ctx.strokeStyle = '#10203a';
      ctx.lineWidth = 2;
      const s = m.size || 4;
      ctx.beginPath();
      if (m.shape === 'diamond') {
        ctx.moveTo(R + x, R + y - s - 2);
        ctx.lineTo(R + x + s + 2, R + y);
        ctx.lineTo(R + x, R + y + s + 2);
        ctx.lineTo(R + x - s - 2, R + y);
        ctx.closePath();
      } else if (m.shape === 'ring') {
        ctx.arc(R + x, R + y, s + 3, 0, Math.PI * 2);
        ctx.globalAlpha = 0.5;
        ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      } else ctx.arc(R + x, R + y, s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // the hero: arrow pointing up
    ctx.fillStyle = '#f2b630';
    ctx.strokeStyle = '#10203a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(R, R - 8);
    ctx.lineTo(R + 6, R + 6);
    ctx.lineTo(R, R + 3);
    ctx.lineTo(R - 6, R + 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ring + compass letters
    ctx.strokeStyle = '#f2b630';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(R, R, R - 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const letters = [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]];
    for (const [l, lx, lz] of letters) {
      const x = lx * cos - lz * sin;
      const y = lx * sin + lz * cos;
      const cx = R + x * (R - 8), cy = R + y * (R - 8);
      ctx.fillStyle = '#10203a';
      ctx.fillRect(cx - 8, cy - 8, 16, 16);
      ctx.fillStyle = l === 'N' ? '#ff6a5a' : '#ffffff';
      ctx.fillText(l, cx + 1, cy + 1);
    }
  }
}
