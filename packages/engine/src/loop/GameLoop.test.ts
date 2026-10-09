import { describe, expect, it, vi } from 'vitest';

import { GameLoop, type LoopDriver, STEP_MS } from './GameLoop';

const clocked = (now: () => number = () => 0): LoopDriver => ({
  request: () => 0,
  cancel: () => undefined,
  now,
});

describe('GameLoop', () => {
  it('steps by the accumulator and caps steps per frame', () => {
    const step = vi.fn(() => true);
    const present = vi.fn(() => true);
    const loop = new GameLoop(step, present, clocked());
    expect(loop.tick(STEP_MS / 2)).toBe(true);
    expect(step).toHaveBeenCalledTimes(0);
    loop.tick(STEP_MS / 2 + 0.01);
    expect(step).toHaveBeenCalledTimes(1);
    expect(present).toHaveBeenCalledTimes(1);
    loop.tick(STEP_MS * 3);
    expect(step).toHaveBeenCalledTimes(4);
    loop.tick(10_000);
    expect(step).toHaveBeenCalledTimes(9);
  });

  it('times frames from the first frame, not from start()', () => {
    let frame: (now: number) => void = () => undefined;
    const driver: LoopDriver = {
      request: (cb) => {
        frame = cb;
        return 1;
      },
      cancel: () => undefined,
      now: () => 0,
    };
    const step = vi.fn(() => true);
    const loop = new GameLoop(step, () => true, driver);
    loop.start();
    frame(1000);
    expect(step).toHaveBeenCalledTimes(0);
    frame(1000 + STEP_MS);
    expect(step).toHaveBeenCalledTimes(1);
  });

  it('runs one step per frame, not a burst, when every step is over budget', () => {
    let now = 0;
    const step = vi.fn(() => {
      now += 20;
      return true;
    });
    const present = vi.fn(() => true);
    const loop = new GameLoop(
      step,
      present,
      clocked(() => now),
    );
    // Each frame arrives as late as the last one's work made it.
    let last = now;
    for (let frame = 0; frame < 60; frame++) {
      const before = step.mock.calls.length;
      loop.tick(now - last + STEP_MS);
      last = now;
      expect(step.mock.calls.length - before).toBe(1);
    }
    expect(present).toHaveBeenCalledTimes(60);
  });

  it('still catches up when two steps fit in a frame', () => {
    let now = 0;
    const step = vi.fn(() => {
      now += 5;
      return true;
    });
    const loop = new GameLoop(
      step,
      () => true,
      clocked(() => now),
    );
    loop.tick(STEP_MS * 3);
    expect(step).toHaveBeenCalledTimes(3);
  });

  it('keeps the part of a step when it drops a backlog', () => {
    let now = 0;
    const step = vi.fn(() => {
      now += 20;
      return true;
    });
    const loop = new GameLoop(
      step,
      () => true,
      clocked(() => now),
    );
    loop.tick(STEP_MS * 2.5);
    expect(step).toHaveBeenCalledTimes(1);
    loop.tick(STEP_MS / 4);
    expect(step).toHaveBeenCalledTimes(1);
    loop.tick(STEP_MS / 4);
    expect(step).toHaveBeenCalledTimes(2);
  });

  it('catches up when the steps save enough to pay for the present', () => {
    let now = 0;
    const step = vi.fn(() => {
      now += 10;
      return true;
    });
    const present = (): boolean => {
      now += 10;
      return true;
    };
    const loop = new GameLoop(
      step,
      present,
      clocked(() => now),
    );
    loop.tick(STEP_MS);
    loop.tick(STEP_MS * 2);
    expect(step).toHaveBeenCalledTimes(3);
  });

  it('drops the backlog when no frame of catch-up could pay for its present', () => {
    let now = 0;
    const step = vi.fn(() => {
      now += 15;
      return true;
    });
    const present = (): boolean => {
      now += 10;
      return true;
    };
    const loop = new GameLoop(
      step,
      present,
      clocked(() => now),
    );
    loop.tick(STEP_MS);
    loop.tick(STEP_MS * 3);
    expect(step).toHaveBeenCalledTimes(2);
    loop.tick(STEP_MS / 2);
    expect(step).toHaveBeenCalledTimes(2);
  });

  it('halts when a step fails', () => {
    const step = vi.fn(() => false);
    const loop = new GameLoop(step, () => true, clocked());
    expect(loop.tick(STEP_MS * 4)).toBe(false);
    expect(step).toHaveBeenCalledTimes(1);
  });
});
