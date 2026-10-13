// Synthesised sound effects with the Web Audio API (no audio files).
// The context starts on the first user gesture, as browsers require.

export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.noise = null;
    this.loops = {};
    this.listener = null; // Vector3 of the hero, for distance falloff
    this.lastPlay = {};
  }

  /** Call from a click/keypress handler. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.settings.volume;
      this.comp = this.ctx.createDynamicsCompressor();
      this.master.connect(this.comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.settings.onChange((k, v) => {
        if (k === 'volume') this.master.gain.value = v;
      });
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get ready() {
    return this.ctx && this.ctx.state === 'running';
  }

  // ---------- building blocks ----------

  out(gain) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    g.connect(this.master);
    return g;
  }

  noiseBurst({ t = 0, dur = 0.2, type = 'lowpass', freq = 1000, freqEnd = null, q = 0.7, gain = 0.5, attack = 0.005, dest }) {
    const ctx = this.ctx;
    const at = ctx.currentTime + t;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, at);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, at + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(dest || this.master);
    src.start(at, Math.random());
    src.stop(at + dur + 0.05);
  }

  tone({ t = 0, dur = 0.2, type = 'sine', freq = 440, freqEnd = null, gain = 0.3, attack = 0.005, dest }) {
    const ctx = this.ctx;
    const at = ctx.currentTime + t;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(dest || this.master);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  // ---------- one-shots ----------

  /** pos (optional): world position; quieter with distance from the hero. */
  play(name, pos) {
    if (!this.ready) return;
    let vol = 1;
    if (pos && this.listener) {
      const d = Math.hypot(pos.x - this.listener.x, pos.y - this.listener.y, pos.z - this.listener.z);
      vol = Math.max(0, 1 - d / 70);
      if (vol <= 0.02) return;
    }
    // avoid machine-gunning the same sound in one frame
    const now = this.ctx.currentTime;
    if (this.lastPlay[name] && now - this.lastPlay[name] < 0.03) return;
    this.lastPlay[name] = now;
    const dest = this.out(vol);
    const fn = SOUNDS[name];
    if (fn) fn(this, dest);
  }

  sonicBoom() {
    this.play('boom');
  }

  // ---------- loops (continuous sounds with a level) ----------

  ensureLoop(name) {
    if (!this.ready) return null;
    if (this.loops[name]) return this.loops[name];
    const def = LOOPS[name];
    if (!def) return null;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);
    const nodes = def(this, gain);
    this.loops[name] = { gain, nodes, level: 0 };
    return this.loops[name];
  }

  setLoopLevel(name, level, smooth = 0.08) {
    const l = level > 0.001 ? this.ensureLoop(name) : this.loops[name];
    if (!l) return;
    if (Math.abs(l.level - level) < 0.005) return;
    l.level = level;
    l.gain.gain.setTargetAtTime(level * (LOOP_GAIN[name] ?? 0.3), this.ctx.currentTime, smooth);
    l.nodes.onLevel?.(level);
  }

  startLoop(name) {
    this.setLoopLevel(name, 1, 0.03);
  }

  stopLoop(name) {
    this.setLoopLevel(name, 0, 0.06);
  }

  stopAll() {
    for (const name of Object.keys(this.loops)) this.setLoopLevel(name, 0, 0.05);
  }

  /** Plays a short melody (array of [semitone offset from A4, beats]). */
  melody(notes, { bpm = 360, type = 'square', gain = 0.12, base = 440 } = {}) {
    if (!this.ready) return;
    const beat = 60 / bpm;
    let t = 0;
    for (const [n, beats] of notes) {
      if (n !== null) this.tone({ t, dur: beat * beats * 0.95, type, freq: base * Math.pow(2, n / 12), gain, attack: 0.01 });
      t += beat * beats;
    }
  }
}

const LOOP_GAIN = { engine: 0.2, wind: 0.5, laser: 0.22, breath: 0.35, senses: 0.12, fire: 0.3, siren: 0.07, city: 0.16 };

const LOOPS = {
  // car engine: two detuned saws through a lowpass, pitch follows rpm (0..1+)
  engine(a, dest) {
    const ctx = a.ctx;
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    const o2 = ctx.createOscillator();
    o2.type = 'sawtooth';
    const sub = ctx.createOscillator();
    sub.type = 'square';
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2;
    const sg = ctx.createGain();
    sg.gain.value = 0.35;
    o1.connect(f);
    o2.connect(f);
    sub.connect(sg).connect(f);
    f.connect(dest);
    const rpm = (r) => {
      const t = ctx.currentTime;
      const hz = 38 + r * 120;
      o1.frequency.setTargetAtTime(hz, t, 0.08);
      o2.frequency.setTargetAtTime(hz * 1.51, t, 0.08);
      sub.frequency.setTargetAtTime(hz * 0.5, t, 0.08);
      f.frequency.setTargetAtTime(380 + r * 1500, t, 0.08);
    };
    rpm(0);
    o1.start();
    o2.start();
    sub.start();
    return { rpm };
  },
  // distant city hum: low traffic rumble with a slow swell
  city(a, dest) {
    const ctx = a.ctx;
    const src = ctx.createBufferSource();
    src.buffer = a.noise;
    src.loop = true;
    src.playbackRate.value = 0.5;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;
    const swell = ctx.createGain();
    swell.gain.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 0.3;
    lfo.connect(lg).connect(swell.gain);
    const hum = ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = 58;
    const hg = ctx.createGain();
    hg.gain.value = 0.15;
    src.connect(f).connect(swell).connect(dest);
    hum.connect(hg).connect(dest);
    src.start();
    lfo.start();
    hum.start();
    return {};
  },
  wind(a, dest) {
    const ctx = a.ctx;
    const src = ctx.createBufferSource();
    src.buffer = a.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 400;
    f.Q.value = 0.6;
    src.connect(f).connect(dest);
    src.start();
    return { onLevel: (l) => f.frequency.setTargetAtTime(250 + l * 1400, ctx.currentTime, 0.1) };
  },
  laser(a, dest) {
    const ctx = a.ctx;
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 110;
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = 221;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 18;
    const lg = ctx.createGain();
    lg.gain.value = 30;
    lfo.connect(lg).connect(o1.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    o1.connect(f);
    o2.connect(f);
    f.connect(dest);
    o1.start();
    o2.start();
    lfo.start();
    return {};
  },
  breath(a, dest) {
    const ctx = a.ctx;
    const src = ctx.createBufferSource();
    src.buffer = a.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1800;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'lowpass';
    f2.frequency.value = 6000;
    src.connect(f).connect(f2).connect(dest);
    src.start();
    return {};
  },
  senses(a, dest) {
    const ctx = a.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 55;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = 82.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 1.2; // heartbeat-ish pulse
    const lg = ctx.createGain();
    lg.gain.value = 0.5;
    const amp = ctx.createGain();
    amp.gain.value = 0.5;
    lfo.connect(lg).connect(amp.gain);
    o.connect(amp);
    o2.connect(amp);
    amp.connect(dest);
    o.start();
    o2.start();
    lfo.start();
    return {};
  },
  fire(a, dest) {
    const ctx = a.ctx;
    const src = ctx.createBufferSource();
    src.buffer = a.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700;
    const crackle = ctx.createBufferSource();
    crackle.buffer = a.noise;
    crackle.loop = true;
    crackle.playbackRate.value = 0.25;
    const cf = ctx.createBiquadFilter();
    cf.type = 'highpass';
    cf.frequency.value = 3000;
    const cg = ctx.createGain();
    cg.gain.value = 0.4;
    src.connect(f).connect(dest);
    crackle.connect(cf).connect(cg).connect(dest);
    src.start();
    crackle.start();
    return {};
  },
  siren(a, dest) {
    const ctx = a.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 700;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 1.6;
    const lg = ctx.createGain();
    lg.gain.value = 120;
    lfo.connect(lg).connect(o.frequency);
    o.connect(dest);
    o.start();
    lfo.start();
    return {};
  },
};

const SOUNDS = {
  boom(a, d) {
    // a rushing swell into a deep, soft thump that rolls away (no harsh crack)
    a.noiseBurst({ dur: 0.45, type: 'bandpass', freq: 300, freqEnd: 1100, q: 0.8, gain: 0.35, attack: 0.3, dest: d });
    a.noiseBurst({ t: 0.32, dur: 2.2, type: 'lowpass', freq: 700, freqEnd: 45, gain: 0.8, attack: 0.04, dest: d });
    a.tone({ t: 0.32, dur: 1.2, freq: 70, freqEnd: 30, gain: 0.6, attack: 0.03, dest: d });
    a.tone({ t: 0.32, dur: 0.9, type: 'triangle', freq: 140, freqEnd: 60, gain: 0.12, attack: 0.03, dest: d });
  },
  whoosh(a, d) {
    a.noiseBurst({ dur: 0.16, type: 'bandpass', freq: 500, freqEnd: 1600, q: 1, gain: 0.18, attack: 0.04, dest: d });
  },
  punchHit(a, d) {
    a.tone({ dur: 0.12, freq: 160, freqEnd: 60, gain: 0.7, dest: d });
    a.noiseBurst({ dur: 0.08, type: 'lowpass', freq: 2500, gain: 0.5, dest: d });
  },
  punchHeavy(a, d) {
    a.tone({ dur: 0.25, freq: 120, freqEnd: 40, gain: 0.9, dest: d });
    a.noiseBurst({ dur: 0.2, type: 'lowpass', freq: 1800, freqEnd: 200, gain: 0.7, dest: d });
  },
  thud(a, d) {
    a.tone({ dur: 0.12, freq: 90, freqEnd: 50, gain: 0.5, dest: d });
  },
  crunch(a, d) {
    a.noiseBurst({ dur: 0.25, type: 'bandpass', freq: 900, q: 0.8, gain: 0.6, dest: d });
    a.tone({ dur: 0.1, freq: 200, freqEnd: 90, gain: 0.3, dest: d });
  },
  glass(a, d) {
    for (let i = 0; i < 5; i++) a.tone({ t: i * 0.025, dur: 0.15, type: 'triangle', freq: 2000 + Math.random() * 3000, gain: 0.12, dest: d });
    a.noiseBurst({ dur: 0.2, type: 'highpass', freq: 4000, gain: 0.35, dest: d });
  },
  melt(a, d) {
    a.noiseBurst({ dur: 0.3, type: 'bandpass', freq: 1500, q: 2, gain: 0.25, dest: d });
  },
  overheat(a, d) {
    a.tone({ dur: 0.12, type: 'square', freq: 220, gain: 0.15, dest: d });
    a.tone({ t: 0.15, dur: 0.12, type: 'square', freq: 165, gain: 0.15, dest: d });
  },
  freeze(a, d) {
    a.noiseBurst({ dur: 0.35, type: 'highpass', freq: 5000, freqEnd: 2500, gain: 0.35, dest: d });
    a.tone({ dur: 0.3, type: 'triangle', freq: 1800, freqEnd: 900, gain: 0.08, dest: d });
  },
  hiss(a, d) {
    a.noiseBurst({ dur: 0.8, type: 'highpass', freq: 3000, gain: 0.3, attack: 0.05, dest: d });
  },
  pickup(a, d) {
    a.tone({ dur: 0.1, type: 'triangle', freq: 300, freqEnd: 600, gain: 0.25, dest: d });
  },
  drop(a, d) {
    a.tone({ dur: 0.1, type: 'triangle', freq: 500, freqEnd: 250, gain: 0.2, dest: d });
  },
  throw(a, d) {
    a.noiseBurst({ dur: 0.25, type: 'bandpass', freq: 400, freqEnd: 1600, q: 1, gain: 0.4, attack: 0.03, dest: d });
  },
  sensesOn(a, d) {
    a.tone({ dur: 0.4, freq: 220, freqEnd: 880, gain: 0.15, dest: d });
  },
  sensesOff(a, d) {
    a.tone({ dur: 0.3, freq: 880, freqEnd: 220, gain: 0.12, dest: d });
  },
  gunshot(a, d) {
    a.noiseBurst({ dur: 0.14, type: 'lowpass', freq: 2400, freqEnd: 300, gain: 0.4, attack: 0.004, dest: d });
    a.tone({ dur: 0.06, type: 'square', freq: 140, freqEnd: 60, gain: 0.2, dest: d });
  },
  zap(a, d) {
    a.tone({ dur: 0.2, type: 'triangle', freq: 1100, freqEnd: 260, gain: 0.1, attack: 0.01, dest: d });
  },
  explosion(a, d) {
    a.noiseBurst({ dur: 1.2, type: 'lowpass', freq: 1200, freqEnd: 60, gain: 1, attack: 0.01, dest: d });
    a.tone({ dur: 0.6, freq: 80, freqEnd: 25, gain: 0.8, dest: d });
  },
  hurt(a, d) {
    a.tone({ dur: 0.15, type: 'square', freq: 180, freqEnd: 90, gain: 0.15, dest: d });
  },
  ko(a, d) {
    a.tone({ dur: 0.35, type: 'triangle', freq: 400, freqEnd: 100, gain: 0.2, dest: d });
  },
  cheer(a, d) {
    for (let i = 0; i < 6; i++) a.noiseBurst({ t: i * 0.06, dur: 0.25, type: 'bandpass', freq: 900 + Math.random() * 800, q: 4, gain: 0.12, dest: d });
    a.tone({ dur: 0.15, type: 'triangle', freq: 660, gain: 0.08, dest: d });
    a.tone({ t: 0.12, dur: 0.2, type: 'triangle', freq: 880, gain: 0.08, dest: d });
  },
  scream(a, d) {
    a.tone({ dur: 0.5, type: 'sawtooth', freq: 900, freqEnd: 600, gain: 0.05, dest: d });
  },
  // a car driving past: engine hum and tyre noise that swell up and fade away
  carPass(a, d) {
    const ctx = a.ctx;
    const at = ctx.currentTime;
    const dur = 2.6;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70 + Math.random() * 30, at);
    o.frequency.linearRampToValueAtTime(55 + Math.random() * 20, at + dur); // slight doppler drop
    const of = ctx.createBiquadFilter();
    of.type = 'lowpass';
    of.frequency.value = 260;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.09, at + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(of).connect(g).connect(d);
    o.start(at);
    o.stop(at + dur + 0.05);
    a.noiseBurst({ dur, type: 'bandpass', freq: 600, q: 0.6, gain: 0.05, attack: dur * 0.45, dest: d });
  },
  // Granite's thunder clap: a sharp crack over a deep boom
  clap(a, d) {
    a.noiseBurst({ dur: 0.12, type: 'highpass', freq: 1800, gain: 0.5, attack: 0.002, dest: d });
    a.tone({ dur: 0.5, freq: 80, freqEnd: 32, gain: 0.7, dest: d });
    a.noiseBurst({ t: 0.02, dur: 0.6, type: 'lowpass', freq: 700, freqEnd: 90, gain: 0.45, dest: d });
  },
  // superhero landing: a solid but short thump with a little grit
  land(a, d) {
    a.tone({ dur: 0.32, freq: 95, freqEnd: 38, gain: 0.55, dest: d });
    a.noiseBurst({ dur: 0.28, type: 'lowpass', freq: 900, freqEnd: 120, gain: 0.3, dest: d });
    a.noiseBurst({ t: 0.04, dur: 0.18, type: 'bandpass', freq: 2400, q: 1.2, gain: 0.06, dest: d });
  },
  horn(a, d) {
    a.tone({ dur: 0.3, type: 'square', freq: 392, gain: 0.08, dest: d });
    a.tone({ dur: 0.3, type: 'square', freq: 494, gain: 0.06, dest: d });
  },
  meow(a, d) {
    a.tone({ dur: 0.35, type: 'triangle', freq: 700, freqEnd: 1100, gain: 0.08, attack: 0.05, dest: d });
  },
  ring(a, d) {
    a.tone({ dur: 0.2, type: 'triangle', freq: 880, gain: 0.15, dest: d });
    a.tone({ t: 0.08, dur: 0.3, type: 'triangle', freq: 1318, gain: 0.15, dest: d });
  },
  objective(a, d) {
    [0, 4, 7, 12].forEach((n, i) => a.tone({ t: i * 0.07, dur: 0.18, type: 'square', freq: 523 * Math.pow(2, n / 12), gain: 0.07, dest: d }));
  },
  alert(a, d) {
    a.tone({ dur: 0.15, type: 'square', freq: 988, gain: 0.08, dest: d });
    a.tone({ t: 0.18, dur: 0.15, type: 'square', freq: 784, gain: 0.08, dest: d });
  },
  click(a, d) {
    a.tone({ dur: 0.05, type: 'square', freq: 660, gain: 0.06, dest: d });
  },
  stomp(a, d) {
    a.tone({ dur: 0.5, freq: 60, freqEnd: 25, gain: 1, dest: d });
    a.noiseBurst({ dur: 0.5, type: 'lowpass', freq: 600, freqEnd: 80, gain: 0.7, dest: d });
  },
  shieldHit(a, d) {
    a.tone({ dur: 0.2, type: 'sine', freq: 600, freqEnd: 900, gain: 0.15, dest: d });
  },
};
