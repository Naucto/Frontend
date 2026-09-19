import { describe, expect, it } from 'vitest';

import { GamepadSource } from './GamepadSource';
import { InputState } from './InputState';

describe('InputState', () => {
  it('produces per-step edges', () => {
    const s = new InputState();
    s.setAction(0, 'a', true);
    s.commit();
    expect(s.btn('a')).toBe(true);
    expect(s.btnp('a')).toBe(true);
    s.commit();
    expect(s.btnp('a')).toBe(false);
    s.setAction(0, 'a', false);
    s.commit();
    expect(s.btnr('a')).toBe(true);
    expect(s.btn('a')).toBe(false);
  });

  it('merges a gamepad into player slots with deadzone', () => {
    const pad = {
      index: 0,
      buttons: Array.from({ length: 17 }, (_, i) => ({
        pressed: i === 0,
        touched: false,
        value: 0,
      })),
      axes: [-0.9, 0.1, 0, 0],
    } as unknown as Gamepad;
    const src = new GamepadSource({ getGamepads: () => [pad, null] });
    const s = new InputState();
    src.poll(s);
    s.commit();
    expect(s.btn('a')).toBe(true);
    expect(s.btn('left')).toBe(true);
    expect(s.btn('up')).toBe(false);
    expect(s.connectedPlayers).toBe(1);
    // releasing the pad clears its bits next step
    src.poll(s);
    (pad.buttons[0] as { pressed: boolean }).pressed = false;
    src.poll(s);
    s.commit();
    expect(s.btn('a')).toBe(false);
  });
});
