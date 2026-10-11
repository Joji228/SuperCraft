# SuperCraft

A Minecraft-style voxel superhero game that runs in the browser.

You play **Aegis**, an original superhero, in the blocky city of **Brightport**.
Fly between skyscrapers, fight with your powers, and protect the city.
You can roam freely or play through a story campaign.

## Modes

- **Free Roam:** explore an open-world voxel city at your own pace.
- **Campaign:** five story missions (coming in a later phase).

## Powers

- **Flight:** soar between skyscrapers.
- **Laser eyes:** burn through blocks and enemies.
- **Super punch:** smash anything in reach.
- **Super breath:** freeze or blow away whatever is in front of you.
- **Super senses:** see threats and secrets through walls.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click the game to capture the mouse) |
| Space | Jump, double-tap in the air to take off |
| Shift | Run on foot, boost while flying |
| F | Toggle flight |
| Space / C or Ctrl | Fly up / down (hold down on the ground to land) |
| V | Switch third / first person |
| Esc | Pause |
| F3 | Debug info (FPS, position) |

Punch, laser eyes, super breath, super senses and carrying arrive in Phase 2.

Tip: use **C** rather than Ctrl to fly down. Browsers don't let games block
shortcuts like Ctrl+W, so Ctrl plus a movement key can close the tab.

## Run locally

The game uses ES modules, so it has to be served over HTTP (opening
`index.html` directly from disk won't work). On Windows, just double-click
`play.bat`: it starts the server and opens the game. Or, from the project folder:

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

## Tech

- [Three.js](https://threejs.org/) 0.170.0 loaded through an import map, no bundler.
- The city is a 512 × 512 × 128 voxel world, generated from a fixed seed and
  drawn as 32 × 32 chunk meshes with hidden faces removed and ambient occlusion.
- All textures are 16 × 16 pixel art drawn on a `<canvas>` at startup; sounds
  will be synthesised with the Web Audio API. No external art assets.
- Settings are saved in `localStorage`.

See [docs/PLAN.md](docs/PLAN.md) for the file layout and the build phases.

## Status

Phase 1 of 6 is done: the city, movement, the camera and flight.

## License

[MIT](LICENSE)
