import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlayEndReason } from './play-tracker';
import { PlayClock, PlayTracker } from './play-tracker';

describe('PlayClock', () => {
  it('advances only while running', () => {
    let now = 1_000;
    const clock = new PlayClock(() => now);

    clock.run();
    now += 500;
    expect(clock.activeMs).toBe(500);

    clock.hold();
    now += 10_000;
    expect(clock.activeMs).toBe(500);

    clock.run();
    clock.run();
    now += 250;
    expect(clock.activeMs).toBe(750);
  });
});

describe('PlayTracker', () => {
  let now: number;
  let started: PlayClock[];
  let ended: PlayEndReason[];
  let tracker: PlayTracker;

  beforeEach(() => {
    now = 0;
    started = [];
    ended = [];
    tracker = new PlayTracker(() => now, {
      started: (clock) => started.push(clock),
      ended: (reason) => ended.push(reason),
    });
  });

  it('starts a play the first time the engine runs', () => {
    tracker.onState('idle');
    expect(started).toHaveLength(0);

    tracker.onState('running');
    expect(started).toHaveLength(1);
    expect(tracker.playing).toBe(true);
  });

  it('keeps one play across pauses, counting only running time', () => {
    tracker.onState('running');
    now = 1_000;
    tracker.onState('paused');
    now = 61_000;
    tracker.onState('running');
    now = 62_000;

    expect(started).toHaveLength(1);
    expect(started[0]?.activeMs).toBe(2_000);
  });

  it('counts a restart as a new play', () => {
    tracker.onState('running');
    tracker.onState('idle');
    tracker.onState('running');

    expect(started).toHaveLength(2);
    expect(ended).toEqual(['stopped']);
  });

  it('ends a play halted on an error, once', () => {
    tracker.onState('running');
    tracker.onState('halted');
    tracker.onState('idle');

    expect(ended).toEqual(['halted']);
  });

  it('ends a play from outside, freezing its clock', () => {
    const stop = vi.fn();
    tracker = new PlayTracker(() => now, { started: (clock) => started.push(clock), ended: stop });
    tracker.onState('running');
    now = 3_000;

    tracker.end('leave');
    now = 9_000;
    tracker.end('leave');

    expect(stop).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledWith('leave');
    expect(started[0]?.activeMs).toBe(3_000);
  });
});
