import { describe, expect, it } from 'vitest';

import { GamepadSource } from './GamepadSource';
import { InputState } from './InputState';
import { tableOf } from './test-table';

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

/** A state reading the classic actions, and a way to press one by name as an event source does. */
function classicState(): { state: InputState; press: (name: string, down: boolean) => void } {
  const state = new InputState();
  state.setActions(tableOf());

  return {
    state,
    press: (name, down) => {
      state.press(0, state.actions.bits.get(name) ?? 0, down);
    },
  };
}

describe('InputState', () => {
  it('produces per-step edges', () => {
    const { state, press } = classicState();
    press('a', true);
    state.commit();
    expect(state.btn('a')).toBe(true);
    expect(state.btnp('a')).toBe(true);
    state.commit();
    expect(state.btnp('a')).toBe(false);
    press('a', false);
    state.commit();
    expect(state.btnr('a')).toBe(true);
    expect(state.btn('a')).toBe(false);
  });

  it('answers false for a name the game does not have, without a table or with one', () => {
    const bare = new InputState();
    bare.press(0, 0xffffffff, true);
    bare.commit();
    expect(bare.btn('a')).toBe(false);

    const { state, press } = classicState();
    press('a', true);
    state.commit();
    expect([state.btn('jump'), state.btnp('jump'), state.btnr('jump')]).toEqual([
      false,
      false,
      false,
    ]);
  });

  it('lets go of what is held when the game changes its actions', () => {
    const { state, press } = classicState();
    press('left', true);
    state.setPolled(0, state.actions.bits.get('a') ?? 0);
    state.commit();
    expect(state.btn('left')).toBe(true);

    state.setActions(tableOf([{ name: 'jump', label: '', description: '', inputs: [] }]));
    state.commit();
    expect(state.btn('jump')).toBe(false);
    expect(state.btnr('jump')).toBe(false);
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
    const { state } = classicState();
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
    const { state, press } = classicState();
    press('a', true);
    src.poll(state);
    state.commit();
    expect(state.btn('a')).toBe(true);
    expect(state.btn('right')).toBe(true);
  });

  it('lets a key go without lifting the pad', () => {
    const src = new GamepadSource({ getGamepads: () => [padWith(15)] });
    const { state, press } = classicState();
    press('a', true);
    src.poll(state);
    state.commit();
    press('a', false);
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
    const { state, press } = classicState();
    press('a', true);
    src.poll(state);
    state.commit();
    pads = [padWith()];
    src.poll(state);
    state.commit();
    expect(state.btn('right')).toBe(false);
    expect(state.btn('a')).toBe(true);
    pads = [];
    press('b', true);
    src.poll(state);
    state.commit();
    expect(state.btn('a')).toBe(true);
    expect(state.btn('b')).toBe(true);
    expect(state.btn('right')).toBe(false);
  });
});
