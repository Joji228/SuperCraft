// Meshes edited chunks off the main thread, so melting, smashing and blasting the
// city doesn't stall the game. Gets a padded block grid, sends back the mesh arrays.
import { meshGrid } from './ChunkMesher.js';

self.onmessage = (e) => {
  const { i, grid, maxY, top } = e.data;
  const r = meshGrid(grid, maxY);
  const transfer = [];
  for (const d of [r.solid, r.water]) if (d) for (const k in d) transfer.push(d[k].buffer);
  self.postMessage({ i, top, solid: r.solid, water: r.water }, transfer);
};
