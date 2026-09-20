import { describe, expect, it, vi } from 'vitest';

import { GameLoop, type LoopDriver, STEP_MS } from './GameLoop';

describe('GameLoop', () => {
  it('steps by the accumulator and caps steps per frame', () => {
    const step = vi.fn(() => true);
    const present = vi.fn();
    const loop = new GameLoop(step, present);
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
    };
    const step = vi.fn(() => true);
    const loop = new GameLoop(step, () => undefined, driver);
    loop.start();
    frame(1000);
    expect(step).toHaveBeenCalledTimes(0);
    frame(1000 + STEP_MS);
    expect(step).toHaveBeenCalledTimes(1);
  });

  it('halts when a step fails', () => {
    const step = vi.fn(() => false);
    const loop = new GameLoop(step, () => undefined);
    expect(loop.tick(STEP_MS * 4)).toBe(false);
    expect(step).toHaveBeenCalledTimes(1);
  });
});
