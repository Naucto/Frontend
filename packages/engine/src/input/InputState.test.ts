import { describe, expect, it } from 'vitest';

import { GamepadSource } from './GamepadSource';
import { InputState } from './InputState';

const padWith = (...pressed: number[]): Gamepad =>
  ({
    index: 0,
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: pressed.includes(i),
      touched: false,
      value: 0,
    })),
    axes: [0, 0, 0, 0],
  }) as unknown as Gamepad;

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

  it('holds a key and a pad button at once', () => {
    const src = new GamepadSource({ getGamepads: () => [padWith(15)] });
    const s = new InputState();
    s.setAction(0, 'a', true);
    src.poll(s);
    s.commit();
    expect(s.btn('a')).toBe(true);
    expect(s.btn('right')).toBe(true);
  });

  it('lets a key go without lifting the pad', () => {
    const src = new GamepadSource({ getGamepads: () => [padWith(15)] });
    const s = new InputState();
    s.setAction(0, 'a', true);
    src.poll(s);
    s.commit();
    s.setAction(0, 'a', false);
    s.commit();
    expect(s.btn('a')).toBe(false);
    expect(s.btn('right')).toBe(true);
    s.clearActions(0);
    s.commit();
    expect(s.btn('right')).toBe(true);
  });

  it('lets a pad go without lifting the key', () => {
    let pads: Gamepad[] = [padWith(15)];
    const src = new GamepadSource({ getGamepads: () => pads });
    const s = new InputState();
    s.setAction(0, 'a', true);
    src.poll(s);
    s.commit();
    pads = [padWith()];
    src.poll(s);
    s.commit();
    expect(s.btn('right')).toBe(false);
    expect(s.btn('a')).toBe(true);
    pads = [];
    s.setAction(0, 'b', true);
    src.poll(s);
    s.commit();
    expect(s.btn('a')).toBe(true);
    expect(s.btn('b')).toBe(true);
    expect(s.btn('right')).toBe(false);
  });
});
