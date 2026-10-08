import type { AnalyticsPlayDto } from '@naucto/api-client';
import type { EngineState } from '@naucto/engine';

export type PlayEndReason = NonNullable<AnalyticsPlayDto['endReason']>;

/** Running time of one play: it advances only while the engine runs. */
export class PlayClock {
  private accumulated = 0;
  private since: number | null = null;

  constructor(private readonly now: () => number) {}

  get activeMs(): number {
    return this.accumulated + (this.since === null ? 0 : this.now() - this.since);
  }

  run(): void {
    this.since ??= this.now();
  }

  hold(): void {
    if (this.since !== null) {
      this.accumulated += this.now() - this.since;
      this.since = null;
    }
  }
}

export interface PlayTrackerEvents {
  started(clock: PlayClock): void;
  ended(reason: PlayEndReason): void;
}

/**
 * Turns engine states into plays. A play starts the first time the engine runs after being idle,
 * so a restart is a new play; pausing, which a hidden tab does too, only stops its clock. Stopping
 * or halting on an error ends it.
 */
export class PlayTracker {
  private clock: PlayClock | null = null;

  constructor(
    private readonly now: () => number,
    private readonly events: PlayTrackerEvents,
  ) {}

  get playing(): boolean {
    return this.clock !== null;
  }

  onState(state: EngineState): void {
    switch (state) {
      case 'running':
        if (!this.clock) {
          this.clock = new PlayClock(this.now);
          this.clock.run();
          this.events.started(this.clock);
        } else {
          this.clock.run();
        }
        return;
      case 'paused':
        this.clock?.hold();
        return;
      case 'halted':
        this.end('halted');
        return;
      case 'idle':
        this.end('stopped');
        return;
    }
  }

  end(reason: PlayEndReason): void {
    if (!this.clock) {
      return;
    }
    this.clock.hold();
    this.clock = null;
    this.events.ended(reason);
  }
}
