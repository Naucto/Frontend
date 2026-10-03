export const STEP_MS = 1000 / 60;
const MAX_FRAME_MS = 250;
const MAX_STEPS_PER_FRAME = 5;

export interface LoopDriver {
  request(cb: (now: number) => void): number;
  cancel(handle: number): void;
}

const rafDriver: LoopDriver = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (handle) => {
    cancelAnimationFrame(handle);
  },
};

/**
 * Fixed 60 Hz step on top of requestAnimationFrame with an accumulator. Steps are
 * capped per frame so a background tab never spirals; `tick()` is public so tests
 * can drive it without a browser.
 */
export class GameLoop {
  private handle = 0;
  private running = false;
  /** Timestamp of the previous frame; negative until one has been seen. */
  private last = -1;
  private acc = 0;

  constructor(
    private readonly step: () => boolean,
    private readonly present: () => void,
    private readonly driver: LoopDriver = rafDriver,
  ) {}

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    // The clock starts at the first frame the driver hands over: time spent before it is not game
    // time, and charging it would open on a burst of catch-up steps.
    this.last = -1;
    this.acc = 0;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.handle) {
      this.driver.cancel(this.handle);
    }
    this.handle = 0;
  }

  /** Runs exactly one step and presents it, whatever the accumulator holds. */
  stepOnce(): boolean {
    const ok = this.step();
    this.present();
    return ok;
  }

  /** Advance by `elapsedMs`; returns false if a step failed (loop halts). */
  tick(elapsedMs: number): boolean {
    this.acc += Math.min(elapsedMs, MAX_FRAME_MS);
    let steps = 0;
    let ok = true;
    while (this.acc >= STEP_MS - 1e-6 && steps < MAX_STEPS_PER_FRAME) {
      ok = this.step();
      this.acc -= STEP_MS;
      steps++;
      if (!ok) {
        break;
      }
    }
    if (steps >= MAX_STEPS_PER_FRAME) {
      this.acc = 0;
    }
    if (steps > 0) {
      this.present();
    }
    return ok;
  }

  private schedule(): void {
    this.handle = this.driver.request((now) => {
      if (!this.running) {
        return;
      }
      const elapsed = this.last < 0 ? 0 : now - this.last;
      this.last = now;
      if (!this.tick(elapsed)) {
        this.stop();
        return;
      }
      this.schedule();
    });
  }
}
