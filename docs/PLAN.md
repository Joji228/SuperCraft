# SuperCraft implementation plan

Hero: **Aegis**. City: **Brightport**. Fully original, no references to existing comics.

## Tech decisions

- **No build step.** `index.html` + plain ES modules. Three.js loaded through an import map from jsDelivr, pinned to `three@0.170.0`. All paths relative, so it works under `https://joji228.github.io/SuperCraft/`.
- **Voxel world in chunks.** City is about 512 x 512 blocks, up to 128 tall, split into 32 x 32 column chunks. Each chunk stores block ids in a `Uint8Array` and is turned into one merged mesh with hidden faces removed. Chunks beyond render distance are hidden; fog hides the edge.
- **Collision against the voxel grid** (player box vs. solid blocks), no physics library.
- **Textures:** one procedural 16x16 pixel-art atlas drawn on `<canvas>` at startup (asphalt, sidewalk, concrete, glass windows lit/unlit, brick, grass, water, metal...), nearest-neighbour filtering.
- **Audio:** Web Audio API synth only. **Saves:** `localStorage`.
- **Font:** "Press Start 2P" (free, OFL license) from Google Fonts for the chunky pixel look, with a monospace fallback.
- **Deterministic generation** from a seed, so the campaign city is always the same.

## File structure

```
index.html            entry page, import map, canvas, UI root
.nojekyll
css/style.css         menus + HUD styling
src/
  main.js             boot: settings, textures, world, start menu
  engine/             Game.js (state machine: menu/playing/paused), Loop.js (clamped-delta update + render; physics sub-steps),
                      Renderer.js (three setup, fog, shadows, resize), Settings.js
  input/Input.js      keyboard, mouse, pointer lock, action mapping
  util/               rng.js (seeded), math.js
  world/              Blocks.js (block ids + atlas UVs), Textures.js (procedural atlas),
                      CityGenerator.js (districts, roads, buildings, park, river, bridge),
                      World.js (chunk store, getBlock/setBlock, raycast), ChunkMesher.js,
                      Sky.js (sky colour, sun, day/night)
  player/             Player.js (movement, jump, flight, collision), HeroModel.js (blocky Aegis),
                      CameraRig.js (third/first person, FOV kick, speed lines)
  abilities/          Punch.js, Laser.js, Breath.js, Senses.js, Carry.js, Meters.js
  npc/                Civilians.js, Traffic.js
  enemies/            Thug.js, Drone.js, Boss.js, AI.js (patrol/chase/attack/flee)
  fx/                 Particles.js (fire, smoke, ice, sparks)
  modes/              FreeRoam.js, EventDirector.js (random events)
  missions/           MissionManager.js, missions.js (the 5 missions as data/config)
  ui/                 Menus.js, HUD.js, Minimap.js, Screens.js (briefing, complete, fail)
  audio/Audio.js
  save/Save.js
docs/PLAN.md          this file
```

## Phases

1. **Scaffold + city + movement + flight** (details below).
2. **Abilities and meters:** punch combo, laser eyes + heat, super breath, super senses, carrying; health/energy/heat; HUD with crosshair and meters.
3. **Life and combat:** civilians (walk, panic, cheer), traffic, thugs, drones, a boss template, AI states, hit feedback and damage numbers, sound effects.
4. **Free Roam:** event director (muggings, crashes, fires, drone attacks, mini-boss), compass/minimap markers, stats.
5. **Campaign:** mission framework (briefing, objectives, fail conditions, star rating), the 5 missions, full menus, mission select, save system.
6. **Polish:** performance pass, particles, juice, settings complete, bug fixing, README final.

## Phase 1 in detail

- `index.html`, `.nojekyll`, import map, CSS, simple main menu (Free Roam button; others shown as "coming soon"), Esc pause menu.
- Render loop with clamped delta time and physics sub-steps, FPS counter, window resize.
- Procedural pixel-art texture atlas.
- Procedural Brightport: road grid with sidewalks and lane markings, downtown core of 40-90 block skyscrapers, mid-rise ring, industrial zone (warehouses, tanks), a park with trees and a pond, a river/harbour crossing the city and a bridge over it. Buildings get window facades and rooftop details.
- Chunked meshing, render-distance culling, fog, sun light with optional shadows.
- Aegis as a blocky model (cape included) with simple walk/fly poses.
- WASD + mouse look (pointer lock), Space jump, collision with blocks.
- Third-person camera with wall avoidance; V toggles first person.
- Flight: F toggle, Space up, Ctrl/C down, Shift boost with FOV kick and speed lines.
- Settings (saved in localStorage): mouse sensitivity, invert Y, render distance, shadows.
- README: how to run locally and how to turn on GitHub Pages.

Not in Phase 1: abilities, NPCs, cars, enemies, sound, missions.
