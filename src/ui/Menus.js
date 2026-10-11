// Menu screens: loading, main menu, settings, controls, credits and pause.
import { RENDER_DISTANCES } from '../engine/Settings.js';

const CONTROLS = [
  ['W A S D', 'Move'],
  ['Mouse', 'Look'],
  ['Space', 'Jump (double-tap in the air to fly)'],
  ['Shift', 'Run / boost while flying'],
  ['F', 'Toggle flight'],
  ['Space / C or Ctrl', 'Fly up / down'],
  ['V', 'Third / first person'],
  ['Esc', 'Pause'],
  ['F3', 'Debug info'],
  ['Left mouse', 'Punch (coming in Phase 2)'],
  ['Right mouse', 'Laser eyes (coming in Phase 2)'],
  ['Q', 'Super breath (coming in Phase 2)'],
  ['E', 'Super senses (coming in Phase 2)'],
  ['G', 'Carry (coming in Phase 2)'],
];

export class Menus {
  constructor(root, settings, handlers) {
    this.root = root;
    this.settings = settings;
    this.handlers = handlers;
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
        this.action(el.dataset.action);
      }),
    );
  }

  action(a) {
    switch (a) {
      case 'freeroam':
        return this.handlers.startFreeRoam();
      case 'resume':
        return this.handlers.resume();
      case 'quit':
        return this.handlers.quitToMenu();
      case 'settings':
        return this.showSettings();
      case 'controls':
        return this.showControls();
      case 'credits':
        return this.showCredits();
      case 'back':
        return this.back === 'pause' ? this.showPause() : this.showMain();
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
    this.render(
      'main',
      `<h1 class="logo">SUPER<span>CRAFT</span></h1>
       <p class="tagline">Aegis protects Brightport</p>
       <div class="menu">
         <button data-action="campaign" disabled title="Coming in Phase 5">Campaign <small>soon</small></button>
         <button data-action="freeroam" class="primary">Free Roam</button>
         <button data-action="controls">Controls</button>
         <button data-action="settings">Settings</button>
         <button data-action="credits">Credits</button>
       </div>
       <p class="small foot">Phase 1 preview &middot; click Free Roam to play</p>`,
      'screen main',
    );
  }

  showPause() {
    this.back = 'pause';
    this.render(
      'pause',
      `<h2>Paused</h2>
       <div class="menu">
         <button data-action="resume" class="primary">Resume</button>
         <button data-action="controls">Controls</button>
         <button data-action="settings">Settings</button>
         <button data-action="quit">Main Menu</button>
       </div>`,
      'screen pause',
    );
  }

  showControls() {
    const rows = CONTROLS.map(([k, v]) => `<tr><td class="key">${k}</td><td>${v}</td></tr>`).join('');
    this.render(
      'controls',
      `<h2>Controls</h2><table class="controls">${rows}</table>
       <div class="menu"><button data-action="back">Back</button></div>`,
    );
  }

  showCredits() {
    this.render(
      'credits',
      `<h2>Credits</h2>
       <p>SuperCraft, made by Gi with Claude.</p>
       <p class="small">Built with <b>Three.js</b> (MIT license).<br>
       Font: <b>Press Start 2P</b> by CodeMan38 (SIL Open Font License).<br>
       All textures, models and sounds are generated in code.</p>
       <p class="small">Aegis and Brightport are original creations.</p>
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
         <label class="check"><input type="checkbox" id="shadows" ${s.shadows ? 'checked' : ''}> Shadows</label>
         <label class="check"><input type="checkbox" id="invertY" ${s.invertY ? 'checked' : ''}> Invert mouse Y</label>
         <label class="check"><input type="checkbox" id="dayNight" ${s.dayNight ? 'checked' : ''}> Day/night cycle</label>
         <label class="check"><input type="checkbox" id="firstPerson" ${s.firstPerson ? 'checked' : ''}> First-person camera</label>
         <label>Volume <span id="vol-val">${Math.round(s.volume * 100)}</span>
           <input type="range" id="volume" min="0" max="1" step="0.05" value="${s.volume}"></label>
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
    for (const id of ['shadows', 'invertY', 'dayNight', 'firstPerson']) q(id).addEventListener('change', (e) => s.set(id, e.target.checked));
  }
}
