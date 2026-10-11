// Synthesised sound effects with the Web Audio API (no audio files).
// The context starts on the first user gesture, as browsers require.

export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.noise = null;
  }

  /** Call from a click/keypress handler. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      // shared white-noise buffer
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get ready() {
    return this.ctx && this.ctx.state === 'running';
  }

  sonicBoom() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.master.gain.value = this.settings.volume;

    // sharp crack
    const crack = ctx.createBufferSource();
    crack.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.9, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    crack.connect(hp).connect(cg).connect(this.master);
    crack.start(t);
    crack.stop(t + 0.2);

    // rolling boom
    const boom = ctx.createBufferSource();
    boom.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(70, t + 1.4);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(1.0, t + 0.02);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    boom.connect(lp).connect(bg).connect(this.master);
    boom.start(t);
    boom.stop(t + 1.7);

    // low thump
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.6);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.8, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    osc.connect(og).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.75);
  }
}
