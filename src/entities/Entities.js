// Entity list with queries, ray tests and the super-senses x-ray silhouettes.
import * as THREE from 'three';

const SENSE_MAX = 400;

export class Entities {
  constructor(game) {
    this.game = game;
    this.list = [];

    // x-ray boxes drawn through walls while super senses are on
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthTest: false, depthWrite: false, fog: false });
    this.xray = new THREE.InstancedMesh(geo, mat, SENSE_MAX);
    this.xray.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SENSE_MAX * 3), 3);
    this.xray.frustumCulled = false;
    this.xray.renderOrder = 10;
    this.xray.count = 0;
    game.scene.add(this.xray);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  add(e) {
    this.list.push(e);
    return e;
  }

  clear() {
    for (const e of this.list) e.removed = true;
    this.list.length = 0;
  }

  update(dt, focus) {
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.removed) continue;
      // sleep far-away entities that aren't important
      const dx = e.pos.x - focus.x, dz = e.pos.z - focus.z;
      if (!e.persistent && dx * dx + dz * dz > 260 * 260) continue;
      e.update(dt);
    }
    // compact
    let j = 0;
    for (let i = 0; i < list.length; i++) if (!list[i].removed) list[j++] = list[i];
    list.length = j;
  }

  /** Entities whose centre is within radius of pos and pass the filter. */
  query(pos, radius, filter) {
    const out = [];
    const r2 = radius * radius;
    for (const e of this.list) {
      if (e.removed) continue;
      const dx = e.pos.x - pos.x, dy = e.pos.y + e.height * 0.5 - pos.y, dz = e.pos.z - pos.z;
      if (dx * dx + dy * dy + dz * dz <= r2 && (!filter || filter(e))) out.push(e);
    }
    return out;
  }

  nearest(pos, radius, filter) {
    let best = null;
    let bd = radius * radius;
    for (const e of this.list) {
      if (e.removed || (filter && !filter(e))) continue;
      const dx = e.pos.x - pos.x, dy = e.pos.y + e.height * 0.5 - pos.y, dz = e.pos.z - pos.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  count(filter) {
    let n = 0;
    for (const e of this.list) if (!e.removed && filter(e)) n++;
    return n;
  }

  /** Ray vs entity boxes. Returns { entity, t } for the closest hit within maxDist. */
  raycast(o, d, maxDist, filter, pad = 0.15) {
    let best = null;
    let bt = maxDist;
    for (const e of this.list) {
      if (e.removed || (filter && !filter(e))) continue;
      const hw = e.halfW + pad;
      const t = rayBox(o, d, e.pos.x - hw, e.pos.y - pad, e.pos.z - hw, e.pos.x + hw, e.pos.y + e.height + pad, e.pos.z + hw);
      if (t !== null && t < bt) {
        bt = t;
        best = e;
      }
    }
    return best ? { entity: best, t: bt } : null;
  }

  /** Update the x-ray silhouettes. */
  updateSenses(active) {
    if (!active) {
      this.xray.count = 0;
      return;
    }
    let n = 0;
    const m = this._m, s = this._s, p = this._p, c = this._c;
    for (const e of this.list) {
      if (e.removed || !e.sensesColor || n >= SENSE_MAX) continue;
      const col = typeof e.sensesColor === 'function' ? e.sensesColor() : e.sensesColor;
      if (!col) continue;
      const grow = e.senseLabel ? 0.8 : 0.3;
      s.set(e.halfW * 2 + grow, e.height + grow, e.halfW * 2 + grow);
      p.set(e.pos.x, e.pos.y + e.height / 2, e.pos.z);
      m.compose(p, this._q, s);
      this.xray.setMatrixAt(n, m);
      this.xray.setColorAt(n, c.set(col));
      n++;
    }
    this.xray.count = n;
    this.xray.material.opacity = 0.55 + Math.sin(performance.now() / 160) * 0.2;
    this.xray.instanceMatrix.needsUpdate = true;
    if (this.xray.instanceColor) this.xray.instanceColor.needsUpdate = true;
  }
}

/** Slab test; returns entry distance or null. */
export function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = 0, tmax = Infinity;
  for (let a = 0; a < 3; a++) {
    const oa = a === 0 ? o.x : a === 1 ? o.y : o.z;
    const da = a === 0 ? d.x : a === 1 ? d.y : d.z;
    const lo = a === 0 ? x0 : a === 1 ? y0 : z0;
    const hi = a === 0 ? x1 : a === 1 ? y1 : z1;
    if (Math.abs(da) < 1e-9) {
      if (oa < lo || oa > hi) return null;
    } else {
      let t1 = (lo - oa) / da, t2 = (hi - oa) / da;
      if (t1 > t2) [t1, t2] = [t2, t1];
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}
