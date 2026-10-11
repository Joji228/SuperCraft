// Safety / drop-off zones (ambulance, riverbank...): translucent green cylinders.
// Dropping a civilian (or a tagged object) inside one counts as a rescue.
import * as THREE from 'three';

export class Zones {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.geo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true);
    game.events.on('dropped', (e) => this.checkDrop(e));
  }

  /** opts: { radius, label, color, accepts(e) -> bool, onRescue(e) } */
  add(pos, opts = {}) {
    const r = opts.radius || 5;
    const color = opts.color || 0x3dff8a;
    const group = new THREE.Group();
    const wall = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
    wall.scale.set(r, 6, r);
    wall.position.y = 3;
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.35, r, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    ring.position.y = 0.06;
    group.add(wall, ring);
    group.position.copy(pos);
    this.game.scene.add(group);
    const z = { pos: pos.clone(), radius: r, label: opts.label || 'Safe zone', group, wall, accepts: opts.accepts, onRescue: opts.onRescue, id: 'zone' + Math.random() };
    this.list.push(z);
    return z;
  }

  remove(z) {
    this.game.scene.remove(z.group);
    this.list = this.list.filter((x) => x !== z);
    this.game.markers.removePin(z.id);
  }

  clear() {
    for (const z of [...this.list]) this.remove(z);
  }

  inside(z, pos) {
    return Math.hypot(pos.x - z.pos.x, pos.z - z.pos.z) < z.radius + 0.5 && Math.abs(pos.y - z.pos.y) < 8;
  }

  checkDrop(e) {
    for (const z of this.list) {
      if (!this.inside(z, e.pos)) continue;
      if (z.accepts ? !z.accepts(e) : e.kind !== 'civilian') continue;
      if (e.saved) return;
      e.saved = true;
      if (e.kind === 'civilian') {
        e.cheer(3);
        e.state = 'cheer';
      }
      this.game.effects.confetti(e.pos, 20);
      this.game.audio.play('objective');
      this.game.events.emit('rescued', e, z);
      if (e.kind === 'civilian') this.game.events.emit('civilianSaved', e);
      z.onRescue?.(e);
      return;
    }
  }

  update(dt) {
    const t = performance.now() / 1000;
    for (const z of this.list) {
      z.wall.material.opacity = 0.16 + Math.sin(t * 3) * 0.06;
      this.game.markers.setPin(z.id, z.pos.clone().setY(z.pos.y + 2), z.label, 'zone');
    }
  }
}
