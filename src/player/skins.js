// Costume palettes for Aegis. Loosely inspired by classic superhero colour schemes,
// but with our own shield emblem and no names, logos or symbols from existing comics.
export const SKINS = [
  {
    id: 'sky',
    name: 'Sky Guardian',
    suit: 0x2457c9,
    accent: 0xc8202a, // gloves and boots
    belt: 0xf2c230,
    cape: 0xc8202a,
    mask: null, // no mask
    emblemBg: 0xf2c230,
    emblemMark: 0xc8202a,
  },
  {
    id: 'emerald',
    name: 'Emerald Warden',
    suit: 0x1f9d3a,
    accent: 0x16181c,
    belt: 0x16181c,
    cape: null, // no cape
    mask: 0x1f9d3a,
    emblemBg: 0x16181c,
    emblemMark: 0xe9fff0,
  },
  {
    id: 'crimson',
    name: 'Crimson Streak',
    suit: 0xc0201a,
    accent: 0xf2c230,
    belt: 0xf2c230,
    cape: null,
    mask: 0xc0201a,
    emblemBg: 0xffffff,
    emblemMark: 0xf2c230,
  },
  {
    id: 'midnight',
    name: 'Midnight Knight',
    suit: 0x3a3d45,
    accent: 0x15161a,
    belt: 0xd8b13a,
    cape: 0x15161a,
    mask: 0x15161a,
    emblemBg: 0xd8b13a,
    emblemMark: 0x15161a,
  },
  {
    id: 'aegis',
    name: 'Aegis Original',
    suit: 0x1c9c93,
    accent: 0xf3f3ee,
    belt: 0xf2b630,
    cape: 0x24306e,
    mask: 0x137068,
    emblemBg: 0xf2b630,
    emblemMark: 0xffffff,
  },
];

export function skinById(id) {
  return SKINS.find((s) => s.id === id) || SKINS[0];
}

export const hex = (c) => '#' + c.toString(16).padStart(6, '0');
