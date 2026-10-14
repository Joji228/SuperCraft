// Forge: a blocky suit of armour. Gunmetal plates with copper trim, a glowing cyan
// visor and chest reactor, shoulder missile pods, and thruster flames that burn from
// his palms and boot soles while he flies. Same interface as HeroModel (root, head,
// eyes, punch(), update()), plus handL/handR/chest anchors for his weapons.
import * as THREE from 'three';
import { damp } from '../../util/math.js';

const C = { metal: 0x4a4f58, dark: 0x30343b, trim: 0xd98a2b, glow: 0x7ff3ff };

const mat = (color) => new THREE.MeshLambertMaterial({ color });

function part(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** A thruster flame: an orange outer cone around a hot white-blue core, pointing down -Y. */
function flame() {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(
    new THREE.ConeGeometry(0.13, 1, 8, 1, true).translate(0, 0.5, 0),
    new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  const core = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 0.6, 8, 1, true).translate(0, 0.3, 0),
    new THREE.MeshBasicMaterial({ color: 0xd9f6ff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  // cones are built wide end at the nozzle, tip up; flip them to shoot out downwards
  outer.rotation.x = Math.PI;
  core.rotation.x = Math.PI;
  g.add(outer, core);
  g.visible = false;
  return g;
}

export class ForgeModel {
  constructor() {
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.pivot.position.y = 1.0;
    this.root.add(this.pivot);

    const metal = mat(C.metal);
    const dark = mat(C.dark);
    const trim = mat(C.trim);
    const glow = new THREE.MeshBasicMaterial({ color: C.glow });
    this.glowMat = glow;

    // torso with a glowing chest reactor and copper trim
    this.pivot.add(part(0.64, 0.76, 0.36, metal, 0, 0.13, 0));
    this.pivot.add(part(0.66, 0.08, 0.38, trim, 0, 0.48, 0));
    this.pivot.add(part(0.4, 0.3, 0.04, trim, 0, 0.2, 0.18)); // chest plate
    this.chest = new THREE.Group();
    this.chest.position.set(0, 0.24, 0.21);
    this.reactor = part(0.16, 0.16, 0.04, glow, 0, 0, 0);
    this.reactor.castShadow = false;
    this.chest.add(this.reactor);
    this.pivot.add(this.chest);
    this.pivot.add(part(0.66, 0.1, 0.38, dark, 0, -0.2, 0)); // waist

    // helmet: dark faceplate, cyan visor slit, copper crest
    this.head = new THREE.Group();
    this.head.position.set(0, 0.52, 0);
    this.head.add(part(0.48, 0.5, 0.48, metal, 0, 0.25, 0));
    this.head.add(part(0.36, 0.3, 0.04, trim, 0, 0.2, 0.24)); // faceplate
    this.head.add(part(0.5, 0.06, 0.5, trim, 0, 0.5, 0));
    this.eyes = new THREE.Group();
    for (const x of [-0.09, 0.09]) {
      const e = part(0.12, 0.05, 0.04, glow, x, 0.28, 0.26);
      e.castShadow = false;
      this.eyes.add(e);
    }
    this.head.add(this.eyes);
    this.pivot.add(this.head);

    // shoulder missile pods
    this.pods = [];
    for (const side of [1, -1]) {
      const pod = part(0.24, 0.12, 0.3, dark, side * 0.36, 0.56, -0.02);
      this.pivot.add(pod);
      this.pods.push(pod);
    }

    // arms (pivot at the shoulder), copper gauntlets, palm thrusters
    const arm = (side) => {
      const g = new THREE.Group();
      g.position.set(side * 0.46, 0.42, 0);
      g.add(part(0.28, 0.3, 0.3, trim, 0, -0.06, 0)); // shoulder plate
      g.add(part(0.25, 0.5, 0.27, metal, 0, -0.3, 0));
      g.add(part(0.29, 0.26, 0.3, trim, 0, -0.62, 0)); // gauntlet
      const hand = new THREE.Group();
      hand.position.set(0, -0.76, 0);
      const f = flame();
      hand.add(f);
      g.add(hand);
      this.pivot.add(g);
      return { g, hand, flame: f };
    };
    const L = arm(1), R = arm(-1);
    this.armL = L.g;
    this.armR = R.g;
    this.handL = L.hand;
    this.handR = R.hand;
    this.flames = [L.flame, R.flame];

    // legs and boots with sole thrusters
    const leg = (side) => {
      const g = new THREE.Group();
      g.position.set(side * 0.16, -0.25, 0);
      g.add(part(0.29, 0.46, 0.32, metal, 0, -0.22, 0));
      g.add(part(0.3, 0.06, 0.33, trim, 0, -0.46, 0));
      g.add(part(0.31, 0.3, 0.36, dark, 0, -0.62, 0.02)); // boot
      const foot = new THREE.Group();
      foot.position.set(0, -0.78, 0);
      const f = flame();
      foot.add(f);
      g.add(foot);
      this.pivot.add(g);
      this.flames.push(f);
      return g;
    };
    this.legL = leg(1);
    this.legR = leg(-1);

    this.punchT = 9;
    this.punchCombo = 1;
    this.walkPhase = 0;
    this.time = 0;
    this.tilt = 0;
    this.bank = 0;
    this.crouch = 0;
    this.prevYaw = 0;
    this.yaw = 0;
    this.thrust = 0;
  }

  applySkin() {}

  setVisible(v) {
    this.root.visible = v;
  }

  punch(combo) {
    this.punchT = 0;
    this.punchCombo = combo;
  }

  /**
   * s: { pos, yaw, mode, speed, hSpeed, vx, vz, vy, boost, supersonic, carrying, landT,
   *      shootArm ('L'|'R'|null), aimPitch, unibeam (0..1 charge / firing), podT }
   */
  update(dt, s) {
    this.time += dt;
    this.root.position.copy(s.pos);
    this.yaw = s.yaw;
    this.root.rotation.set(0, s.yaw, 0);

    let tilt = 0, crouch = 0;
    let armL = 0, armR = 0, spreadL = 0.08, spreadR = 0.08, legL = 0, legR = 0;
    let thrust = 0; // how hard the thrusters burn (0 = off)
    let handsBurn = true;

    if (s.mode === 'fly') {
      // forward speed lays him out flat like a jet; hovering keeps him upright
      const fwd = Math.max(0, (s.vx ?? 0) * Math.sin(this.yaw) + (s.vz ?? 0) * Math.cos(this.yaw));
      this.fwdSpeed = fwd;
      const move = Math.min(1, Math.hypot(fwd, s.vy) / 14);
      const ang = Math.atan2(fwd, s.vy); // 0 = straight up, PI/2 = level
      tilt = Math.min(ang, 1.72) * move;
      // classic pose: arms swept back along the sides, palms trailing, legs together
      armL = armR = 0.32 * move + 0.12 * (1 - move);
      spreadL = spreadR = (s.boost ? 0.06 : 0.16) * move + 0.38 * (1 - move);
      legL = 0.02 + Math.sin(this.time * 7) * 0.03;
      legR = -0.02 - Math.sin(this.time * 7) * 0.03;
      thrust = 0.55 + 0.45 * move + (s.boost ? 0.55 : 0) + (s.supersonic ? 0.35 : 0);
      if (move < 0.3) {
        // hovering: hands down and out balancing on their jets, a gentle bob
        armL = armR = 0.1;
        spreadL = spreadR = 0.42;
        legL = 0.05;
        legR = -0.03;
        thrust = 0.65 + Math.sin(this.time * 9) * 0.05;
      }
    } else if (s.mode === 'air') {
      armL = armR = -0.5;
      spreadL = spreadR = 0.5;
      legL = -0.4;
      legR = 0.25;
      thrust = s.vy < -8 ? 0.4 : 0; // braking the fall
    } else if (s.landT > 0) {
      crouch = 0.45;
      tilt = 0.4;
      armR = -0.5;
      armL = 0.4;
      spreadL = spreadR = 0.4;
      legL = -1.2;
      legR = 0.6;
    } else {
      const k = Math.min(1, s.hSpeed / 7);
      this.walkPhase += dt * (4 + s.hSpeed * 0.8);
      const sw = Math.sin(this.walkPhase) * (0.35 + 0.45 * Math.min(1, s.hSpeed / 12)) * k;
      armL = sw;
      armR = -sw;
      legL = -sw;
      legR = sw;
      tilt = Math.min(0.25, s.hSpeed * 0.015);
      if (k < 0.05) {
        const b = Math.sin(this.time * 2) * 0.03;
        armL = b;
        armR = -b;
        spreadL = spreadR = 0.1;
      }
    }

    if (s.carrying) {
      armL = armR = -2.9;
      spreadL = spreadR = 0.2;
      handsBurn = false;
    }

    // Unibeam: arms flung back and wide, chest thrust forward
    if (s.unibeam > 0) {
      armL = armR = 0.7 * s.unibeam;
      spreadL = spreadR = 0.4 + 0.6 * s.unibeam;
      tilt = Math.min(tilt, 0.5);
      handsBurn = false;
    }

    // repulsor: the firing arm points where you aim (works upright or laid out flat)
    let fastL = false, fastR = false;
    const aimX = -(Math.PI / 2 + this.tilt + (s.aimPitch || 0));
    if (s.shootArm === 'B') {
      // firing: both palms held steady out in front, aimed where you look
      armL = armR = aimX;
      spreadL = spreadR = 0.12;
      fastL = fastR = true;
    } else if (s.shootArm === 'L') {
      armL = aimX;
      spreadL = 0.05;
      fastL = true;
    } else if (s.shootArm === 'R') {
      armR = aimX;
      spreadR = 0.05;
      fastR = true;
    }

    // punches snap an arm forward
    this.punchT += dt;
    if (this.punchT < 0.24) {
      const k = Math.sin((this.punchT / 0.24) * Math.PI);
      const reach = this.punchCombo === 3 ? -2.5 : -1.6;
      if (this.punchCombo === 2) {
        armL = reach * k;
        fastL = true;
      } else {
        armR = reach * k;
        fastR = true;
      }
      if (s.mode !== 'fly') tilt = 0.2 * k;
    }

    // banking into turns when laid out flat
    let yawRate = (this.yaw - this.prevYaw) / Math.max(dt, 1e-4);
    yawRate = Math.atan2(Math.sin(yawRate * dt), Math.cos(yawRate * dt)) / Math.max(dt, 1e-4);
    this.prevYaw = this.yaw;
    const flat = s.mode === 'fly' ? Math.min(1, (this.fwdSpeed || 0) / 20) * Math.max(0, Math.sin(Math.min(this.tilt, Math.PI / 2))) : 0;
    this.bank = damp(this.bank, Math.max(-0.8, Math.min(0.8, -yawRate * 0.22)) * flat, 5, dt);

    this.tilt = damp(this.tilt, tilt, s.landT > 0 ? 25 : 6, dt);
    this.crouch = damp(this.crouch, crouch, s.landT > 0 ? 40 : 10, dt);
    const hover = s.mode === 'fly' ? 1 - Math.min(1, s.speed / 6) : 0;
    this.pivot.position.y = 1.0 - this.crouch + Math.sin(this.time * 2) * 0.08 * hover;
    this.pivot.rotation.set(this.tilt, this.bank, 0, 'XYZ');
    this.head.rotation.x = damp(this.head.rotation.x, -Math.min(this.tilt, 1.4) * 0.65, 10, dt);

    const R = 12;
    this.armL.rotation.x = damp(this.armL.rotation.x, armL, fastL ? 40 : R, dt);
    this.armR.rotation.x = damp(this.armR.rotation.x, armR, fastR ? 40 : R, dt);
    this.armL.rotation.z = damp(this.armL.rotation.z, spreadL, R, dt);
    this.armR.rotation.z = damp(this.armR.rotation.z, -spreadR, R, dt);
    this.legL.rotation.x = damp(this.legL.rotation.x, legL, R, dt);
    this.legR.rotation.x = damp(this.legR.rotation.x, legR, R, dt);

    // shoulder pods pop up while the missiles launch
    const pod = s.podT < 0.6 ? 1.8 : 1;
    for (const p of this.pods) p.scale.y = damp(p.scale.y, pod, 14, dt);

    // reactor glows harder while charging the Unibeam
    const glow = 1 + (s.unibeam || 0) * 1.5 + Math.sin(this.time * 6) * 0.05;
    this.reactor.scale.set(glow, glow, 1);

    // thruster flames
    this.thrust = damp(this.thrust, thrust, 10, dt);
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      const isHand = i < 2;
      const firing = s.shootArm === 'B' || (i === 0 && s.shootArm === 'L') || (i === 1 && s.shootArm === 'R');
      const on = this.thrust > 0.05 && (!isHand || (handsBurn && !firing));
      f.visible = on;
      if (!on) continue;
      const flick = 0.85 + Math.random() * 0.3;
      const len = this.thrust * (isHand ? 0.9 : 1.15) * flick;
      f.scale.set(0.8 + this.thrust * 0.4, len, 0.8 + this.thrust * 0.4);
    }
  }
}
