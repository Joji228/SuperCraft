// Menu screens: loading, main menu, mission select, briefing, results, settings,
// controls, credits, pause and the final victory screen.
import { RENDER_DISTANCES } from '../engine/Settings.js';
import { MISSIONS } from '../missions/missions.js';
import { loadProgress, fmt } from '../missions/MissionManager.js';
import { HEROES, heroPortrait } from '../player/heroes.js';

export const VERSION = '0.1';

const CONTROLS = [
  ['W A S D', 'Move'],
  ['Mouse', 'Look'],
  ['Space', 'Jump (double-tap in the air to fly)'],
  ['Shift', 'Super speed on foot / boost while flying (hold to go supersonic)'],
  ['F', 'Toggle flight'],
  ['Space / C or Ctrl', 'Fly up / down (hold down on the ground to land)'],
  ['Left mouse', 'Punch (3-hit combo) / throw what you carry'],
  ['Right mouse (hold)', 'Laser eyes (watch the heat meter)'],
  ['Q (hold)', 'Super breath: freeze, push, put out fires'],
  ['E', 'Super senses: see through walls'],
  ['G', 'Pick up / drop people, objects and cars'],
  ['Middle mouse', 'Lock on to the target nearest the crosshair (again to release)'],
  ['T', 'Free Roam: summon the Iron Tyrant from the red plaza circle'],
  ['R', 'Free Roam: steal a car / get out (W S drive, A D steer, Shift nitro, Space handbrake, H horn)'],
  ['Granite', 'Hold Space to charge a leap (release to jump) · Right mouse: Granite Smash (in the air: dive slam) · Q thunder clap'],
  ['Tether', 'In the air press Space for each web, hold to swing, let go near the top for a boost · hold Shift while swinging for speed · Q web zip · Right mouse web ball · Shift + W up walls, Space kicks off'],
  ['Forge', 'F fly, Shift boost / afterburner · hold Right mouse: repulsors · hold Q: Unibeam · E: homing missiles'],
  ['Flux', 'Hold Q and move the mouse to pick an alien (middle = back to Kai) · the PRISM bar runs down while you are an alien'],
  ['V', 'Camera: close / medium / far / first person'],
  ['Esc', 'Pause'],
  ['F3', 'Debug info (FPS)'],
];

const stars = (n, max = 3) => '<span class="stars">' + '★'.repeat(n) + '<span class="dim">' + '★'.repeat(max - n) + '</span></span>';

export class Menus {
  constructor(root, settings, game) {
    this.root = root;
    this.settings = settings;
    this.game = game;
    this.current = null;
    this.back = 'main';
  }

  hide() {
    this.root.innerHTML = '';
    this.root.className = '';
    this.current = null;
  }

  render(name, html, cls = 'screen') {
    this.current = name;
    this.root.className = 'active';
    this.root.innerHTML = `<div class="${cls}">${html}</div>`;
    this.root.querySelectorAll('[data-action]').forEach((el) =>
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.game.audio.play('click');
        this.action(el.dataset.action, el.dataset.arg);
      }),
    );
  }

  action(a, arg) {
    const g = this.game;
    switch (a) {
      case 'freeroam':
        return g.startFreeRoam();
      case 'campaign':
        return this.showMissions();
      case 'brief':
        return this.showBriefing(parseInt(arg, 10));
      case 'play':
        return g.startMission(parseInt(arg, 10));
      case 'resume':
        return g.resume();
      case 'quit':
        return g.quitToMenu();
      case 'settings':
        return this.showSettings();
      case 'controls':
        return this.showControls();
      case 'credits':
        return this.showCredits();
      case 'main':
        return this.showMain();
      case 'resetAll':
        return this.resetAll();
      case 'heroes':
        return this.showHeroes();
      case 'hero':
        this.settings.set('hero', arg);
        return this.showHeroes();
      case 'back':
        return this.back === 'pause' ? this.showPause(this.pauseInfo) : this.showMain();
    }
  }

  showLoading() {
    this.render(
      'loading',
      `<h1 class="logo">SUPER<span>CRAFT</span></h1>
       <p class="loading-text" id="load-text">Building Brightport...</p>
       <div class="bar"><div class="bar-fill" id="load-bar"></div></div>`,
      'screen loading',
    );
  }

  setProgress(p, text) {
    const bar = this.root.querySelector('#load-bar');
    if (bar) bar.style.width = `${Math.round(p * 100)}%`;
    if (text) {
      const t = this.root.querySelector('#load-text');
      if (t) t.textContent = text;
    }
  }

  showError(msg) {
    this.render('error', `<h2>Something went wrong</h2><p class="small">${msg}</p>`, 'screen');
  }

  showMain() {
    this.back = 'main';
    const prog = loadProgress();
    const total = Object.values(prog.stars).reduce((s, n) => s + n, 0);
    this.render(
      'main',
      `<h1 class="logo">SUPER<span>CRAFT</span></h1>
       <p class="tagline">Aegis protects Brightport</p>
       <div class="menu">
         <button data-action="campaign" class="primary">Campaign <small>${total}/${MISSIONS.length * 3} ★</small></button>
         ${this.freeRoamOpen() ? '<button data-action="freeroam" class="primary">Free Roam</button>' : '<button disabled class="locked-mode" title="Complete First Flight in the Campaign to unlock Free Roam">&#128274; Free Roam<span class="unlock-hint">Complete the first Campaign mission, First Flight, to unlock</span></button>'}
         <button data-action="heroes">Heroes</button>
         <button data-action="controls">Controls</button>
         <button data-action="settings">Settings</button>
         <button data-action="credits">Credits</button>
       </div>
       <p class="small foot">Click a mode to play &middot; Esc pauses &middot; v${VERSION}</p>`,
      'screen main',
    );
  }

  /** Free Roam opens once the tutorial mission has been completed (or everything is unlocked for testing). */
  freeRoamOpen() {
    const prog = loadProgress();
    return this.settings.unlockAll || (prog.stars['first-flight'] || 0) > 0;
  }

  /** Hero select: Sky Guardian is playable, the rest are coming soon. */
  showHeroes() {
    const cur = this.settings.hero || 'sky';
    const cards = HEROES.map((h) => {
      const sel = h.playable && h.id === cur;
      const badge = sel ? '<span class="hero-badge selected">SELECTED</span>' : h.playable ? '<span class="hero-badge">PLAY</span>' : `<span class="hero-badge soon">${h.next ? 'NEXT UP' : 'COMING SOON'}</span>`;
      return `<button class="hero-card ${sel ? 'selected' : ''} ${h.playable ? '' : 'soon'}" ${h.playable ? `data-action="hero" data-arg="${h.id}"` : 'disabled'}>
        ${badge}
        <img class="hero-portrait" src="${heroPortrait(h.id)}" alt="">
        <span class="hero-name">${h.name}</span>
        <span class="hero-alias">${h.alias}</span>
        ${h.note ? `<span class="hero-note">${h.note}</span>` : ''}
        <ul class="hero-powers">${h.powers.map((p) => `<li>${p}</li>`).join('')}</ul>
      </button>`;
    }).join('');
    this.render(
      'heroes',
      `<h2>Heroes</h2><p class="small hero-sub">Pick who you play in Free Roam (the Campaign is always Sky Guardian).</p>
       <div class="hero-cards">${cards}</div>
       <div class="menu"><button data-action="main">Back</button></div>`,
      'screen wide heroes',
    );
  }

  /** Testing helper: wipe campaign stars, Free Roam stats and settings. */
  resetAll() {
    if (!window.confirm('Reset all campaign progress, Free Roam stats and settings?')) return;
    for (const key of ['progress', 'freeroam', 'settings']) {
      try {
        localStorage.removeItem('supercraft.' + key);
      } catch {
        // storage unavailable: nothing saved anyway
      }
    }
    location.reload();
  }

  showMissions() {
    const prog = loadProgress();
    const cards = MISSIONS.map((m, i) => {
      const locked = !this.settings.unlockAll && i + 1 > prog.unlocked;
      const s = prog.stars[m.id] || 0;
      const best = prog.best[m.id];
      return `<button class="mission ${locked ? 'locked' : ''}" ${locked ? 'disabled' : `data-action="brief" data-arg="${i}"`}>
        <span class="m-num">${i + 1}</span>
        <span class="m-body"><span class="m-name">${locked ? '&#128274; ' : ''}${m.name}</span><span class="m-tag">${m.tagline}</span></span>
        <span class="m-stars">${stars(s)}${best ? `<small>${fmt(best)}</small>` : ''}</span>
      </button>`;
    }).join('');
    this.render(
      'missions',
      `<h2>Campaign</h2><div class="missions">${cards}</div>
       <div class="menu"><button data-action="main">Back</button></div>`,
      'screen wide',
    );
  }

  showBriefing(i) {
    const m = MISSIONS[i];
    const prog = loadProgress();
    const r = m.rating;
    this.render(
      'briefing',
      `<p class="small kicker">Mission ${i + 1} &middot; ${m.tagline}</p>
       <h2>${m.name}</h2>
       <p class="brief">${m.briefing}</p>
       <div class="goals small">
         <div>★ Finish under <b>${fmt(r.par)}</b></div>
         <div>★ Keep everyone safe</div>
         <div>★ Take less than <b>${r.damage}</b> damage</div>
         ${m.timeLimit ? `<div class="warn">Time limit: <b>${fmt(m.timeLimit)}</b></div>` : ''}
         ${prog.stars[m.id] ? `<div>Best: ${stars(prog.stars[m.id])}</div>` : ''}
       </div>
       <div class="menu">
         <button data-action="play" data-arg="${i}" class="primary">Start mission</button>
         <button data-action="campaign">Back</button>
       </div>`,
      'screen wide',
    );
  }

  showPause(info = '') {
    this.back = 'pause';
    this.pauseInfo = info;
    const run = this.game.mode;
    const retry = run && run.def ? `<button data-action="play" data-arg="${run.index}">Restart mission</button>` : '';
    this.render(
      'pause',
      `<h2>Paused</h2>${info}
       <div class="menu">
         <button data-action="resume" class="primary">Resume</button>
         ${retry}
         <button data-action="controls">Controls</button>
         <button data-action="settings">Settings</button>
         <button data-action="quit">Main Menu</button>
       </div>`,
      'screen pause',
    );
  }

  resultRows(result) {
    return result.criteria.map((c) => `<tr class="${c.ok ? 'ok' : ''}"><td>${c.ok ? '★' : '☆'}</td><td>${c.label}</td><td>${c.value}</td></tr>`).join('');
  }

  showResult(run, result) {
    const i = run.index;
    const next = i + 1 < MISSIONS.length ? `<button data-action="brief" data-arg="${i + 1}" class="primary">Next mission</button>` : '';
    const roam = this.freeRoamOpen() ? '<button data-action="freeroam" class="primary">Free Roam</button>' : '';
    this.render(
      'result',
      `<p class="small kicker">Mission complete</p>
       <h2>${run.def.name}</h2>
       <div class="big-stars">${stars(result.stars)}</div>
       <table class="rating">${this.resultRows(result)}</table>
       <div class="menu">
         ${next}
         ${roam}
         <button data-action="play" data-arg="${i}">Replay</button>
         <button data-action="campaign">Mission select</button>
         <button data-action="quit">Main menu</button>
       </div>`,
      'screen wide',
    );
  }

  showFail(run, reason) {
    this.render(
      'fail',
      `<p class="small kicker">Mission failed</p>
       <h2>${run.def.name}</h2>
       <p>${reason}</p>
       <div class="menu">
         <button data-action="play" data-arg="${run.index}" class="primary">Try again</button>
         <button data-action="campaign">Mission select</button>
         <button data-action="quit">Main menu</button>
       </div>`,
      'screen',
    );
  }

  showVictory(run, result) {
    this.render(
      'victory',
      `<h1 class="logo">BRIGHTPORT<br><span>IS SAVED</span></h1>
       <p class="brief">The Iron Tyrant lies in pieces, the gangs are behind bars and the skies over Brightport are clear. The city has a hero. Thank you, Aegis.</p>
       <div class="big-stars">${stars(result.stars)}</div>
       <table class="rating">${this.resultRows(result)}</table>
       <div class="menu">
         <button data-action="freeroam" class="primary">Keep patrolling (Free Roam)</button>
         <button data-action="credits">Credits</button>
         <button data-action="quit">Main menu</button>
       </div>`,
      'screen wide victory',
    );
  }

  showControls() {
    const rows = CONTROLS.map(([k, v]) => `<tr><td class="key">${k}</td><td>${v}</td></tr>`).join('');
    this.render(
      'controls',
      `<h2>Controls</h2><table class="controls">${rows}</table>
       <div class="menu"><button data-action="back">Back</button></div>`,
      'screen wide',
    );
  }

  showCredits() {
    this.render(
      'credits',
      `<h2>Credits</h2>
       <p>SuperCraft, made by Joji228 with Claude.</p>
       <p class="small">Built with <b>Three.js</b> (MIT license).<br>
       Font: <b>Press Start 2P</b> by CodeMan38 (SIL Open Font License).<br>
       All textures, models and sounds are generated in code.</p>
       <p class="small">Aegis, Brightport, Rook, Skyhook and the Iron Tyrant are original creations.</p>
       <div class="menu"><button data-action="back">Back</button></div>`,
    );
  }

  showSettings() {
    const s = this.settings;
    const rd = RENDER_DISTANCES.map((r) => `<option value="${r.value}" ${r.value === s.renderDistance ? 'selected' : ''}>${r.label}</option>`).join('');
    this.render(
      'settings',
      `<h2>Settings</h2>
       <div class="settings">
         <label>Mouse sensitivity <span id="sens-val">${s.sensitivity.toFixed(1)}</span>
           <input type="range" id="sensitivity" min="0.2" max="3" step="0.1" value="${s.sensitivity}"></label>
         <label>Field of view <span id="fov-val">${s.fov}</span>
           <input type="range" id="fov" min="60" max="100" step="1" value="${s.fov}"></label>
         <label>Render distance <select id="renderDistance">${rd}</select></label>
         <label>Volume <span id="vol-val">${Math.round(s.volume * 100)}</span>
           <input type="range" id="volume" min="0" max="1" step="0.05" value="${s.volume}"></label>
         <label class="check"><input type="checkbox" id="shadows" ${s.shadows ? 'checked' : ''}> Shadows</label>
         <label class="check"><input type="checkbox" id="invertY" ${s.invertY ? 'checked' : ''}> Invert mouse Y</label>
         <label class="check"><input type="checkbox" id="dayNight" ${s.dayNight ? 'checked' : ''}> Day/night cycle</label>
         <label>Camera (V cycles) <select id="cameraMode">${['Close', 'Medium', 'Far', 'First person'].map((l, i) => `<option value="${i}" ${s.cameraMode === i ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
       </div>
       <div class="testing">
         <span class="kicker">Testing</span>
         <label class="check"><input type="checkbox" id="unlockAll" ${s.unlockAll ? 'checked' : ''}> Unlock all missions</label>
         <button data-action="resetAll" class="danger">Reset all progress</button>
       </div>
       <div class="menu"><button data-action="back">Back</button></div>`,
    );
    const q = (id) => this.root.querySelector('#' + id);
    q('sensitivity').addEventListener('input', (e) => {
      s.set('sensitivity', parseFloat(e.target.value));
      q('sens-val').textContent = s.sensitivity.toFixed(1);
    });
    q('fov').addEventListener('input', (e) => {
      s.set('fov', parseInt(e.target.value, 10));
      q('fov-val').textContent = s.fov;
    });
    q('volume').addEventListener('input', (e) => {
      s.set('volume', parseFloat(e.target.value));
      q('vol-val').textContent = Math.round(s.volume * 100);
    });
    q('renderDistance').addEventListener('change', (e) => s.set('renderDistance', parseInt(e.target.value, 10)));
    q('cameraMode').addEventListener('change', (e) => s.set('cameraMode', parseInt(e.target.value, 10)));
    for (const id of ['shadows', 'invertY', 'dayNight', 'unlockAll']) q(id).addEventListener('change', (e) => s.set(id, e.target.checked));
  }
}
