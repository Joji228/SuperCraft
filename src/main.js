import { Game } from './engine/Game.js';

const game = new Game();
window.supercraft = game; // handy for debugging in the console

game.init().catch((err) => {
  console.error(err);
  game.menus.showError(String(err && err.message ? err.message : err));
});
