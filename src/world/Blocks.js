// Block and texture-tile registry.

export const TILE_NAMES = [
  'stone', 'dirt', 'grass_top', 'grass_side', 'sand', 'asphalt',
  'line_x_hi', 'line_x_lo', 'line_z_hi', 'line_z_lo', 'cross_x', 'cross_z',
  'sidewalk', 'concrete', 'concrete_dark', 'brick', 'brick_tan', 'stone_beige',
  'glass_blue', 'glass_teal', 'glass_gold', 'glass_lit', 'glass_dark',
  'metal', 'roof', 'water', 'leaves', 'log_side', 'log_top', 'planks',
  'panel_white', 'panel_red', 'panel_orange', 'panel_yellow', 'panel_teal', 'panel_purple',
  'interior', 'lamp', 'door', 'red_light', 'hazard',
  'container_blue', 'container_red', 'container_green', 'paint_white', 'flowers', 'metal_roof',
];

export const T = {};
TILE_NAMES.forEach((n, i) => (T[n] = i));

export const ATLAS_COLS = 8;
export const ATLAS_CELL = 32; // 16px tile + 8px wrapped padding on each side
export const ATLAS_SIZE = 256;

// [name, top, side, bottom, solid, opaque]
const DEFS = [
  ['AIR', null, null, null, false, false],
  ['STONE', 'stone', 'stone', 'stone', true, true],
  ['DIRT', 'dirt', 'dirt', 'dirt', true, true],
  ['GRASS', 'grass_top', 'grass_side', 'dirt', true, true],
  ['SAND', 'sand', 'sand', 'sand', true, true],
  ['ASPHALT', 'asphalt', 'concrete_dark', 'concrete_dark', true, true],
  ['LINE_X_HI', 'line_x_hi', 'concrete_dark', 'concrete_dark', true, true],
  ['LINE_X_LO', 'line_x_lo', 'concrete_dark', 'concrete_dark', true, true],
  ['LINE_Z_HI', 'line_z_hi', 'concrete_dark', 'concrete_dark', true, true],
  ['LINE_Z_LO', 'line_z_lo', 'concrete_dark', 'concrete_dark', true, true],
  ['CROSS_X', 'cross_x', 'concrete_dark', 'concrete_dark', true, true],
  ['CROSS_Z', 'cross_z', 'concrete_dark', 'concrete_dark', true, true],
  ['SIDEWALK', 'sidewalk', 'concrete', 'concrete', true, true],
  ['CONCRETE', 'concrete', 'concrete', 'concrete', true, true],
  ['CONCRETE_DARK', 'concrete_dark', 'concrete_dark', 'concrete_dark', true, true],
  ['BRICK', 'brick', 'brick', 'brick', true, true],
  ['BRICK_TAN', 'brick_tan', 'brick_tan', 'brick_tan', true, true],
  ['STONE_BEIGE', 'stone_beige', 'stone_beige', 'stone_beige', true, true],
  ['GLASS_BLUE', 'concrete_dark', 'glass_blue', 'concrete_dark', true, true],
  ['GLASS_TEAL', 'concrete_dark', 'glass_teal', 'concrete_dark', true, true],
  ['GLASS_GOLD', 'concrete_dark', 'glass_gold', 'concrete_dark', true, true],
  ['GLASS_LIT', 'concrete_dark', 'glass_lit', 'concrete_dark', true, true],
  ['GLASS_DARK', 'concrete_dark', 'glass_dark', 'concrete_dark', true, true],
  ['METAL', 'metal', 'metal', 'metal', true, true],
  ['ROOF', 'roof', 'concrete_dark', 'concrete_dark', true, true],
  ['WATER', 'water', 'water', 'water', false, false],
  ['LEAVES', 'leaves', 'leaves', 'leaves', true, true],
  ['LOG', 'log_top', 'log_side', 'log_top', true, true],
  ['PLANKS', 'planks', 'planks', 'planks', true, true],
  ['PANEL_WHITE', 'panel_white', 'panel_white', 'panel_white', true, true],
  ['PANEL_RED', 'panel_red', 'panel_red', 'panel_red', true, true],
  ['PANEL_ORANGE', 'panel_orange', 'panel_orange', 'panel_orange', true, true],
  ['PANEL_YELLOW', 'panel_yellow', 'panel_yellow', 'panel_yellow', true, true],
  ['PANEL_TEAL', 'panel_teal', 'panel_teal', 'panel_teal', true, true],
  ['PANEL_PURPLE', 'panel_purple', 'panel_purple', 'panel_purple', true, true],
  ['INTERIOR', 'interior', 'interior', 'interior', true, true],
  ['LAMP', 'lamp', 'lamp', 'lamp', true, true],
  ['DOOR', 'concrete_dark', 'door', 'concrete_dark', true, true],
  ['RED_LIGHT', 'red_light', 'red_light', 'red_light', true, true],
  ['HAZARD', 'hazard', 'hazard', 'hazard', true, true],
  ['CONT_BLUE', 'container_blue', 'container_blue', 'container_blue', true, true],
  ['CONT_RED', 'container_red', 'container_red', 'container_red', true, true],
  ['CONT_GREEN', 'container_green', 'container_green', 'container_green', true, true],
  ['PAINT_WHITE', 'paint_white', 'concrete', 'concrete', true, true],
  ['FLOWERS', 'flowers', 'grass_side', 'dirt', true, true],
  ['METAL_ROOF', 'metal_roof', 'metal', 'metal', true, true],
];

export const B = {};
export const BLOCK_COUNT = DEFS.length;
/** BLOCK_TILES[id*3 + 0|1|2] = top / side / bottom tile index. */
export const BLOCK_TILES = new Uint8Array(256 * 3);
export const SOLID = new Uint8Array(256);
export const OPAQUE = new Uint8Array(256);

DEFS.forEach(([name, top, side, bottom, solid, opaque], id) => {
  B[name] = id;
  if (top) {
    BLOCK_TILES[id * 3] = T[top];
    BLOCK_TILES[id * 3 + 1] = T[side];
    BLOCK_TILES[id * 3 + 2] = T[bottom];
  }
  SOLID[id] = solid ? 1 : 0;
  OPAQUE[id] = opaque ? 1 : 0;
});
