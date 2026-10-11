# SuperCraft

A Minecraft-style voxel superhero game that runs in the browser.

You play **Aegis**, an original superhero, in the blocky city of **Brightport**.
Fly between skyscrapers, break the sound barrier, punch, burn, freeze and
carry your way through crimes, fires and villains: in an open city or a
five-mission campaign.

## Modes

- **Campaign:** five handcrafted missions, unlocked in order, each rated with
  up to three stars (time, people kept safe, damage taken).
  1. **First Flight:** tutorial. Each power unlocks as you learn it: walk,
     jump, take off, fly a ring course around a city block, boost down an
     avenue, punch training dummies, laser targets, put out a fire and find a
     lost cat with super senses.
  2. **Bank Job:** stop the Rook Gang robbing the bank, then beat Rook himself.
  3. **Tower Inferno:** put out a skyscraper fire and fly trapped workers down
     to the ambulance before the timer runs out.
  4. **Bridge Collapse:** pull sinking cars out of the river, rescue commuters,
     destroy drones, then chase down the jet-pack villain Skyhook.
  5. **Iron Tyrant:** a three-phase fight against a giant mech in the plaza.
- **Free Roam:** the open city with pedestrians and traffic. Random emergencies
  pop up (robberies, car crashes, building fires, drone attacks and a mini-boss)
  and show on the minimap and HUD. Your totals of people saved, villains
  defeated and events handled are saved.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click the game to capture the mouse) |
| Space | Jump, double-tap in the air to take off |
| Shift | Run on foot, boost while flying (uses the SPEED bar; hold ~2 s for a sonic boom) |
| F | Toggle flight |
| Space / C or Ctrl | Fly up / down (hold down on the ground to land) |
| Left mouse | Punch (3-hit combo), or throw what you are carrying |
| Right mouse (hold) | Laser eyes: damages, melts blocks, starts fires. Overheats! |
| Q (hold) | Super breath: freezes enemies, pushes things, puts out fires, freezes water |
| E | Super senses: see enemies, people in danger and objectives through walls |
| G | Pick up / drop people, objects and even cars |
| V | Switch third / first person |
| Esc | Pause |
| F3 | Debug info (FPS, draw calls) |

Tips:

- Use **C** rather than Ctrl to fly down. Browsers don't let games block
  shortcuts like Ctrl+W, so Ctrl plus a movement key can close the tab.
- Frozen enemies take double damage from punches. Frozen drones fall out of the sky.
- Drop rescued people inside the green zones to save them.
- Super senses mark special targets with a pink beam of light, enemies with red
  markers and people who need help with yellow ones.
- Follow the gold light beam and the arrow at the screen edge to your objective.
- Health and energy refill on their own when you stay out of trouble.

## Run locally

The game uses ES modules, so it has to be served over HTTP (opening
`index.html` directly from disk won't work). On Windows, just double-click
`play.bat`: it starts a no-cache server on port 8080 and opens the game, so a normal
refresh always picks up the latest version. Or, from the project folder:

```
python -m http.server 8000
```

then open http://localhost:8000. Any static server works too, e.g. `npx serve`.
An internet connection is needed the first time because Three.js and the font
load from a CDN.

## Publish on GitHub Pages

1. Push the repository to GitHub.
2. Open the repository on GitHub and go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Pick the **main** branch and the **/ (root)** folder, then click **Save**.
5. After a minute or two the game is live at https://joji228.github.io/SuperCraft/.

There is no build step: `index.html` at the repo root is the game, and the
`.nojekyll` file tells Pages to serve every file as is.

## Adding missions

Missions are data in [`src/missions/missions.js`](src/missions/missions.js).
Each mission has a briefing, named anchor points, a rating (par time, damage
limit) and a list of stages. A stage can spawn things in its `start` function
and lists objectives such as:

```js
{ type: 'destroy', tag: 'gang', label: 'Take down the gang' }
{ type: 'rescue', tag: 'trapped', at: somePoint, label: 'Fly the workers to safety' }
{ type: 'extinguish', tag: 'inferno', label: 'Put out the fires' }
{ type: 'protect', maxLost: 4, label: 'Keep bystanders safe' }
```

Other types: `reach`, `action` (jump, fly, land, senses, supersonic), `rings`,
`defeat`, `find` and `custom`. Append a new entry to `MISSIONS` and it appears
in mission select automatically.

## Tech

- [Three.js](https://threejs.org/) 0.170.0 loaded through an import map, no bundler.
- The city is a 512 × 512 × 128 voxel world, generated from a fixed seed and
  drawn as 32 × 32 chunk meshes with hidden faces removed, ambient occlusion
  and glowing windows at night. Melted or smashed blocks remesh on the fly and
  are restored when a new mission starts.
- People, cars, props and drones are drawn with a few `InstancedMesh`es, so
  crowds and traffic cost only a handful of draw calls.
- All textures are 16 × 16 pixel art drawn on a `<canvas>` at startup; all
  sounds are synthesised with the Web Audio API. No external art or audio.
- Settings, campaign progress and Free Roam stats are saved in `localStorage`.

Code layout: `src/engine` (game loop, states), `src/world` (voxels, city
generator, meshing, sky, fires, zones), `src/player`, `src/abilities`,
`src/entities`, `src/npc`, `src/enemies`, `src/combat`, `src/fx`, `src/modes`
(Free Roam and its events), `src/missions`, `src/ui`, `src/audio`, `src/save`.
See [docs/PLAN.md](docs/PLAN.md) for the original plan.

## Status

All six planned phases are built: city, flight, powers, people and traffic,
enemies and bosses, Free Roam events, the five-mission campaign, menus,
saving, effects and sound.

## License

[MIT](LICENSE)
