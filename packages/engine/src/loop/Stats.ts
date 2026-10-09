/** Rolling frame statistics for the PERF panel. */
export class Stats {
  frame = 0;
  fps = 0;
  /** One update and one draw, as a share of one fixed step: past 1, the game cannot keep 60 Hz. */
  cpu = 0;
  private readonly samples: number[] = [];
  private lastPresent = 0;
  private lastUpdate = 0;

  recordUpdate(ms: number): void {
    this.lastUpdate = ms;
  }

  recordDraw(ms: number): void {
    this.cpu = (this.lastUpdate + ms) / (1000 / 60);
  }

  recordPresent(now: number): void {
    if (this.lastPresent > 0) {
      const dt = now - this.lastPresent;
      if (dt > 0) {
        this.samples.push(1000 / dt);
        if (this.samples.length > 60) {
          this.samples.shift();
        }
        this.fps = this.samples.reduce((sum, sample) => sum + sample, 0) / this.samples.length;
      }
    }
    this.lastPresent = now;
  }

  reset(): void {
    this.frame = 0;
    this.fps = 0;
    this.cpu = 0;
    this.lastUpdate = 0;
    this.samples.length = 0;
    this.lastPresent = 0;
  }
}
