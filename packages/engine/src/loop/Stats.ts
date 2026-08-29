/** Rolling frame statistics for the PERF panel. */
export class Stats {
  frame = 0;
  fps = 0;
  /** Step time as a share of the 16.67 ms budget, 0..∞ */
  cpu = 0;
  stepMs = 0;
  private readonly samples: number[] = [];
  private lastPresent = 0;

  recordStep(ms: number): void {
    this.stepMs = ms;
    this.cpu = ms / (1000 / 60);
  }

  recordPresent(now: number): void {
    if (this.lastPresent > 0) {
      const dt = now - this.lastPresent;
      if (dt > 0) {
        this.samples.push(1000 / dt);
        if (this.samples.length > 60) this.samples.shift();
        this.fps = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
      }
    }
    this.lastPresent = now;
  }

  reset(): void {
    this.frame = 0;
    this.fps = 0;
    this.cpu = 0;
    this.stepMs = 0;
    this.samples.length = 0;
    this.lastPresent = 0;
  }
}
