// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import type { ActionDraft } from './actions';
import { GamepadSource } from './GamepadSource';
import { InputState } from './InputState';
import { KeyboardSource } from './KeyboardSource';
import { INPUT_PRESETS } from './presets';
import { tableOf } from './test-table';
import { TouchSource } from './TouchSource';

const stateOf = (drafts?: readonly ActionDraft[]): InputState => {
  const state = new InputState();
  state.setActions(tableOf(drafts));

  return state;
};

const key = (type: 'keydown' | 'keyup', name: string): void => {
  window.dispatchEvent(new KeyboardEvent(type, { key: name }));
};

const padWith = (buttons: number[], axes: number[] = [0, 0, 0, 0]): Gamepad =>
  ({
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i) })),
    axes,
  }) as unknown as Gamepad;

describe('KeyboardSource', () => {
  const source = new KeyboardSource();
  afterEach(() => {
    source.detach();
  });

  it('presses the actions the game plugs a key into, for the player it is plugged for', () => {
    const state = stateOf(INPUT_PRESETS['two-players']);
    source.attach(null, state);

    key('keydown', 'd');
    key('keydown', 'ArrowLeft');
    state.commit();
    expect([state.btn('right', 0), state.btn('right', 1)]).toEqual([true, false]);
    expect([state.btn('left', 0), state.btn('left', 1)]).toEqual([false, true]);

    key('keyup', 'd');
    state.commit();
    expect(state.btnr('right', 0)).toBe(true);
    expect(state.btn('left', 1)).toBe(true);
  });

  it('takes a letter whatever its case, and still reports the raw key as typed', () => {
    const state = stateOf();
    source.attach(null, state);

    key('keydown', 'A');
    state.commit();
    expect(state.btn('left')).toBe(true);
    expect([state.keyPressed('A'), state.keyPressed('a')]).toEqual([true, false]);

    key('keyup', 'a');
    state.commit();
    expect(state.btn('left')).toBe(false);
  });

  it('presses nothing for a key no action holds, or for an action the game dropped', () => {
    const state = stateOf();
    source.attach(null, state);
    key('keydown', 'F9');
    state.commit();
    expect(INPUT_PRESETS.classic.some((draft) => state.btn(draft.name))).toBe(false);

    state.setActions(tableOf(INPUT_PRESETS.platformer));
    key('keydown', ' ');
    key('keydown', 'ArrowLeft');
    state.commit();
    expect([state.btn('jump'), state.btn('move_left'), state.btn('a'), state.btn('left')]).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('lets everything go when the window loses focus', () => {
    const state = stateOf();
    source.attach(null, state);
    key('keydown', 'ArrowUp');
    key('keydown', 'k');
    state.commit();
    expect([state.btn('up', 0), state.btn('down', 1)]).toEqual([true, true]);

    window.dispatchEvent(new Event('blur'));
    state.commit();
    expect([state.btn('up', 0), state.btn('down', 1)]).toEqual([false, false]);
  });
});

describe('GamepadSource', () => {
  it('reads every control of the standard mapping an action is plugged into', () => {
    const state = stateOf([
      { name: 'strafe', label: '', description: '', inputs: [{ kind: 'pad', control: 'lb' }] },
      { name: 'aim', label: '', description: '', inputs: [{ kind: 'pad', control: 'rb' }] },
      { name: 'map', label: '', description: '', inputs: [{ kind: 'pad', control: 'select' }] },
      { name: 'menu', label: '', description: '', inputs: [{ kind: 'pad', control: 'start' }] },
      { name: 'climb', label: '', description: '', inputs: [{ kind: 'pad', control: 'stick-up' }] },
      { name: 'duck', label: '', description: '', inputs: [{ kind: 'pad', control: 'dpad-down' }] },
    ]);
    let pad = padWith([4, 8], [0, -0.8]);
    const source = new GamepadSource({ getGamepads: () => [pad] });

    source.poll(state);
    state.commit();
    expect(
      ['strafe', 'aim', 'map', 'menu', 'climb', 'duck'].map((name) => state.btn(name)),
    ).toEqual([true, false, true, false, true, false]);

    pad = padWith([5, 9, 13], [0, -0.2]);
    source.poll(state);
    state.commit();
    expect(
      ['strafe', 'aim', 'map', 'menu', 'climb', 'duck'].map((name) => state.btn(name)),
    ).toEqual([false, true, false, true, false, true]);
  });

  it('drives one player per pad with the same controls, and follows an assignment', () => {
    const state = stateOf(INPUT_PRESETS.platformer);
    const source = new GamepadSource({ getGamepads: () => [padWith([]), padWith([0])] });

    source.poll(state);
    state.commit();
    expect([state.btn('jump', 0), state.btn('jump', 1)]).toEqual([false, true]);
    expect(state.connectedPlayers).toBe(2);

    source.assign(1, 3);
    source.poll(state);
    state.commit();
    expect([state.btn('jump', 1), state.btn('jump', 3)]).toEqual([false, true]);
  });
});

describe('TouchSource', () => {
  const root = document.createElement('div');
  const controls = new Map<string, HTMLElement>();
  for (const name of ['dpad-left', 'a', 'start']) {
    const button = document.createElement('button');
    button.dataset.ncControl = name;
    controls.set(name, button);
    root.append(button);
  }
  document.body.append(root);
  const source = new TouchSource(root);
  afterEach(() => {
    source.detach();
  });

  /** jsdom lays nothing out, so the element under a pointer is the one the test names. */
  const touch = (type: string, pointerId: number, over: string | null): void => {
    document.elementFromPoint = () => (over === null ? null : (controls.get(over) ?? null));
    const event = new MouseEvent(type, { bubbles: true });
    Object.defineProperty(event, 'pointerId', { value: pointerId });
    root.dispatchEvent(event);
  };

  it('presses gamepad controls for player 1, the cross as the left stick too', () => {
    const state = stateOf([
      {
        name: 'steer',
        label: '',
        description: '',
        inputs: [{ kind: 'pad', control: 'stick-left' }],
      },
      { name: 'jump', label: '', description: '', inputs: [{ kind: 'pad', control: 'a' }] },
    ]);
    source.attach(null, state);

    touch('pointerdown', 1, 'dpad-left');
    state.commit();
    expect([state.btn('steer'), state.btn('jump'), state.btn('steer', 1)]).toEqual([
      true,
      false,
      false,
    ]);

    touch('pointermove', 1, 'a');
    state.commit();
    expect([state.btn('steer'), state.btn('jump')]).toEqual([false, true]);

    touch('pointerup', 1, null);
    state.commit();
    expect(state.btn('jump')).toBe(false);
  });

  it('presses nothing for a control no action is plugged into', () => {
    const state = stateOf(INPUT_PRESETS.platformer);
    source.attach(null, state);
    touch('pointerdown', 1, 'start');
    state.commit();
    expect(state.btn('pause')).toBe(true);

    state.setActions(tableOf([{ name: 'jump', label: '', description: '', inputs: [] }]));
    touch('pointerup', 1, null);
    touch('pointerdown', 1, 'a');
    state.commit();
    expect(state.btn('jump')).toBe(false);
  });
});
