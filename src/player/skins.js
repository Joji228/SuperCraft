// Costume palette for Aegis (Sky Guardian). Other costumes were retired when the
// Heroes menu replaced the costume picker. Loosely inspired by classic superhero colour schemes,
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
];

export function skinById(id) {
  return SKINS.find((s) => s.id === id) || SKINS[0];
}

export const hex = (c) => '#' + c.toString(16).padStart(6, '0');
