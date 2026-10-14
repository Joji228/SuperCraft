// Flux's forms: Deka (human) and the five aliens of the Fluxitrix. All original
// names and designs, inspired by the classic alien-watch archetypes:
//   Cinder  - a living ember: flame head, magma-rock body, throws fire, flies on flames
//   Brawl   - a four-armed red giant: crushing punches, huge jumps, shockwave slam
//   Blitz   - a sleek speedster on wheel feet: blinding speed, rapid strikes, cyclone
//   Shard   - a crystal warrior: shard volleys, crystal spikes from the ground, tough
//   Glitch  - living circuitry: zaps, an EMP pulse, and takes over cars (R)

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
  glitch: {
    name: 'Glitch',
    title: 'Living circuitry',
    color: '#7dff8a',
    body: { halfW: 0.36, height: 1.75 },
    stats: { walk: 7.5, run: 14, sprint: 14, jump: 14 },
    eye: 1.6,
    camScale: 1.05,
    disallow: ['fly', 'boost', 'laser', 'breath', 'senses'],
    punchPower: 0.9,
    punchKnock: 1,
    damageMul: 0.85,
    lmb: 'zap',
    rmb: 'emp',
    abilities: ['LMB zap', 'RMB EMP pulse', 'R take over a car'],
  },
};

export const ALIENS = ['cinder', 'brawl', 'blitz', 'shard', 'glitch'];

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
  glitch(r) {
    r(5, 1, 6, 5, '#111418');
    r(7, 2, 3, 3, '#7dff8a'); // single round eye
    r(4, 6, 8, 7, '#111418');
    r(5, 7, 1, 5, '#7dff8a'); // circuit lines
    r(10, 7, 1, 5, '#7dff8a');
    r(6, 9, 4, 1, '#7dff8a');
    r(2, 6, 2, 6, '#111418');
    r(12, 6, 2, 6, '#111418');
    r(5, 13, 2, 6, '#111418');
    r(9, 13, 2, 6, '#111418');
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
