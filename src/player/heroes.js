// The hero roster shown in the Heroes menu. Sky Guardian (Aegis) is playable; the
// others are on the way and appear as "coming soon" cards with a pixel portrait.
// All names and looks are original: inspired by familiar superhero archetypes,
// with no names, logos or costumes from existing comics.

export const HEROES = [
  {
    id: 'sky',
    name: 'Sky Guardian',
    alias: 'Aegis',
    tagline: 'The protector of Brightport',
    powers: ['Flight and a sonic boom', 'Laser eyes', 'Freezing super breath', 'X-ray super senses', 'Super strength'],
    playable: true,
  },
  {
    id: 'granite',
    name: 'Granite',
    alias: 'The walking landslide',
    tagline: 'Huge, stone-skinned and very, very strong',
    powers: ['Hold Space to charge a giant leap', 'RMB: Granite Smash', 'Q: thunder clap shockwave', 'Wall-smashing punches'],
    playable: true,
    note: 'Free Roam',
  },
  {
    id: 'tether',
    name: 'Tether',
    alias: 'The web runner',
    tagline: 'Swings across the skyline on silk lines',
    powers: ['Space in the air: throw a web and swing', 'Q: web zip', 'RMB: web ball that wraps enemies up', 'Flowing kick combos', 'Shift + W: run up walls'],
    playable: true,
    note: 'Free Roam',
  },
  {
    id: 'forge',
    name: 'Forge',
    alias: 'The armoured engineer',
    tagline: 'A flying suit of armour with thrusters on hands and feet',
    powers: ['F: thruster flight, Shift afterburner', 'RMB: palm repulsors', 'Q: chest Unibeam', 'E: homing micro-missiles'],
    playable: true,
    note: 'Free Roam',
  },
  {
    id: 'flux',
    name: 'Deka',
    alias: 'Hero of the Fluxitrix',
    tagline: 'A teenager whose wristband turns him into alien heroes',
    powers: ['Hold Q: the alien wheel', 'Cinder, Brawl, Blitz, Shard', 'Fluxitrix bar: time as an alien', 'As Deka: punch, run, swim'],
    playable: true,
    note: 'Free Roam',
  },
];

export const heroById = (id) => HEROES.find((h) => h.id === id) || HEROES[0];

// ---------- pixel portraits (20 x 32 cells, drawn once into a data URL) ----------

const W = 20;
const H = 32;

function painter() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const r = (x, y, w, h, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
  };
  return { c, ctx, r };
}

const PAINT = {
  // the hero we have: red cape, blue suit, gold shield emblem
  sky({ r }) {
    r(4, 8, 12, 20, '#b81d26'); // cape behind
    r(7, 1, 6, 6, '#e2a77e');
    r(7, 1, 6, 2, '#2b1c12'); // hair
    r(8, 4, 1, 1, '#1d3f8f');
    r(11, 4, 1, 1, '#1d3f8f');
    r(6, 7, 8, 10, '#2457c9');
    r(8, 8, 4, 4, '#f2c230');
    r(9, 9, 2, 2, '#c8202a');
    r(6, 16, 8, 1, '#f2c230');
    r(4, 7, 2, 10, '#2457c9');
    r(14, 7, 2, 10, '#2457c9');
    r(4, 15, 2, 2, '#c8202a');
    r(14, 15, 2, 2, '#c8202a');
    r(6, 17, 3, 11, '#2457c9');
    r(11, 17, 3, 11, '#2457c9');
    r(6, 25, 3, 3, '#c8202a');
    r(11, 25, 3, 3, '#c8202a');
  },
  // massive stone-skinned brute: tiny head, huge shoulders and fists, ragged trousers
  granite({ r }) {
    const skin = '#6f8a5c', dark = '#4f6641', crack = '#a5b98f';
    r(7, 2, 6, 5, skin);
    r(7, 2, 6, 1, '#2a2a24'); // flat-top hair
    r(7, 4, 6, 1, dark); // heavy brow
    r(8, 5, 1, 1, '#ffb43a');
    r(11, 5, 1, 1, '#ffb43a');
    r(2, 7, 16, 11, skin); // chest and shoulders
    r(5, 9, 4, 3, dark);
    r(11, 9, 4, 3, dark);
    r(9, 13, 2, 4, dark);
    r(4, 8, 1, 3, crack);
    r(15, 12, 1, 3, crack);
    r(0, 8, 3, 13, skin); // arms
    r(17, 8, 3, 13, skin);
    r(0, 19, 4, 4, dark); // fists
    r(16, 19, 4, 4, dark);
    r(4, 18, 12, 8, '#3d3a36'); // torn trousers
    r(4, 26, 3, 1, '#3d3a36');
    r(9, 26, 2, 1, '#3d3a36');
    r(13, 26, 3, 1, '#3d3a36');
    r(9, 20, 2, 6, '#2c2a27');
    r(4, 27, 5, 4, skin); // bare feet
    r(11, 27, 5, 4, skin);
    r(4, 30, 5, 1, dark);
    r(11, 30, 5, 1, dark);
  },
  // slim web-runner: midnight suit, teal web lines, big white angular eyes
  tether({ r }) {
    const suit = '#1d2540', web = '#25c9bb';
    r(7, 1, 6, 6, suit);
    r(7, 3, 2, 2, '#f4f7ff');
    r(11, 3, 2, 2, '#f4f7ff');
    r(8, 5, 1, 1, '#f4f7ff');
    r(11, 5, 1, 1, '#f4f7ff');
    r(10, 1, 1, 6, web);
    r(6, 7, 8, 10, suit);
    r(9, 9, 2, 3, web); // diamond emblem
    r(8, 10, 4, 1, web);
    for (const y of [8, 13, 16]) r(6, y, 8, 1, '#2b3a63');
    r(4, 7, 2, 11, suit);
    r(14, 7, 2, 11, suit);
    r(4, 15, 2, 1, web); // web shooters
    r(14, 15, 2, 1, web);
    r(6, 17, 3, 12, suit);
    r(11, 17, 3, 12, suit);
    r(6, 21, 3, 1, web);
    r(11, 21, 3, 1, web);
    r(6, 28, 3, 2, web);
    r(11, 28, 3, 2, web);
    r(16, 0, 1, 15, '#d8f6f2'); // a web line up out of frame
    r(15, 14, 2, 2, '#d8f6f2');
  },
  // armoured flyer: gunmetal plates, copper trim, cyan visor and chest light, thruster flames
  forge({ r }) {
    const metal = '#4a4f58', trim = '#d98a2b', glow = '#7ff3ff';
    r(7, 1, 6, 6, metal);
    r(7, 1, 6, 1, trim);
    r(8, 3, 4, 1, glow); // visor slit
    r(6, 7, 8, 10, metal);
    r(6, 7, 8, 1, trim);
    r(9, 9, 2, 2, glow); // chest light
    r(8, 12, 4, 1, trim);
    r(6, 16, 8, 1, trim);
    r(4, 7, 2, 10, metal);
    r(14, 7, 2, 10, metal);
    r(4, 7, 2, 2, trim);
    r(14, 7, 2, 2, trim);
    r(6, 17, 3, 9, metal);
    r(11, 17, 3, 9, metal);
    r(6, 21, 3, 1, trim);
    r(11, 21, 3, 1, trim);
    // thruster flames under the hands and feet
    for (const [x, y] of [[4, 17], [14, 17], [6, 26], [11, 26], [12, 26]]) {
      r(x, y, 2, 1, '#fff2a8');
      r(x, y + 1, 2, 2, '#ffb02e');
      r(x, y + 3, 2, 2, '#ff5a1a');
    }
    r(7, 26, 1, 5, '#ffb02e');
  },
  // teenager with the Fluxitrix: hoodie, cargo trousers, glowing wristband
  flux({ r }) {
    r(7, 2, 6, 5, '#e2a77e');
    r(6, 1, 8, 2, '#5a3a22'); // messy hair
    r(6, 3, 1, 2, '#5a3a22');
    r(13, 2, 1, 2, '#5a3a22');
    r(8, 4, 1, 1, '#2d7a3a');
    r(11, 4, 1, 1, '#2d7a3a');
    r(5, 7, 10, 10, '#2f8f3a'); // green jacket
    r(8, 7, 4, 10, '#f4f4f4'); // white tee
    r(9, 7, 2, 10, '#1d1d1d'); // black stripe
    r(3, 7, 2, 10, '#2f8f3a');
    r(15, 7, 2, 10, '#2f8f3a');
    r(5, 16, 3, 1, '#257330');
    r(12, 16, 3, 1, '#257330');
    r(3, 17, 2, 2, '#e2a77e');
    r(15, 15, 2, 2, '#8fe36a'); // the Fluxitrix
    r(15, 14, 2, 1, '#d8ffc8');
    r(15, 17, 2, 2, '#e2a77e');
    r(6, 17, 3, 11, '#8a7a55'); // cargo trousers
    r(11, 17, 3, 11, '#8a7a55');
    r(6, 21, 3, 2, '#766845');
    r(11, 21, 3, 2, '#766845');
    r(5, 28, 4, 2, '#f4f4f4'); // trainers
    r(11, 28, 4, 2, '#f4f4f4');
    r(5, 29, 4, 1, '#2a2a2a');
    r(11, 29, 4, 1, '#2a2a2a');
  },
};

const cache = new Map();

/** A data URL with the hero's pixel portrait (scale it up with image-rendering: pixelated). */
export function heroPortrait(id) {
  if (cache.has(id)) return cache.get(id);
  const p = painter();
  (PAINT[id] || PAINT.sky)(p);
  const url = p.c.toDataURL();
  cache.set(id, url);
  return url;
}
