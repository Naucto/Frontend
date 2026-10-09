export const STEP_MS = 1000 / 60;
const MAX_FRAME_MS = 250;
const MAX_STEPS_PER_FRAME = 5;
const STEP_EPSILON = 1e-6;

export interface LoopDriver {
  request(cb: (now: number) => void): number;
  cancel(handle: number): void;
  now(): number;
}

const rafDriver: LoopDriver = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (handle) => {
    cancelAnimationFrame(handle);
  },
  now: () => performance.now(),
};

/**
 * Fixed 60 Hz step on top of requestAnimationFrame with an accumulator. A frame runs as many steps as
 * the time owed, then presents once, so a frame that falls behind catches up on steps without
 * drawing the frames nobody would see. Catch-up is capped per frame, by count and by what the steps
 * cost, so neither a background tab nor a game heavier than its budget spirals; `tick()` is public so
 * tests can drive it without a browser.
 */
export class GameLoop {
  private handle = 0;
  private running = false;
  /** Timestamp of the previous frame; negative until one has been seen. */
  private last = -1;
  private acc = 0;
  private presentMs = 0;

  constructor(
    private readonly step: () => boolean,
    /** Draws and shows the frame; false when that failed and the loop must halt. */
    private readonly present: () => boolean,
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
    this.presentMs = 0;
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
    return this.step() && this.present();
  }

  /** Advance by `elapsedMs`; returns false if a step failed (loop halts). */
  tick(elapsedMs: number): boolean {
    this.acc += Math.min(elapsedMs, MAX_FRAME_MS);
    let steps = 0;
    let ok = true;
    const started = this.driver.now();
    let overBudget = false;
    while (this.acc >= STEP_MS - STEP_EPSILON && steps < MAX_STEPS_PER_FRAME && !overBudget) {
      ok = this.step();
      this.acc -= STEP_MS;
      steps++;
      if (!ok) {
        break;
      }
      const stepMs = (this.driver.now() - started) / steps;
      overBudget = MAX_STEPS_PER_FRAME * (STEP_MS - stepMs) <= this.presentMs;
    }
    if (steps >= MAX_STEPS_PER_FRAME) {
      this.acc = 0;
    } else if (overBudget) {
      // The whole steps this frame had no time for are dropped rather than carried: carried, they
      // are the next frame's burst of catch-up, and the one after's. The part of a step is kept.
      this.acc %= STEP_MS;
      if (this.acc >= STEP_MS - STEP_EPSILON) {
        this.acc = 0;
      }
    }
    if (steps > 0 && ok) {
      const presenting = this.driver.now();
      ok = this.present();
      this.presentMs = this.driver.now() - presenting;
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
