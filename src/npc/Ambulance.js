// A parked ambulance for Free Roam rescues: white box body, red stripe and crosses,
// flashing light bar. Bring the injured to its open rear doors; once they're aboard
// it closes up and drives off with its lights going.
import { Entity } from '../entities/Entity.js';

const WHITE = 0xf2f2ee;
const RED = 0xd62828;
const DARK = 0x23303f;

export class Ambulance extends Entity {
  constructor(game) {
    super(game, { halfW: 1.2, height: 2.6, health: 9999, team: 'neutral', kind: 'ambulance' });
    this.pushable = false;
    this.punchable = false;
    this.friction = 6;
    this.state = 'waiting'; // waiting | loading | leaving
    this.timer = 0;
    this.speed = 0;
    this.flash = 0;
    const b = (o) => (this.boxes.push(o), o);
    this.boxes = [];
    // cab (front, +z) and the tall patient box behind it
    b({ y: 0.95, z: 1.75, w: 2.2, h: 1.3, d: 1.7, color: WHITE });
    b({ y: 1.45, z: 2.1, w: 2.0, h: 0.62, d: 1.0, color: DARK }); // windscreen + side windows
    b({ y: 0.55, z: 2.62, w: 2.22, h: 0.5, d: 0.06, color: 0x9aa0a6 }); // grille / bumper
    b({ y: 1.4, z: -0.7, w: 2.36, h: 2.2, d: 3.4, color: WHITE });
    // red stripe all the way round and a red cross on each side and the roof
    b({ y: 1.0, z: -0.7, w: 2.38, h: 0.24, d: 3.42, color: RED });
    b({ y: 0.85, z: 1.75, w: 2.22, h: 0.18, d: 1.72, color: RED });
    for (const sx of [1, -1]) {
      b({ x: 1.19 * sx, y: 1.75, z: -0.7, w: 0.04, h: 0.85, d: 0.28, color: RED });
      b({ x: 1.19 * sx, y: 1.75, z: -0.7, w: 0.04, h: 0.28, d: 0.85, color: RED });
    }
    b({ y: 2.51, z: -0.7, w: 0.3, h: 0.03, d: 1.1, color: RED });
    b({ y: 2.51, z: -0.7, w: 1.1, h: 0.03, d: 0.3, color: RED });
    // wheels
    for (const [x, z] of [[1.05, 1.7], [-1.05, 1.7], [1.05, -1.6], [-1.05, -1.6]]) b({ x, y: 0.36, z, w: 0.32, h: 0.72, d: 0.72, color: 0x1c1c1c });
    // lights
    b({ x: 0.72, y: 0.8, z: 2.61, w: 0.4, h: 0.2, d: 0.04, color: 0xfff6c8, glow: true });
    b({ x: -0.72, y: 0.8, z: 2.61, w: 0.4, h: 0.2, d: 0.04, color: 0xfff6c8, glow: true });
    this.barL = b({ x: 0.5, y: 1.7, z: 2.2, w: 0.7, h: 0.18, d: 0.32, color: RED, glow: true });
    this.barR = b({ x: -0.5, y: 1.7, z: 2.2, w: 0.7, h: 0.18, d: 0.32, color: 0x2a6bff, glow: true });
    this.backL = b({ x: 0.9, y: 2.42, z: -2.4, w: 0.3, h: 0.16, d: 0.06, color: RED, glow: true });
    this.backR = b({ x: -0.9, y: 2.42, z: -2.4, w: 0.3, h: 0.16, d: 0.06, color: 0x2a6bff, glow: true });
    // rear doors: swung open while waiting for the patient, the lit interior behind them
    this.inside = b({ y: 1.4, z: -2.38, w: 2.0, h: 1.9, d: 0.04, color: 0x9fb2bf });
    this.stretcher = b({ y: 0.95, z: -2.2, w: 0.8, h: 0.12, d: 0.4, color: 0xf4f4f4 });
    this.doorL = b({ x: 1.6, y: 1.35, z: -2.0, w: 0.06, h: 2.0, d: 1.1, color: WHITE });
    this.doorR = b({ x: -1.6, y: 1.35, z: -2.0, w: 0.06, h: 2.0, d: 1.1, color: WHITE });
  }

  get canFreeze() {
    return false;
  }

  damage() {
    return 0; // nobody wrecks the ambulance
  }

  /** Where to bring people: just behind the open rear doors (world space). */
  dropPoint(out) {
    return out.set(this.pos.x - Math.sin(this.yaw) * 3.6, this.pos.y, this.pos.z - Math.cos(this.yaw) * 3.6);
  }

  /** The patient is aboard: shut the doors and head off to hospital. */
  load(patient) {
    if (this.state !== 'waiting') return;
    this.state = 'loading';
    this.timer = 1.6;
    if (patient && !patient.removed) {
      this.game.effects.confetti(patient.pos, 20);
      patient.persistent = false;
      patient.remove(); // climbs aboard
    }
    this.game.audio.play('objective', this.pos);
  }

  update(dt) {
    this.age += dt;
    this.flash += dt;
    const on = Math.floor(this.flash * 6) % 2 === 0;
    this.barL.hidden = this.backL.hidden = !on;
    this.barR.hidden = this.backR.hidden = on;
    const open = this.state === 'waiting';
    this.doorL.x = open ? 1.6 : 0.6;
    this.doorR.x = open ? -1.6 : -0.6;
    this.doorL.z = this.doorR.z = open ? -2.0 : -2.42;
    this.doorL.w = this.doorR.w = open ? 0.06 : 1.16;
    this.doorL.d = this.doorR.d = open ? 1.1 : 0.06;
    this.inside.hidden = this.stretcher.hidden = !open;
    // the emergency ended without a patient: close up and go
    if (this.state === 'waiting' && !this.persistent && (this.timer -= dt) < -4) {
      this.state = 'leaving';
      this.timer = 0;
    }
    if (this.state === 'loading') {
      this.timer -= dt;
      if (this.timer <= 0) this.state = 'leaving';
    } else if (this.state === 'leaving') {
      this.speed = Math.min(16, this.speed + dt * 5);
      this.pos.x += Math.sin(this.yaw) * this.speed * dt;
      this.pos.z += Math.cos(this.yaw) * this.speed * dt;
      this.timer -= dt;
      const far = this.pos.distanceTo(this.game.player.pos) > 90;
      // gone once out of sight, into a wall, or after a good drive
      const bx = Math.floor(this.pos.x + Math.sin(this.yaw) * 3), bz = Math.floor(this.pos.z + Math.cos(this.yaw) * 3);
      const wall = this.game.world.get(bx, Math.floor(this.pos.y) + 1, bz) !== 0;
      if (far || this.timer < -9 || wall) {
        if (!far) this.game.effects.dust(this.pos, 8, 1);
        this.remove();
      }
      return;
    }
    this.vel.set(0, 0, 0); // parked: nothing shoves it about
  }
}
