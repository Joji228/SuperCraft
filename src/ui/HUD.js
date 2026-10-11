// In-game overlay: crosshair, flight status, speed/altitude, debug info and speed lines.
import { CITY } from '../world/CityGenerator.js';

export class HUD {
  constructor(root, fxCanvas) {
    this.root = root;
    this.fx = fxCanvas;
    this.ctx = fxCanvas.getContext('2d');
    this.debug = false;
    root.innerHTML = `
      <div class="crosshair"></div>
      <div class="hud-status">
        <div class="hud-mode" id="hud-mode">ON FOOT</div>
        <div class="hud-readout"><span id="hud-speed">0</span> <span id="hud-unit">KM/H</span> &nbsp; ALT <span id="hud-alt">0</span> M</div>
      </div>
      <div class="hud-hint" id="hud-hint">
        <b>WASD</b> move &nbsp; <b>SPACE</b> jump &nbsp; <b>F</b> fly<br>
        Flying: <b>SPACE</b> up &nbsp; <b>C/CTRL</b> down &nbsp; <b>SHIFT</b> boost<br>
        <b>V</b> camera &nbsp; <b>ESC</b> pause &nbsp; <b>F3</b> debug
      </div>
      <div class="hud-debug hidden" id="hud-debug"></div>
      <div class="hud-click">Click to play</div>
      <div class="hud-flash" id="hud-flash"></div>
    `;
    this.mode = root.querySelector('#hud-mode');
    this.speed = root.querySelector('#hud-speed');
    this.alt = root.querySelector('#hud-alt');
    this.unit = root.querySelector('#hud-unit');
    this.flashEl = root.querySelector('#hud-flash');
    this.hint = root.querySelector('#hud-hint');
    this.debugEl = root.querySelector('#hud-debug');
    this.hintTimer = 14;
    this.lastMode = '';
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.fx.width = window.innerWidth;
    this.fx.height = window.innerHeight;
  }

  show(v) {
    this.root.classList.toggle('hidden', !v);
    if (!v) this.ctx.clearRect(0, 0, this.fx.width, this.fx.height);
  }

  toggleDebug() {
    this.debug = !this.debug;
    this.debugEl.classList.toggle('hidden', !this.debug);
  }

  update(dt, player, info) {
    const m = player.supersonic ? 'SUPERSONIC' : player.boosting ? 'BOOST' : player.flying ? 'FLYING' : 'ON FOOT';
    if (m !== this.lastMode) {
      this.mode.textContent = m;
      this.mode.className = 'hud-mode mode-' + m.toLowerCase().replace(' ', '-');
      this.lastMode = m;
    }
    if (player.supersonic) {
      // game-world speeds are scaled down; show the fantasy number once past the barrier
      this.speed.textContent = 'MACH ' + (1 + Math.max(0, player.vel.length() - 62) / 130).toFixed(2);
      this.unit.textContent = '';
    } else {
      this.speed.textContent = Math.round(player.vel.length() * 3.6);
      this.unit.textContent = 'KM/H';
    }
    this.alt.textContent = Math.max(0, Math.round(player.pos.y - CITY.G));

    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hint.classList.add('fade');
    }

    if (this.debug) {
      const p = player.pos;
      this.debugEl.innerHTML =
        `FPS ${info.fps}<br>` +
        `XYZ ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}<br>` +
        `CHUNKS ${info.chunks}<br>DRAWS ${info.calls}<br>TRIS ${(info.tris / 1000).toFixed(0)}K`;
    }

    this.drawSpeedLines(player.boostAmount);
  }

  flash(strength = 0.5) {
    const el = this.flashEl;
    el.style.transition = 'none';
    el.style.opacity = String(strength);
    void el.offsetWidth; // restart the fade
    el.style.transition = 'opacity 0.6s ease-out';
    el.style.opacity = '0';
  }

  drawSpeedLines(amount) {
    const ctx = this.ctx;
    const w = this.fx.width, h = this.fx.height;
    ctx.clearRect(0, 0, w, h);
    if (amount < 0.25) return;
    const a = Math.min(1.3, (amount - 0.25) / 0.75);
    const cx = w / 2, cy = h / 2;
    const r0 = Math.min(w, h) * 0.32;
    const rMax = Math.hypot(w, h) / 2;
    ctx.strokeStyle = `rgba(255,255,255,${0.35 * a})`;
    ctx.lineCap = 'round';
    const n = Math.floor(40 * a);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r1 = r0 + Math.random() * (rMax - r0) * 0.6;
      const r2 = r1 + 60 + Math.random() * 160 * a;
      ctx.lineWidth = 1 + Math.random() * 3;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
      ctx.stroke();
    }
  }
}
