// requestAnimationFrame loop with a clamped delta and an FPS counter.
export class Loop {
  constructor(onFrame) {
    this.onFrame = onFrame;
    this.last = 0;
    this.fps = 0;
    this.frames = 0;
    this.fpsTime = 0;
    this.tick = this.tick.bind(this);
  }

  start() {
    this.last = performance.now();
    requestAnimationFrame(this.tick);
  }

  tick(now) {
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.frames / this.fpsTime);
      this.frames = 0;
      this.fpsTime = 0;
    }
    this.onFrame(dt);
    requestAnimationFrame(this.tick);
  }
}
