import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BindingCaptureService } from './binding-capture.service';

const press = (key: string): void => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }));
};

const padHolding = (buttons: number[], axes: number[] = [0, 0, 0, 0]): Gamepad =>
  ({
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i) })),
    axes,
  }) as unknown as Gamepad;

describe('BindingCaptureService', () => {
  let capture: BindingCaptureService;
  let pads: (Gamepad | null)[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    pads = [];
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => pads });
    TestBed.configureTestingModule({ providers: [BindingCaptureService] });
    capture = TestBed.inject(BindingCaptureService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('answers the key pressed, for the first player and whatever its case', async () => {
    const heard = capture.listen();
    expect(capture.listening()).toBe(true);
    press('W');

    expect(await heard).toEqual({ kind: 'key', player: 0, key: 'w' });
    expect(capture.listening()).toBe(false);
  });

  it('answers the gamepad control held, when that comes first', async () => {
    const heard = capture.listen();
    pads = [null, padHolding([5])];
    vi.advanceTimersByTime(150);

    expect(await heard).toEqual({ kind: 'pad', control: 'rb' });

    const stick = capture.listen();
    pads = [padHolding([], [0.4, -0.9])];
    vi.advanceTimersByTime(150);
    expect(await stick).toEqual({ kind: 'pad', control: 'stick-up' });
  });

  it('takes no control the standard set does not name, and no stick resting off-centre', async () => {
    const heard = capture.listen();
    pads = [padHolding([6, 7, 10, 11, 16], [0.4, 0.4, 1, 1])];
    vi.advanceTimersByTime(600);
    expect(capture.listening()).toBe(true);

    press('Enter');
    expect(await heard).toEqual({ kind: 'key', player: 0, key: 'Enter' });
  });

  it('backs out on Escape, and hears nothing once it has answered', async () => {
    const heard = capture.listen();
    press('Escape');
    expect(await heard).toBeNull();

    const typed = new KeyboardEvent('keydown', { key: 'a', cancelable: true });
    window.dispatchEvent(typed);
    expect(typed.defaultPrevented).toBe(false);
  });

  it('ends a capture a second one replaces', async () => {
    const first = capture.listen();
    const second = capture.listen();
    press('x');

    expect(await first).toBeNull();
    expect(await second).toEqual({ kind: 'key', player: 0, key: 'x' });
  });
});
