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
    const state = new InputState();
    state.setAction(0, 'a', true);
    state.commit();
    expect(state.btn('a')).toBe(true);
    expect(state.btnp('a')).toBe(true);
    state.commit();
    expect(state.btnp('a')).toBe(false);
    state.setAction(0, 'a', false);
    state.commit();
    expect(state.btnr('a')).toBe(true);
    expect(state.btn('a')).toBe(false);
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
    const state = new InputState();
    src.poll(state);
    state.commit();
    expect(state.btn('a')).toBe(true);
    expect(state.btn('left')).toBe(true);
    expect(state.btn('up')).toBe(false);
    expect(state.connectedPlayers).toBe(1);
    // releasing the pad clears its bits next step
    src.poll(state);
    (pad.buttons[0] as { pressed: boolean }).pressed = false;
    src.poll(state);
    state.commit();
    expect(state.btn('a')).toBe(false);
  });

  it('holds a key and a pad button at once', () => {
    const src = new GamepadSource({ getGamepads: () => [padWith(15)] });
    const state = new InputState();
    state.setAction(0, 'a', true);
    src.poll(state);
    state.commit();
    expect(state.btn('a')).toBe(true);
    expect(state.btn('right')).toBe(true);
  });

  it('lets a key go without lifting the pad', () => {
    const src = new GamepadSource({ getGamepads: () => [padWith(15)] });
    const state = new InputState();
    state.setAction(0, 'a', true);
    src.poll(state);
    state.commit();
    state.setAction(0, 'a', false);
    state.commit();
    expect(state.btn('a')).toBe(false);
    expect(state.btn('right')).toBe(true);
    state.clearActions(0);
    state.commit();
    expect(state.btn('right')).toBe(true);
  });

  it('lets a pad go without lifting the key', () => {
    let pads: Gamepad[] = [padWith(15)];
    const src = new GamepadSource({ getGamepads: () => pads });
    const state = new InputState();
    state.setAction(0, 'a', true);
    src.poll(state);
    state.commit();
    pads = [padWith()];
    src.poll(state);
    state.commit();
    expect(state.btn('right')).toBe(false);
    expect(state.btn('a')).toBe(true);
    pads = [];
    state.setAction(0, 'b', true);
    src.poll(state);
    state.commit();
    expect(state.btn('a')).toBe(true);
    expect(state.btn('b')).toBe(true);
    expect(state.btn('right')).toBe(false);
  });
});
