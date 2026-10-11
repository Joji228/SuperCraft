# SuperCraft: Phases 2 to 6 report

Everything is committed locally on `main`. Nothing has been pushed.

## What was built

**Phase 2: powers and meters**
- Punch (left mouse): 3-hit combo with knockback, hit-stop and screen shake. It smashes glass, trees, lamps and street props, dents cars and knocks thugs flying.
- Laser eyes (hold right mouse): two beams from the eyes to the crosshair. They damage enemies, melt blocks above street level, scorch the road and set trees and wood on fire. A heat meter overheats if you hold too long.
- Super breath (hold Q): a freezing cone that puts out fires, freezes enemies (frozen enemies take double punch damage and frozen drones fall), pushes people, props and cars, and freezes the water surface. Uses energy.
- Super senses (E): tints the screen and shows enemies (red), people in danger (yellow) and objectives (green or pink) through walls. The minimap radar also widens. Drains energy.
- Carry (G): pick up people, props, knocked-out thugs and even cars. Left mouse throws objects (people are always set down gently).
- Health (slow regeneration), energy and heat bars, plus an ability bar, carry label, hit markers, damage numbers and a red damage vignette.

**Phase 3: people, traffic, enemies, audio**
- Pedestrians walk the sidewalks, panic and flee from gunfire, fires and villains, and cheer when saved.
- Cars drive the road grid in lanes, turn at intersections, cross the bridge, and stop and honk if something is in the way. Once knocked about, a car becomes a physics object.
- Thugs (bats or guns) patrol, chase, attack and flee at low health. Drones hover, strafe and shoot.
- Bosses with health bars and phases: The Brute (Free Roam mini-boss), Rook (Bank Job), Skyhook (Bridge Collapse) and the Iron Tyrant mech (finale).
- All sounds are synthesised with Web Audio: punches, laser hum, breath, wind, explosions, gunshots, sirens, cheering and more.

**Phase 4: Free Roam**
- Random events every 25 to 50 seconds: muggings, car crashes, building fires (with people on the roof), drone attacks, and the Brute after you've handled two events. Each event has a time limit.
- Events show as red pins on the HUD and minimap, with a distance-based siren.
- Saved stats: people saved, villains defeated, events handled.

**Phase 5: campaign**
- Five missions, unlocked in order: First Flight, Bank Job, Tower Inferno, Bridge Collapse and Iron Tyrant.
- Mission select with locks, stars and best times, then a briefing, an objectives panel with timer, a results screen and a fail screen.
- A victory cutscene after the final boss.
- Missions are data in `src/missions/missions.js`, so new ones can be added there.
- Rating: one star each for time, keeping people safe and taking little damage (minimum one star).

**Phase 6: polish**
- Windows, lamps and beacons glow at night.
- Particles for fire, smoke, ice, steam, sparks, debris, explosions and confetti.
- Instanced rendering for crowds and traffic: a busy scene measured about 3.5 ms of CPU per frame in testing.
- Melted or smashed blocks are restored whenever you start a mode or mission.
- The README is final.

## How to test
1. Double-click `play.bat` (or run `python -m http.server 8000` and open http://localhost:8000).
2. Play Campaign mission 1 (it teaches every power), then the others in order.
3. Try Free Roam and wait for the red alerts.
4. Press F3 for FPS. If it's slow, lower Render distance or turn off Shadows in Settings.

## Choices I made without asking
- Aegis takes 60% of each enemy's listed damage and regenerates health, so he feels like a superhero.
- If you're knocked out in Free Roam, you wake up at the plaza. In a mission, it's a fail with a retry button.
- The river is only one block below the bridge deck. In Bridge Collapse, cars slide into the gap and *sink* over 16 seconds instead of falling far, and you must grab them before they disappear.
- To beat the Iron Tyrant's shield in phase 2, freeze it with super breath, then punch it three times. In phase 3 the laser does double damage.
- The Free Roam mini-boss is "The Brute". The tutorial cat is "Whiskers".
- There's no background music, only sound effects.

## Known issues
- I tested everything in an automated browser that has no mouse capture and no sound. Please check how the mouse feels, how loud things are and the real FPS.
- Cars snap round 90° corners instead of steering smoothly. Pedestrians don't avoid each other.
- The Iron Tyrant walks over street furniture and crushes it; it can clip through lamp posts.
- Very long laser use can carve big holes in buildings (by design; they're restored on the next mission).
- Gamepad and mobile controls aren't done yet.

## Ideas for next steps
- Background music and voice-style text barks.
- More missions and Free Roam event types (the mission format makes this easy).
- Gamepad support, then touch controls.
- Performance check on your laptop, then publish to GitHub Pages when you say "push".
