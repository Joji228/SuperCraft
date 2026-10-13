// Tether's powers.
//   Space (in the air): each press throws a web at a building ahead; hold to swing on
//     it, let go to fling yourself onward. One press, one web: you set the rhythm.
//   Q: web zip, yank yourself to the point under the crosshair.
//   Right mouse: web shot, a ball of web that splats on whatever it hits and wraps
//     enemies up for a few seconds (and knocks drones out of the sky).
//   Shift + W into a wall: run straight up it, vaulting over the top.
//   Left mouse: a flowing melee combo (jab, spinning kick, flip kick) with lunges.
// Every few swings he shows off: a different swing pose, or a spin/flip when he lets
// go fast, then falls chest-down with his arms spread wide.
// No flight, laser, breath or senses.
import * as THREE from 'three';
import { B } from '../../world/Blocks.js';

export const TETHER = {
  stats: { walk: 8, run: 15, sprint: 26, jump: 15 },
  palette: { suit: 0x1d2540, accent: 0x111628, belt: 0x25c9bb },
  gravity: 38, // a little heavier on the line: faster, snappier swings
  swingRange: 90,
  minAnchorHeight: 5, // anchor must be at least this far above the hero
  webSpeed: 240, // how fast the thrown web flies to the building (m/s)
  steer: 12, // m/s² of air steering while swinging
  pump: 16, // m/s² of extra speed along the swing
  maxSpeed: 66,
  releaseBoost: 8, // upward kick when letting go
  releaseForward: 6,
  zipSpeed: 52,
  zipRange: 80,
  zipCooldown: 0.5,
  shotRange: 70,
  shotSpeed: 75,
  shotCooldown: 0.35,
  climbSpeed: 13,
};

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const TRICKS = ['flip', 'spin', 'cork'];

export class TetherKit {
  constructor(game) {
    this.game = game;
    this.id = 'tether';
    this.disallow = new Set(['fly', 'laser', 'breath', 'senses']);
    this.anchor = new THREE.Vector3();
    this.anchorN = new THREE.Vector3();
    this.swinging = false;
    this.ropeLen = 0;
    this.webT = 0; // time since the web was thrown
    this.webTravel = 0.1; // how long it takes to reach the building
    this.side = 1; // which side the last anchor was on (alternates for rhythm)
    this.zip = null;
    this.zipCd = 0;
    this.climbing = false;
    this.shotT = 9;
    this.shotCd = 0;
    // style: swing poses and release tricks every few swings
    this.swingCount = 0;
    this.nextPoseAt = 3;
    this.nextTrickAt = 5;
    this.swingVariant = 0;
    this.trick = null;
    this.releasedT = 9;
    this.lines = new WebLines(game.scene);
    this.splats = new WebSplats(game.scene);
    this.balls = [];
    this.punchPower = 1.3;
    this.punchKnock = 1.25;
    this.lunge = 9; // melee: dashes in to enemies a few metres away
    this.punchKnockSeq = [0.35, 0.5, 1.6]; // light hits keep them close, the last one sends them flying
    this.dash = null;
  }

  /** Melee dash: close the gap to an enemy, then call strike(). */
  dashTo(target, strike) {
    this.dash = { target, strike, t: 0 };
  }

  updateDash(dt) {
    const p = this.game.player;
    const d = this.dash;
    d.t += dt;
    const to = tmp.set(d.target.pos.x - p.pos.x, 0, d.target.pos.z - p.pos.z);
    const dist = to.length();
    if (dist < 1.7 || d.t > 0.3 || d.target.removed) {
      this.dash = null;
      p.vel.x *= 0.2;
      p.vel.z *= 0.2;
      d.strike();
      return true;
    }
    to.divideScalar(dist);
    p.vel.x = to.x * 20;
    p.vel.z = to.z * 20;
    p.vel.y = Math.max(p.vel.y - 32 * dt, -20);
    p.move(dt);
    p.yaw = Math.atan2(to.x, to.z);
    p.aimTimer = 0;
    return true;
  }

  reset() {
    this.swinging = false;
    this.zip = null;
    this.climbing = false;
    this.trick = null;
    this.dash = null;
    this.lines.hide();
    this.splats.clear();
    for (const b of this.balls) {
      b.mesh.visible = false;
      if (b.tail) b.tail.visible = false;
    }
    this.balls.length = 0;
    this.game.player.modeLabel = null;
  }

  /**
   * Movement the kit takes over this frame (swinging, zipping, climbing). Returns true
   * if it moved the hero itself, so the normal walking/jumping is skipped.
   */
  drives(dt, input, canAct) {
    const g = this.game;
    const p = g.player;
    this.zipCd = Math.max(0, this.zipCd - dt);
    this.releasedT += dt;
    if (this.trick) {
      this.trick.t += dt;
      if (this.trick.t >= this.trick.dur || p.onGround) this.trick = null;
    }

    if (this.dash) return this.updateDash(dt);

    // ---- web zip (Q) ----
    if (canAct && input.pressed('breath') && this.zipCd <= 0 && !g.abilities.carry.held) this.startZip();
    if (this.zip) return this.updateZip(dt);

    // ---- swinging: one press of Space in the air throws one web ----
    if (!this.swinging && !p.onGround && canAct && input.pressed('jump') && !g.abilities.carry.held) {
      if (this.attach()) return this.updateSwing(dt, input);
    }
    if (this.swinging) {
      if (!(canAct && input.isDown('jump'))) {
        this.release(true);
        return false;
      }
      return this.updateSwing(dt, input);
    }

    // ---- wall run / climb ----
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
      for (const off of [0.4, 0.22, 0.65, 0.08, 0.95]) {
        for (const pitch of [0.9, 0.7, 1.1, 0.55, 1.3, 0.38]) {
          const a = base + off * side;
          const dir = tmp2.set(-Math.sin(a) * Math.cos(pitch), Math.sin(pitch), -Math.cos(a) * Math.cos(pitch));
          const hit = w.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, TETHER.swingRange);
          if (!hit || hit.t < 7) continue;
          const hy = o.y + dir.y * hit.t;
          if (hy - p.pos.y < TETHER.minAnchorHeight) continue;
          // like a long line, high up and well ahead, not too far to the side
          const score = Math.abs(hit.t - 34) + off * 14 + Math.abs(pitch - 0.9) * 10 - Math.min(24, hy - p.pos.y) * 0.4 + (side === this.side ? 6 : 0);
          if (score < bestScore) {
            bestScore = score;
            best = { x: o.x + dir.x * hit.t + hit.nx * 0.15, y: hy + hit.ny * 0.15, z: o.z + dir.z * hit.t + hit.nz * 0.15, nx: hit.nx, ny: hit.ny, nz: hit.nz, side, t: hit.t };
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
      g.hud.toast('Nothing to swing from here', 'info', 1);
      return false;
    }
    this.anchor.set(a.x, a.y, a.z);
    this.anchorN.set(a.nx, a.ny, a.nz);
    this.side = a.side;
    this.swinging = true;
    this.webT = 0;
    this.webTravel = Math.max(0.05, a.t / TETHER.webSpeed);
    this.webLanded = false;
    // a shorter line than the distance pulls you into the swing, never so long that
    // the bottom of the arc scrapes the street (or rooftop) below
    const d = this.anchor.distanceTo(tmp.set(p.pos.x, p.pos.y + 1.4, p.pos.z));
    const ground = this.groundBelow(this.anchor.x, this.anchor.z, p.pos.y);
    this.ropeLen = Math.max(7, Math.min(d * 0.85, this.anchor.y - (ground + 4.5)));
    this.swingT = 0;
    this.trick = null;
    // every few swings, a different pose on the line
    this.swingCount++;
    if (this.swingCount >= this.nextPoseAt) {
      this.swingVariant = 1 + Math.floor(Math.random() * 3);
      this.nextPoseAt = this.swingCount + 4 + Math.floor(Math.random() * 2);
    } else this.swingVariant = 0;
    g.audio.play('throw');
    return true;
  }

  release(boost) {
    const g = this.game;
    const p = g.player;
    this.swinging = false;
    p.modeLabel = null;
    this.releasedT = 0;
    if (!boost) return;
    // a flick upward and onward when letting go keeps the flow
    const hs = Math.hypot(p.vel.x, p.vel.z);
    if (hs > 4) {
      p.vel.x += (p.vel.x / hs) * TETHER.releaseForward;
      p.vel.z += (p.vel.z / hs) * TETHER.releaseForward;
    }
    p.vel.y = Math.min(p.vel.y + TETHER.releaseBoost, Math.max(p.vel.y, 18));
    g.audio.play('whoosh');
    // every four or five swings, letting go fast and rising: show off with a trick
    if (this.swingCount >= this.nextTrickAt && p.vel.length() > 20 && p.vel.y > 4) {
      this.trick = { type: TRICKS[Math.floor(Math.random() * TRICKS.length)], t: 0, dur: 0.7, side: this.side };
      this.nextTrickAt = this.swingCount + 4 + Math.floor(Math.random() * 2);
    }
  }

  updateSwing(dt, input) {
    const g = this.game;
    const p = g.player;
    const v = p.vel;
    this.swingT += dt;
    this.webT += dt;
    const onLine = this.webT >= this.webTravel;
    if (onLine && !this.webLanded) {
      this.webLanded = true;
      this.splats.add(this.anchor, this.anchorN);
    }
    v.y -= TETHER.gravity * dt;
    if (onLine) {
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
      if (sp > 1 && p.pos.y + 1.4 < this.anchor.y) v.multiplyScalar(1 + (TETHER.pump * dt) / sp);
      if (v.length() > TETHER.maxSpeed) v.multiplyScalar(TETHER.maxSpeed / v.length());
      // reel in a little so arcs stay lively
      this.ropeLen = Math.max(8, this.ropeLen - 3 * dt);
    }

    p.move(dt);

    if (onLine) {
      // the rope: never further than ropeLen from the anchor; remove outward speed
      const hand = tmp.set(p.pos.x, p.pos.y + 1.4, p.pos.z);
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
    }

    // let go automatically if he swings up level with the anchor, lands, or hits a wall hard
    if (p.onGround || p.pos.y + 1.4 > this.anchor.y - 1 || (p.hitWall && this.swingT > 0.3 && v.length() < 6)) {
      this.release(!p.onGround);
      return true;
    }
    this.face(dt);
    p.modeLabel = 'SWINGING';
    p.boostAmount += (Math.min(1.1, v.length() / 42) - p.boostAmount) * (1 - Math.exp(-4 * dt));
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
    this.splats.add(aim.point, tmp2.set(h.nx, h.ny, h.nz));
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
      // reached the wall: hold W to carry on up it as a wall run
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
    this.trick = null;
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

  /** Free falling after a swing: chest down, arms spread wide. */
  get skydive() {
    const p = this.game.player;
    return !this.swinging && !this.zip && !this.climbing && !p.onGround && !this.trick && this.releasedT < 5 && p.vel.y < -4;
  }

  /** Normal per-frame work (after movement): web shots and the balls in flight. */
  update(dt, input, canAct) {
    const g = this.game;
    this.shotT += dt;
    this.shotCd = Math.max(0, this.shotCd - dt);
    if (canAct && input.pressed('laser') && this.shotCd <= 0 && !g.abilities.carry.held) this.webShot();
    this.updateBalls(dt);
    this.splats.update(dt);
    // webbed enemies stay wrapped in silk while they struggle
    for (const e of g.entities.list) {
      if (!e.webbed || e.removed) continue;
      e.webbed = Math.max(0, e.webbed - dt);
      if (Math.random() < dt * 14) {
        const c = e.centerInto(tmp);
        g.particles.emit({ x: c.x + (Math.random() - 0.5) * 0.6, y: c.y + (Math.random() - 0.5) * 1.3, z: c.z + (Math.random() - 0.5) * 0.6, vx: 0, vy: 0.2, vz: 0, life: 0.7, size: 0.22, grow: 1, alpha: 0.85, r: 0.95, g: 0.97, b: 1, drag: 2 });
      }
    }
  }

  /** Right mouse: throw a ball of web at the crosshair. */
  webShot() {
    const g = this.game;
    const p = g.player;
    this.shotCd = TETHER.shotCooldown;
    this.shotT = 0;
    p.aimTimer = 0.4;
    const aim = g.abilities.computeAim();
    const to = aim.point.clone();
    g.hero.root.updateMatrixWorld(true);
    const from = g.hero.handR.getWorldPosition(new THREE.Vector3());
    const dist = from.distanceTo(to);
    const hitEnt = aim.entity && aim.dist <= TETHER.shotRange ? aim.entity : null;
    const block = !hitEnt && aim.block && aim.dist <= TETHER.shotRange ? aim.block : null;
    this.balls.push({ mesh: this.lines.ball(), from, to, t: 0, dur: Math.max(0.06, Math.min(dist, TETHER.shotRange) / TETHER.shotSpeed), entity: hitEnt, block, miss: !hitEnt && !block });
    g.audio.play('throw');
  }

  updateBalls(dt) {
    const g = this.game;
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      // follow a moving target
      const to = b.entity && !b.entity.removed ? b.entity.centerInto(new THREE.Vector3()) : b.to;
      const pos = new THREE.Vector3().copy(b.from).lerp(to, k);
      b.mesh.position.copy(pos);
      b.mesh.rotation.set(b.t * 20, b.t * 15, 0);
      b.mesh.scale.setScalar(0.6 + k * 0.6);
      // a short silk tail behind it
      b.tail = b.tail || this.lines.tail();
      this.lines.stretch(b.tail, tmp2.copy(b.from).lerp(to, Math.max(0, k - 0.35)), pos);
      if (k < 1) continue;
      b.mesh.visible = false;
      b.tail.visible = false;
      this.balls.splice(i, 1);
      if (b.miss) continue;
      g.effects.debris(pos, 0xf2f6ff, 16, 4);
      if (b.entity) this.webHit(b.entity);
      else if (b.block) this.splats.add(pos, tmp2.set(b.block.nx, b.block.ny, b.block.nz));
    }
  }

  webHit(e) {
    const g = this.game;
    const p = g.player;
    if (e.removed) return;
    if (e.kind === 'drone') {
      e.damage(60, { type: 'impact', source: p }); // webbed drones drop out of the sky
    } else if (e.team === 'enemy') {
      e.stun = Math.max(e.stun || 0, e.boss ? 0.8 : 4);
      e.webbed = 4;
      e.damage(8, { type: 'impact', source: p });
      g.hud.toast('Webbed!', 'info', 0.8);
    } else if (e.kind === 'car') {
      e.driving = false;
      e.vel.multiplyScalar(0.2);
    }
    g.audio.play('punchHit', e.pos);
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
    if (this.swinging) {
      const hand = (this.side < 0 ? hero.handL : hero.handR).getWorldPosition(tmp);
      // while the web is still flying, the line grows from the hand to the building
      const k = Math.min(1, this.webT / this.webTravel);
      this.lines.rope(hand, tmp2.copy(hand).lerp(this.anchor, k), k < 1);
    } else if (this.zip) this.lines.rope(hero.handR.getWorldPosition(tmp), this.zip.target, false);
    else this.lines.hideRope();
  }

  hud(hud) {
    hud.ab.senses.classList.toggle('active', this.swinging);
    hud.ab.breath.classList.toggle('active', !!this.zip);
    hud.ab.breath.classList.toggle('disabled', this.zipCd > 0);
    hud.ab.laser.classList.toggle('active', this.shotT < 0.2);
  }
}

/** Thin white web lines: the swing/zip rope, web-ball tails and the balls themselves. */
class WebLines {
  constructor(scene) {
    this.scene = scene;
    this.mat = new THREE.MeshBasicMaterial({ color: 0xf2f6ff, transparent: true, opacity: 0.9, depthWrite: false });
    this.lineGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
    this.ropeMesh = this.make(0.06);
    this.tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), this.mat);
    this.tip.visible = false;
    scene.add(this.tip);
    this.pool = [];
    this.tails = [];
    this.ballGeo = new THREE.IcosahedronGeometry(0.28, 0);
    this.ballMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
  }

  make(w) {
    const m = new THREE.Mesh(this.lineGeo, this.mat);
    m.userData.w = w;
    m.visible = false;
    this.scene.add(m);
    return m;
  }

  stretch(m, from, to) {
    const len = Math.max(0.01, from.distanceTo(to));
    m.position.copy(from);
    m.lookAt(to);
    m.scale.set(m.userData.w, m.userData.w, len);
    m.visible = true;
  }

  /** extending: the web is still flying, so show a blob of silk at its tip. */
  rope(from, to, extending) {
    this.stretch(this.ropeMesh, from, to);
    this.tip.visible = extending;
    if (extending) {
      this.tip.position.copy(to);
      this.tip.rotation.y += 0.4;
    }
  }

  hideRope() {
    this.ropeMesh.visible = false;
    this.tip.visible = false;
  }

  tail() {
    let m = this.tails.find((x) => !x.visible);
    if (!m) {
      m = this.make(0.04);
      this.tails.push(m);
    }
    return m;
  }

  ball() {
    let m = this.pool.find((x) => !x.visible);
    if (!m) {
      m = new THREE.Mesh(this.ballGeo, this.ballMat);
      this.scene.add(m);
      this.pool.push(m);
    }
    m.visible = true;
    return m;
  }

  hide() {
    this.hideRope();
    for (const m of this.pool) m.visible = false;
    for (const m of this.tails) m.visible = false;
  }
}

/** Little star-shaped web splats left where webs hit walls; they fade after a while. */
class WebSplats {
  constructor(scene) {
    const geo = new THREE.BufferGeometry();
    // eight thin spokes plus a ring: a flat star of silk
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const b = ((i + 1) / 8) * Math.PI * 2;
      pts.push(0, 0, 0, Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0);
      pts.push(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0, Math.cos(b) * 0.5, Math.sin(b) * 0.5, 0);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.items = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xf6f8ff, transparent: true, opacity: 0.9 }));
      m.visible = false;
      scene.add(m);
      this.items.push({ m, t: 0 });
    }
    this.next = 0;
  }

  add(pos, normal) {
    const it = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    it.t = 0;
    const n = normal.lengthSq() > 0 ? normal.clone().normalize() : new THREE.Vector3(0, 1, 0);
    it.m.position.copy(pos).addScaledVector(n, 0.08);
    it.m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    it.m.rotateZ(Math.random() * Math.PI);
    it.m.scale.setScalar(0.8 + Math.random() * 0.5);
    it.m.material.opacity = 0.9;
    it.m.visible = true;
  }

  update(dt) {
    for (const it of this.items) {
      if (!it.m.visible) continue;
      it.t += dt;
      if (it.t > 8) it.m.material.opacity = Math.max(0, 0.9 - (it.t - 8) * 0.45);
      if (it.t > 10) it.m.visible = false;
    }
  }

  clear() {
    for (const it of this.items) it.m.visible = false;
  }
}
