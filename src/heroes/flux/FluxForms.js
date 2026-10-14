// Deka's forms: Deka (human) and the aliens of the Fluxitrix. All original
// names and designs, inspired by the classic alien-watch archetypes:
//   Cinder  - a living ember: flame head, magma-rock body, throws fire, flies on flames
//   Brawl   - a four-armed red giant: crushing punches, huge jumps, shockwave slam
//   Blitz   - a sleek speedster on wheel feet: blinding speed, rapid strikes, cyclone
//   Shard   - a crystal warrior: shard volleys, crystal spikes from the ground, tough
//   Rollo   - an armour-plated roller: curls into a ball and bowls through everything
//   Titanor - a dinosaur brute who grows to giant size
//   Frostmoth - an icy moth: flies, freezing breath, phases through walls
//   Wraith  - a ghost: floats, turns invisible, phases, grabs and flings enemies
//   Feral   - an eyeless beast: smells enemies through walls, pounces, climbs walls
//   Reverb  - a little sound alien: sonic blasts, a shattering scream, and clones

export const FORMS = {
  human: {
    name: 'Deka',
    title: 'Back to Deka',
    color: '#8fe36a',
    body: { halfW: 0.34, height: 1.75 },
    stats: { walk: 6, run: 10, sprint: 10, jump: 11 },
    eye: 1.5,
    camScale: 0.95,
    disallow: ['fly', 'boost', 'laser', 'breath', 'senses'],
    punchPower: 0.5,
    punchKnock: 0.6,
    damageMul: 1.4,
    lmb: 'punch',
    rmb: null,
    abilities: ['Punch', 'Run', 'Swim'],
  },
  cinder: {
    name: 'Cinder',
    title: 'Living ember',
    color: '#ff7a2a',
    body: { halfW: 0.4, height: 2.0 },
    stats: { walk: 7, run: 13, sprint: 13, jump: 13 },
    eye: 1.8,
    camScale: 1.05,
    disallow: ['laser', 'breath', 'senses'],
    // cruising on flames, Shift for a blazing boost (never supersonic like Sky or Forge)
    flight: { fly: 24, boost: 58, supersonic: 58, boomDelay: 999, turn: 0.95, accel: 0.9 },
    punchPower: 1.1,
    punchKnock: 1,
    damageMul: 0.8,
    fireproof: true,
    lmb: 'fireball',
    rmb: 'flamethrower',
    abilities: ['LMB fireball', 'RMB flamethrower', 'F fly on flames, SHIFT to blaze'],
  },
  brawl: {
    name: 'Brawl',
    title: 'Four-armed giant',
    color: '#ff4d4d',
    body: { halfW: 0.52, height: 2.55 },
    stats: { walk: 6.5, run: 12, sprint: 22, jump: 26 },
    eye: 2.35,
    camScale: 1.25,
    disallow: ['fly', 'laser', 'breath', 'senses'],
    punchPower: 2.4,
    punchKnock: 1.8,
    damageMul: 0.5,
    lmb: 'punch',
    rmb: 'slam',
    abilities: ['LMB four-fist punches', 'RMB shockwave slam', 'SPACE huge jump'],
  },
  blitz: {
    name: 'Blitz',
    title: 'Speedster',
    color: '#4dc3ff',
    body: { halfW: 0.36, height: 1.8 },
    stats: { walk: 9, run: 18, sprint: 69.5, jump: 14 }, // 250 km/h flat out
    eye: 1.6,
    camScale: 1.1,
    disallow: ['fly', 'laser', 'breath', 'senses'],
    punchPower: 0.8,
    punchKnock: 0.8,
    damageMul: 0.9,
    rapid: true, // fast, lunging strikes
    lmb: 'punch',
    rmb: 'cyclone',
    abilities: ['SHIFT super speed (even across water)', 'LMB rapid strikes', 'RMB cyclone'],
  },
  shard: {
    name: 'Shard',
    title: 'Crystal warrior',
    color: '#5ff2b4',
    body: { halfW: 0.42, height: 2.1 },
    stats: { walk: 7, run: 12, sprint: 12, jump: 13 },
    eye: 1.9,
    camScale: 1.1,
    disallow: ['fly', 'boost', 'laser', 'breath', 'senses'],
    punchPower: 1.4,
    punchKnock: 1.2,
    damageMul: 0.45,
    lmb: 'shards',
    rmb: 'spikes',
    abilities: ['LMB crystal shards', 'RMB crystal spikes', 'Very tough'],
  },
  rollo: {
    name: 'Rollo',
    title: 'Armoured roller',
    color: '#f2c94c',
    body: { halfW: 0.55, height: 2.0 },
    stats: { walk: 6, run: 11, sprint: 11, jump: 12 },
    eye: 1.8,
    camScale: 1.15,
    disallow: ['fly', 'boost', 'laser', 'breath', 'senses'],
    punchPower: 1.6,
    punchKnock: 1.6,
    damageMul: 0.35,
    lmb: 'punch',
    rmb: 'bounce',
    abilities: ['Hold SHIFT to roll up and bowl through anything', 'RMB bounce slam', 'Armour plated'],
  },
  titanor: {
    name: 'Titanor',
    title: 'Dinosaur giant',
    color: '#c9a36b',
    body: { halfW: 0.6, height: 2.9 },
    stats: { walk: 6, run: 11, sprint: 11, jump: 16 },
    eye: 2.6,
    camScale: 1.3,
    disallow: ['fly', 'boost', 'laser', 'breath', 'senses'],
    punchPower: 2.6,
    punchKnock: 2,
    damageMul: 0.4,
    lmb: 'punch',
    rmb: 'grow',
    abilities: ['RMB grow giant (uses energy)', 'LMB earth-shaking punches', 'Stomps cars flat'],
  },
  frostmoth: {
    name: 'Frostmoth',
    title: 'Ice moth',
    color: '#9fe8ff',
    body: { halfW: 0.4, height: 2.1 },
    stats: { walk: 6.5, run: 12, sprint: 12, jump: 14 },
    eye: 1.9,
    camScale: 1.1,
    disallow: ['boost', 'laser', 'breath', 'senses'],
    flight: { fly: 26, boost: 26, supersonic: 26, boomDelay: 999, turn: 1, accel: 1 },
    punchPower: 1,
    punchKnock: 1,
    damageMul: 0.8,
    lmb: 'frost',
    rmb: 'nova',
    abilities: ['F fly on moth wings', 'Hold LMB freezing breath', 'RMB frost nova', 'Hold SHIFT to phase through walls'],
  },
  wraith: {
    name: 'Wraith',
    title: 'Ghost',
    color: '#b9a7ff',
    body: { halfW: 0.36, height: 1.95 },
    stats: { walk: 6, run: 11, sprint: 11, jump: 12 },
    eye: 1.75,
    camScale: 1.05,
    disallow: ['boost', 'laser', 'breath', 'senses'],
    flight: { fly: 16, boost: 16, supersonic: 16, boomDelay: 999, turn: 1.1, accel: 1.2 },
    punchPower: 1,
    punchKnock: 1,
    damageMul: 0.7,
    lmb: 'grab',
    rmb: 'fear',
    abilities: ['F float', 'LMB grab and fling', 'RMB terrify', 'E invisible', 'Hold SHIFT to phase through walls'],
  },
  feral: {
    name: 'Feral',
    title: 'Eyeless beast',
    color: '#ff9a4d',
    body: { halfW: 0.5, height: 1.3 },
    stats: { walk: 8, run: 16, sprint: 30, jump: 16 },
    eye: 1.2,
    camScale: 1,
    disallow: ['fly', 'laser', 'breath'],
    punchPower: 1.3,
    punchKnock: 1.1,
    damageMul: 0.8,
    lmb: 'punch',
    rmb: 'pounce',
    abilities: ['E smell enemies through walls', 'LMB pounce and bite', 'RMB great leap', 'W into a wall to climb it'],
  },
  reverb: {
    name: 'Reverb',
    title: 'Sound alien',
    color: '#e8f4ff',
    body: { halfW: 0.3, height: 1.25 },
    stats: { walk: 7, run: 12, sprint: 12, jump: 12 },
    eye: 1.1,
    camScale: 0.85,
    disallow: ['fly', 'boost', 'laser', 'breath', 'senses'],
    punchPower: 0.7,
    punchKnock: 0.8,
    damageMul: 1,
    lmb: 'sonic',
    rmb: 'scream',
    abilities: ['LMB sonic blasts', 'Hold RMB shattering scream', 'E split into clones'],
  },
};

export const ALIENS = ['cinder', 'brawl', 'blitz', 'shard', 'rollo', 'titanor', 'frostmoth', 'wraith', 'feral', 'reverb'];

// ---------- small pixel portraits for the alien wheel (16 x 20 cells) ----------

const PAINT = {
  human(r) {
    r(5, 1, 6, 5, '#e2a77e');
    r(4, 0, 8, 2, '#5a3a22');
    r(6, 3, 1, 1, '#2d7a3a');
    r(9, 3, 1, 1, '#2d7a3a');
    r(3, 6, 10, 7, '#2f8f3a'); // green jacket
    r(6, 6, 4, 7, '#f4f4f4'); // white tee
    r(7, 6, 2, 7, '#1d1d1d'); // black stripe
    r(12, 10, 2, 2, '#8fe36a'); // the Fluxitrix
    r(4, 13, 3, 6, '#8a7a55');
    r(9, 13, 3, 6, '#8a7a55');
  },
  cinder(r) {
    r(5, 0, 6, 2, '#ffe28a');
    r(4, 2, 8, 4, '#ff8a2a'); // flame head
    r(6, 3, 1, 1, '#ffffff');
    r(9, 3, 1, 1, '#ffffff');
    r(3, 6, 10, 7, '#3a2a24');
    r(5, 7, 1, 4, '#ff7a2a'); // glowing cracks
    r(9, 8, 2, 1, '#ff7a2a');
    r(7, 8, 2, 2, '#8fe36a'); // band emblem
    r(1, 6, 2, 7, '#3a2a24');
    r(13, 6, 2, 7, '#3a2a24');
    r(4, 13, 3, 6, '#3a2a24');
    r(9, 13, 3, 6, '#3a2a24');
  },
  brawl(r) {
    r(5, 0, 6, 4, '#b83a2e');
    r(6, 1, 1, 1, '#ffd34d');
    r(9, 1, 1, 1, '#ffd34d');
    r(6, 2, 1, 1, '#ffd34d');
    r(9, 2, 1, 1, '#ffd34d');
    r(2, 4, 12, 9, '#b83a2e');
    r(5, 5, 6, 3, '#1d1d1d');
    r(7, 6, 2, 2, '#8fe36a');
    r(0, 4, 2, 6, '#b83a2e'); // four arms
    r(14, 4, 2, 6, '#b83a2e');
    r(0, 9, 2, 5, '#9a2e24');
    r(14, 9, 2, 5, '#9a2e24');
    r(4, 13, 3, 6, '#1d1d1d');
    r(9, 13, 3, 6, '#1d1d1d');
  },
  blitz(r) {
    r(5, 1, 7, 4, '#1d2a4a');
    r(8, 2, 4, 2, '#4dc3ff'); // visor
    r(4, 5, 8, 7, '#1d2a4a');
    r(6, 6, 3, 4, '#4dc3ff');
    r(7, 7, 1, 2, '#8fe36a');
    r(1, 9, 4, 2, '#1d2a4a'); // tail
    r(5, 12, 2, 5, '#1d2a4a');
    r(9, 12, 2, 5, '#1d2a4a');
    r(4, 17, 4, 3, '#111111'); // wheel feet
    r(8, 17, 4, 3, '#111111');
  },
  shard(r) {
    r(7, 0, 2, 2, '#bfffe6');
    r(5, 1, 6, 5, '#5ff2b4');
    r(6, 3, 1, 1, '#0d4a35');
    r(9, 3, 1, 1, '#0d4a35');
    r(3, 6, 10, 7, '#3fd096');
    r(2, 5, 2, 2, '#bfffe6'); // shoulder spikes
    r(12, 5, 2, 2, '#bfffe6');
    r(7, 8, 2, 2, '#8fe36a');
    r(1, 7, 2, 6, '#5ff2b4');
    r(13, 7, 2, 6, '#5ff2b4');
    r(4, 13, 3, 6, '#3fd096');
    r(9, 13, 3, 6, '#3fd096');
  },
  rollo(r) {
    r(4, 1, 8, 5, '#6b6f78');
    r(5, 2, 6, 3, '#f2c94c'); // head plate
    r(6, 3, 1, 1, '#1d1d1d');
    r(9, 3, 1, 1, '#1d1d1d');
    r(2, 6, 12, 8, '#f2c94c'); // shell
    r(3, 7, 10, 1, '#c99a2e');
    r(3, 10, 10, 1, '#c99a2e');
    r(7, 8, 2, 2, '#8fe36a');
    r(0, 7, 2, 5, '#e8e8e8');
    r(14, 7, 2, 5, '#e8e8e8');
    r(4, 14, 3, 5, '#e8e8e8');
    r(9, 14, 3, 5, '#e8e8e8');
  },
  titanor(r) {
    r(4, 0, 8, 6, '#a07a4a');
    r(4, 0, 8, 1, '#5a3a22'); // brow ridge
    r(6, 3, 1, 1, '#ffd34d');
    r(9, 3, 1, 1, '#ffd34d');
    r(5, 5, 6, 1, '#f4f4f4'); // teeth
    r(2, 6, 12, 8, '#a07a4a');
    r(5, 7, 6, 5, '#d8c08a'); // belly
    r(7, 8, 2, 2, '#8fe36a');
    r(0, 6, 2, 7, '#a07a4a');
    r(14, 6, 2, 7, '#a07a4a');
    r(3, 14, 4, 6, '#7a5a34');
    r(9, 14, 4, 6, '#7a5a34');
  },
  frostmoth(r) {
    r(0, 3, 4, 12, '#9fe8ff'); // wings
    r(12, 3, 4, 12, '#9fe8ff');
    r(1, 5, 2, 8, '#d8f6ff');
    r(13, 5, 2, 8, '#d8f6ff');
    r(5, 0, 6, 5, '#3a5a9a');
    r(6, 2, 1, 1, '#7dffef');
    r(9, 2, 1, 1, '#7dffef');
    r(5, 5, 6, 9, '#2a4478');
    r(7, 7, 2, 2, '#8fe36a');
    r(5, 14, 2, 6, '#2a4478');
    r(9, 14, 2, 6, '#2a4478');
  },
  wraith(r) {
    r(4, 0, 8, 6, '#e6e0ff');
    r(5, 2, 2, 2, '#4a2a7a'); // hollow eyes
    r(9, 2, 2, 2, '#4a2a7a');
    r(3, 6, 10, 8, '#b9a7ff');
    r(6, 7, 4, 2, '#4a2a7a');
    r(7, 9, 2, 2, '#8fe36a');
    r(1, 6, 2, 6, '#b9a7ff');
    r(13, 6, 2, 6, '#b9a7ff');
    r(4, 14, 8, 2, '#9a88e0'); // wispy tail
    r(5, 16, 6, 2, '#7a68c0');
    r(6, 18, 4, 2, '#5a48a0');
  },
  feral(r) {
    r(1, 7, 6, 5, '#ff9a4d'); // head, no eyes
    r(1, 11, 6, 1, '#f4f4f4'); // fangs
    r(0, 8, 1, 2, '#ffd0a0');
    r(6, 7, 9, 6, '#ff9a4d'); // body, on all fours
    r(7, 6, 7, 1, '#d8662a');
    r(10, 9, 2, 2, '#8fe36a');
    r(6, 13, 2, 6, '#d8662a');
    r(9, 13, 2, 6, '#d8662a');
    r(12, 13, 2, 6, '#d8662a');
    r(14, 6, 2, 3, '#d8662a'); // tail
  },
  reverb(r) {
    r(5, 4, 6, 5, '#f4f8ff');
    r(5, 6, 6, 1, '#1d1d1d'); // speaker grille
    r(6, 5, 1, 1, '#4dc3ff');
    r(9, 5, 1, 1, '#4dc3ff');
    r(4, 9, 8, 6, '#1d2a3a');
    r(6, 10, 4, 4, '#f4f8ff');
    r(7, 11, 2, 2, '#8fe36a');
    r(2, 9, 2, 5, '#1d2a3a');
    r(12, 9, 2, 5, '#1d2a3a');
    r(5, 15, 2, 5, '#1d2a3a');
    r(9, 15, 2, 5, '#1d2a3a');
  },
};

const cache = new Map();

export function formPortrait(id) {
  if (cache.has(id)) return cache.get(id);
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 20;
  const ctx = c.getContext('2d');
  (PAINT[id] || PAINT.human)((x, y, w, h, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
  });
  const url = c.toDataURL();
  cache.set(id, url);
  return url;
}
