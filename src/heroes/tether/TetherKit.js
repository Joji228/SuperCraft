// Tether's powers.
//   Space (in the air, hold): shoot a web line to a building ahead and swing on it.
//     Keep holding and he lets go at the top of each swing and catches the next
//     building by himself (hold Space + W to chain swings); let go of Space any time
//     to fling yourself onward. Holding Space through a jump starts swinging at the
//     top of the jump, so you can swing straight from the street.
//   Q: web zip, yank yourself to the point under the crosshair.
//   Right mouse: web shot, pins an enemy in place (and knocks drones out of the sky).
//   Shift + W into a wall: run straight up it, vaulting over the top.
// No flight, laser, breath or senses.
import * as THREE from 'three';
import { B } from '../../world/Blocks.js';

export const TETHER = {
  stats: { walk: 8, run: 15, sprint: 26, jump: 15 },
  palette: { suit: 0x1d2540, accent: 0x111628, belt: 0x25c9bb },
  gravity: 32,
  swingRange: 90,
  minAnchorHeight: 5, // anchor must be at least this far above the hero
  steer: 11, // m/s² of air steering while swinging
  pump: 12, // m/s² of extra speed along the swing (keeps the rhythm going)
  maxSpeed: 58,
  releaseBoost: 7, // upward kick when letting go
  zipSpeed: 50,
  zipRange: 80,
  zipCooldown: 0.5,
  shotRange: 70,
  shotCooldown: 0.35,
  climbSpeed: 13,
};

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class TetherKit {
  constructor(game) {
    this.game = game;
    this.id = 'tether';
    this.disallow = new Set(['fly', 'laser', 'breath', 'senses']);
    this.anchor = new THREE.Vector3();
    this.swinging = false;
    this.ropeLen = 0;
    this.side = 1; // which side the last anchor was on (alternates for rhythm)
    this.airT = 0;
    this.holdAttachUsed = false;
    this.chainT = 0; // short gap between letting go at the top of a swing and the next web
    this.zip = null;
    this.zipCd = 0;
    this.climbing = false;
    this.shotT = 9;
    this.shotCd = 0;
    this.lines = new WebLines(game.scene);
    this.punchPower = 1.3;
    this.punchKnock = 1.2;
  }

  reset() {
    this.swinging = false;
    this.zip = null;
    this.climbing = false;
    this.lines.hide();
    const p = this.game.player;
    p.modeLabel = null;
  }

  /**
   * Movement the kit takes over this frame (swinging, zipping, climbing). Returns true
   * if it moved the hero itself, so the normal walking/jumping is skipped.
   */
  drives(dt, input, canAct) {
    const g = this.game;
    const p = g.player;
    this.zipCd = Math.max(0, this.zipCd - dt);
    this.chainT = Math.max(0, this.chainT - dt);
    if (p.onGround) {
      this.airT = 0;
      this.holdAttachUsed = false;
      this.chaining = false;
    } else this.airT += dt;

    // ---- web zip (Q) ----
    if (canAct && input.pressed('breath') && this.zipCd <= 0 && !g.abilities.carry.held) this.startZip();
    if (this.zip) return this.updateZip(dt);

    // ---- swinging ----
    const holding = canAct && input.isDown('jump');
    if (!this.swinging && !p.onGround && canAct && !g.abilities.carry.held) {
      const fresh = input.pressed('jump');
      // keep holding Space after a jump: the swing starts near the top of it; while
      // chaining, the next web goes out a moment after letting go of the last one
      const held = holding && ((this.chaining && this.chainT <= 0) || (!this.holdAttachUsed && this.airT > 0.22 && p.vel.y < 4));
      if (fresh || held) {
        if (held) this.holdAttachUsed = true;
        if (this.attach()) return this.updateSwing(dt, input, true);
        // nothing to grab yet: keep looking a few times a second while Space is held
        this.chaining = true;
        this.chainT = 0.15;
      }
    }
    if (this.swinging) {
      if (!holding) {
        this.chaining = false;
        this.release(true);
        return false;
      }
      return this.updateSwing(dt, input, false);
    }
    if (!holding) this.chaining = false;
    // holding Space on the ground (after a swing or from a run): hop straight back up
    if (holding && p.onGround && canAct && !g.abilities.carry.held) {
      this.groundHold = (this.groundHold || 0) + dt;
      if (this.groundHold > 0.08 && !input.pressed('jump')) {
        p.vel.y = TETHER.stats.jump;
        p.onGround = false;
        this.groundHold = 0;
        this.holdAttachUsed = false;
      }
    } else this.groundHold = 0;

    // ---- wall run / climb: Shift + W into a wall (or W while airborne against one) ----
    return this.updateClimb(dt, input, canAct);
  }

  /** Find a building to shoot a web at: ahead, above, off to one side. */
  findAnchor() {
    const g = this.game;
    const p = g.player;
    const w = g.world;
    const yaw = g.rig.yaw;
    const o = tmp.set(p.pos.x, p.pos.y + 1.5, p.pos.z);
    // travel direction: mostly where you're looking, nudged by where you're moving
    const hs = Math.hypot(p.vel.x, p.vel.z);
    let base = yaw;
    if (hs > 6) {
      const velYaw = Math.atan2(-p.vel.x, -p.vel.z);
      let d = velYaw - yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      base = yaw + d * 0.35;
    }
    let best = null;
    let bestScore = Infinity;
    const sides = [-this.side, this.side]; // try the other side first: left, right, left...
    for (const side of sides) {
      for (const off of [0.45, 0.25, 0.7, 0.1, 0.95]) {
        for (const pitch of [0.95, 0.75, 1.15, 0.55, 1.3, 0.38]) {
          const a = base + off * side;
          const dir = tmp2.set(-Math.sin(a) * Math.cos(pitch), Math.sin(pitch), -Math.cos(a) * Math.cos(pitch));
          const hit = w.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, TETHER.swingRange);
          if (!hit || hit.t < 7) continue;
          const hy = o.y + dir.y * hit.t;
          if (hy - p.pos.y < TETHER.minAnchorHeight) continue;
          // like a long-ish line, high up, not too far to the side
          const score = Math.abs(hit.t - 30) + off * 14 + Math.abs(pitch - 0.95) * 10 - Math.min(20, hy - p.pos.y) * 0.4 + (side === this.side ? 6 : 0);
          if (score < bestScore) {
            bestScore = score;
            best = { x: o.x + dir.x * hit.t + hit.nx * 0.15, y: hy + hit.ny * 0.15, z: o.z + dir.z * hit.t + hit.nz * 0.15, side };
          }
        }
      }
      if (best) break;
    }
    return best;
  }

  /** Height of the highest surface under (x, z) that is below y (street or roof). */
  groundBelow(x, z, y) {
    const w = this.game.world;
    for (let yy = Math.floor(y); yy > 0; yy--) {
      const b = w.get(Math.floor(x), yy, Math.floor(z));
      if (b !== B.AIR) return yy + 1;
    }
    return 0;
  }

  attach() {
    const g = this.game;
    const p = g.player;
    const a = this.findAnchor();
    if (!a) {
      if (!this.warnedNoAnchor) {
        this.warnedNoAnchor = true;
        if (!this.chaining) g.hud.toast('Nothing to swing from here', 'info', 1);
      }
      return false;
    }
    this.warnedNoAnchor = false;
    this.anchor.set(a.x, a.y, a.z);
    this.side = a.side;
    this.swinging = true;
    // a slightly shorter line than the distance pulls you into the swing, and never so
    // long that the bottom of the arc scrapes the street (or rooftop) below
    const d = this.anchor.distanceTo(tmp.set(p.pos.x, p.pos.y + 1.4, p.pos.z));
    const ground = this.groundBelow(this.anchor.x, this.anchor.z, p.pos.y);
    this.ropeLen = Math.max(7, Math.min(d * 0.9, this.anchor.y - (ground + 4.5)));
    this.swingT = 0;
    g.audio.play('throw');
    return true;
  }

  release(boost) {
    const g = this.game;
    const p = g.player;
    this.swinging = false;
    p.modeLabel = null;
    if (!boost) return;
    // a little flick upward and onward when letting go keeps the flow
    const hs = Math.hypot(p.vel.x, p.vel.z);
    if (hs > 4) {
      p.vel.x += (p.vel.x / hs) * 4;
      p.vel.z += (p.vel.z / hs) * 4;
    }
    p.vel.y = Math.min(p.vel.y + TETHER.releaseBoost, Math.max(p.vel.y, 16));
    g.audio.play('whoosh');
  }

  updateSwing(dt, input) {
    const g = this.game;
    const p = g.player;
    const v = p.vel;
    this.swingT += dt;
    v.y -= TETHER.gravity * dt;
    // steering: forward/back along the camera, sideways a little
    const yaw = g.rig.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const iz = (input.isDown('forward') ? 1 : 0) - (input.isDown('back') ? 1 : 0);
    const ix = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    v.x += (fx * iz + rx * ix * 0.6) * TETHER.steer * dt;
    v.z += (fz * iz + rz * ix * 0.6) * TETHER.steer * dt;
    // pump: add speed along the direction of travel while below the anchor
    const sp = v.length();
    const hand = tmp.set(p.pos.x, p.pos.y + 1.4, p.pos.z);
    if (sp > 1 && hand.y < this.anchor.y) v.multiplyScalar(1 + (TETHER.pump * dt) / sp);
    if (sp > TETHER.maxSpeed) v.multiplyScalar(TETHER.maxSpeed / sp);
    // reel in a little so arcs stay lively
    this.ropeLen = Math.max(8, this.ropeLen - 2.5 * dt);

    p.move(dt);

    // the rope: never further than ropeLen from the anchor; remove outward speed
    hand.set(p.pos.x, p.pos.y + 1.4, p.pos.z);
    const d = hand.sub(this.anchor);
    const len = d.length();
    if (len > this.ropeLen) {
      d.divideScalar(len);
      const before = p.pos.clone();
      p.pos.set(this.anchor.x + d.x * this.ropeLen, this.anchor.y + d.y * this.ropeLen - 1.4, this.anchor.z + d.z * this.ropeLen);
      if (p.overlaps()) p.pos.copy(before);
      const radial = v.dot(d);
      if (radial > 0) v.addScaledVector(d, -radial);
    }

    // let go automatically: swung up past the anchor, landed, or slammed into something
    // (still holding Space, the next web goes out straight away)
    if (p.onGround || p.pos.y + 1.4 > this.anchor.y - 1 || (p.hitWall && this.swingT > 0.3 && v.length() < 6)) {
      this.release(!p.onGround);
      this.chaining = true;
      this.chainT = 0.12;
      return true;
    }
    // past the bottom and rising out in front of the anchor, about to slow down: let go
    // here with a fling and catch the next building (that's the chain)
    const ahead = (p.pos.x - this.anchor.x) * v.x + (p.pos.z - this.anchor.z) * v.z;
    if (this.swingT > 0.35 && ahead > 0 && v.y > 0 && v.y < 6) {
      this.release(true);
      this.chaining = true;
      this.chainT = 0.15;
      return true;
    }
    this.face(dt);
    p.modeLabel = 'SWINGING';
    p.boostAmount += (Math.min(1, v.length() / 45) - p.boostAmount) * (1 - Math.exp(-4 * dt));
    return true;
  }

  startZip() {
    const g = this.game;
    const aim = g.abilities.computeAim();
    if (!aim.block || aim.dist > TETHER.zipRange) {
      g.hud.toast('Nothing in range to zip to', 'info', 1);
      return;
    }
    if (this.swinging) this.release(false);
    this.zipCd = TETHER.zipCooldown;
    const h = aim.block;
    // aim for just in front of the surface (on top if it's a roof)
    const target = aim.point.clone().addScaledVector(aim.dir, -0.6);
    if (h.ny > 0) target.y = h.y + 1.05;
    this.zip = { target, t: 0 };
    g.audio.play('throw');
  }

  updateZip(dt) {
    const g = this.game;
    const p = g.player;
    const z = this.zip;
    z.t += dt;
    const to = tmp.copy(z.target).sub(p.pos);
    to.y -= 0.5;
    const d = to.length();
    if (d < 1.6 || z.t > 2.2) {
      this.endZip(true);
      return false;
    }
    p.vel.copy(to.divideScalar(d)).multiplyScalar(Math.min(TETHER.zipSpeed, 12 + z.t * 90));
    p.move(dt);
    if (p.hitWall && z.t > 0.1) {
      // reached the wall: cling, then pop up over the edge if there is one
      this.endZip(true);
      return true;
    }
    this.face(dt);
    p.modeLabel = 'WEB ZIP';
    p.boostAmount += (0.7 - p.boostAmount) * (1 - Math.exp(-5 * dt));
    return true;
  }

  endZip(hop) {
    const p = this.game.player;
    this.zip = null;
    p.modeLabel = null;
    if (hop) {
      // a little upward hop so you land on the ledge instead of sliding off it
      p.vel.multiplyScalar(0.3);
      p.vel.y = Math.max(p.vel.y, 9);
    }
  }

  /** Run up walls: Shift + W against a wall, or W while airborne and touching one. */
  updateClimb(dt, input, canAct) {
    const g = this.game;
    const p = g.player;
    const w = g.world;
    const yaw = g.rig.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const want = canAct && input.isDown('forward') && (input.isDown('boost') || !p.onGround || this.climbing) && !g.abilities.carry.held;
    const wallAt = (h) => {
      for (const s of [0.6, 0.95]) {
        const b = w.get(Math.floor(p.pos.x + fx * s), Math.floor(p.pos.y + h), Math.floor(p.pos.z + fz * s));
        if (b !== B.AIR && b !== B.WATER) return true;
      }
      return false;
    };
    if (!want || !wallAt(0.9)) {
      if (this.climbing && want) {
        // reached the top: vault over the edge
        p.vel.set(fx * 7, 9, fz * 7);
      }
      if (this.climbing) p.modeLabel = null;
      this.climbing = false;
      return false;
    }
    this.climbing = true;
    p.vel.set(fx * 2, TETHER.climbSpeed, fz * 2);
    p.move(dt);
    p.yaw = Math.atan2(fx, fz);
    p.modeLabel = 'WALL RUN';
    if (Math.random() < dt * 10) g.effects.dust(tmp.set(p.pos.x + fx * 0.5, p.pos.y + 0.3, p.pos.z + fz * 0.5), 1, 0.4);
    return true;
  }

  /** Model faces the direction of travel. */
  face(dt) {
    const p = this.game.player;
    const hs = Math.hypot(p.vel.x, p.vel.z);
    if (hs < 1) return;
    let d = Math.atan2(p.vel.x, p.vel.z) - p.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    p.yaw += d * (1 - Math.exp(-12 * dt));
  }

  /** Normal per-frame work (after movement): web shots, landings. */
  update(dt, input, canAct) {
    const g = this.game;
    this.shotT += dt;
    this.shotCd = Math.max(0, this.shotCd - dt);
    if (canAct && input.pressed('laser') && this.shotCd <= 0 && !g.abilities.carry.held) this.webShot();
    // webbed enemies trail wisps of silk while they struggle
    for (const e of g.entities.list) {
      if (!e.webbed || e.removed) continue;
      e.webbed = Math.max(0, e.webbed - dt);
      if (Math.random() < dt * 12) {
        const c = e.centerInto(tmp);
        g.particles.emit({ x: c.x + (Math.random() - 0.5) * 0.6, y: c.y + (Math.random() - 0.5) * 1.2, z: c.z + (Math.random() - 0.5) * 0.6, vx: 0, vy: 0.3, vz: 0, life: 0.6, size: 0.18, grow: 1, alpha: 0.8, r: 0.95, g: 0.97, b: 1, drag: 2 });
      }
    }
  }

  webShot() {
    const g = this.game;
    const p = g.player;
    this.shotCd = TETHER.shotCooldown;
    this.shotT = 0;
    p.aimTimer = 0.4;
    const aim = g.abilities.computeAim();
    this.shotTo = aim.point.clone();
    this.lines.flash(0.18);
    g.audio.play('throw');
    const e = aim.entity;
    if (!e || aim.dist > TETHER.shotRange) return;
    if (e.kind === 'drone') {
      // webbed drones drop out of the sky
      e.damage(60, { type: 'impact', source: p });
    } else if (e.team === 'enemy') {
      e.stun = Math.max(e.stun || 0, e.boss ? 0.8 : 4);
      e.webbed = 4;
      e.damage(8, { type: 'impact', source: p });
      g.effects.debris(e.centerInto(new THREE.Vector3()), 0xf2f6ff, 14, 3);
      g.hud.toast('Webbed!', 'info', 0.8);
    } else if (e.kind === 'car') {
      e.driving = false;
      e.vel.multiplyScalar(0.2);
    }
    g.hud.hitMarker(false, true);
  }

  /** A gentle landing from a swing: just a crouch and some dust, no damage. */
  onLand(speed) {
    const g = this.game;
    const p = g.player;
    if (speed < 22) return;
    p.landT = 0.3;
    g.audio.play('thud');
    g.effects.dust(tmp.set(p.pos.x, p.pos.y + 0.1, p.pos.z), 14, 1.2);
  }

  /** Draw the web lines once the model has moved (from the hand to the anchor/target). */
  place() {
    const g = this.game;
    const hero = g.hero;
    hero.root.updateMatrixWorld(true);
    const hand = (this.side < 0 ? hero.handL : hero.handR).getWorldPosition(tmp);
    if (this.swinging) this.lines.rope(hand, this.anchor);
    else if (this.zip) this.lines.rope(hero.handR.getWorldPosition(tmp), this.zip.target);
    else this.lines.hideRope();
    if (this.lines.flashT > 0 && this.shotTo) this.lines.shot(hero.handR.getWorldPosition(tmp2), this.shotTo);
  }

  hud(hud) {
    hud.ab.senses.classList.toggle('active', this.swinging);
    hud.ab.breath.classList.toggle('active', !!this.zip);
    hud.ab.breath.classList.toggle('disabled', this.zipCd > 0);
    hud.ab.laser.classList.toggle('active', this.shotT < 0.2);
  }
}

/** Thin white web lines: the swing/zip rope and a quick flash for web shots. */
class WebLines {
  constructor(scene) {
    const make = (w, opacity) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xf2f6ff, transparent: true, opacity, depthWrite: false }),
      );
      m.userData.w = w;
      m.visible = false;
      scene.add(m);
      return m;
    };
    this.ropeMesh = make(0.06, 0.9);
    this.shotMesh = make(0.08, 0.95);
    this.flashT = 0;
    this.lastTime = performance.now();
  }

  stretch(m, from, to) {
    const len = from.distanceTo(to);
    m.position.copy(from);
    m.lookAt(to);
    m.scale.set(m.userData.w, m.userData.w, len);
    m.visible = true;
  }

  rope(from, to) {
    this.stretch(this.ropeMesh, from, to);
  }

  hideRope() {
    this.ropeMesh.visible = false;
  }

  flash(t) {
    this.flashT = t;
    this.lastTime = performance.now();
  }

  shot(from, to) {
    const now = performance.now();
    this.flashT -= (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (this.flashT <= 0) {
      this.shotMesh.visible = false;
      return;
    }
    this.stretch(this.shotMesh, from, to);
  }

  hide() {
    this.ropeMesh.visible = false;
    this.shotMesh.visible = false;
    this.flashT = 0;
  }
}
