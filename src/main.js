import { Game } from './engine/Game.js';

const game = new Game();

// small full-screen toggle in the top-right corner (shown in menus and when paused)
const fsBtn = document.getElementById('fullscreen');
fsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
});
document.addEventListener('fullscreenchange', () => {
  const on = !!document.fullscreenElement;
  fsBtn.classList.toggle('on', on);
  fsBtn.textContent = on ? 'Exit fullscreen' : 'Fullscreen';
});
window.supercraft = game; // handy for debugging in the console

game.init().catch((err) => {
  console.error(err);
  game.menus.showError(String(err && err.message ? err.message : err));
});
