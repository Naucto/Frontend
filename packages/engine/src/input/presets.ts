import type { ActionDraft, ActionInput, KeyboardPlayer, PadControl } from './actions';

const keys = (player: KeyboardPlayer, ...names: string[]): ActionInput[] =>
  names.map((key) => ({ kind: 'key', player, key }));

const pad = (...controls: PadControl[]): ActionInput[] =>
  controls.map((control) => ({ kind: 'pad', control }));

const action = (
  name: string,
  label: string,
  description: string,
  ...inputs: ActionInput[][]
): ActionDraft => ({ name, label, description, inputs: inputs.flat() });

/**
 * Sets of actions an author starts from. `classic` is what every new game holds, so the starter
 * code, the tutorials and the examples of the reference all read actions a new game has.
 */
export const INPUT_PRESETS = {
  classic: [
    action(
      'left',
      'Left',
      '',
      keys(0, 'ArrowLeft', 'a', 'q'),
      keys(1, 'j'),
      pad('dpad-left', 'stick-left'),
    ),
    action(
      'right',
      'Right',
      '',
      keys(0, 'ArrowRight', 'd'),
      keys(1, 'l'),
      pad('dpad-right', 'stick-right'),
    ),
    action('up', 'Up', '', keys(0, 'ArrowUp', 'w', 'z'), keys(1, 'i'), pad('dpad-up', 'stick-up')),
    action(
      'down',
      'Down',
      '',
      keys(0, 'ArrowDown', 's'),
      keys(1, 'k'),
      pad('dpad-down', 'stick-down'),
    ),
    action('a', 'A', '', keys(0, 'x', ' '), keys(1, 'n'), pad('a')),
    action('b', 'B', '', keys(0, 'c', 'Shift'), keys(1, 'm'), pad('b')),
    action('x', 'X', '', keys(0, 'v'), keys(1, ',', ';'), pad('x')),
    action('y', 'Y', '', keys(0, 'b'), keys(1, '.', ':'), pad('y')),
    action('pause', 'Pause', '', keys(0, 'Escape', 'Enter'), keys(1, 'p'), pad('start')),
  ],
  platformer: [
    action(
      'move_left',
      'Move left',
      '',
      keys(0, 'ArrowLeft', 'a', 'q'),
      pad('dpad-left', 'stick-left'),
    ),
    action(
      'move_right',
      'Move right',
      '',
      keys(0, 'ArrowRight', 'd'),
      pad('dpad-right', 'stick-right'),
    ),
    action('jump', 'Jump', 'Hold to jump higher', keys(0, ' ', 'ArrowUp', 'w', 'z'), pad('a')),
    action('dash', 'Dash', 'Hold to run', keys(0, 'Shift', 'x'), pad('x')),
    action('crouch', 'Crouch', '', keys(0, 'ArrowDown', 's'), pad('dpad-down', 'stick-down')),
    action('interact', 'Interact', 'Doors, signs and switches', keys(0, 'e'), pad('b')),
    action('pause', 'Pause', '', keys(0, 'Escape', 'Enter'), pad('start')),
  ],
  'top-down': [
    action(
      'move_left',
      'Move left',
      '',
      keys(0, 'ArrowLeft', 'a', 'q'),
      pad('dpad-left', 'stick-left'),
    ),
    action(
      'move_right',
      'Move right',
      '',
      keys(0, 'ArrowRight', 'd'),
      pad('dpad-right', 'stick-right'),
    ),
    action('move_up', 'Move up', '', keys(0, 'ArrowUp', 'w', 'z'), pad('dpad-up', 'stick-up')),
    action('move_down', 'Move down', '', keys(0, 'ArrowDown', 's'), pad('dpad-down', 'stick-down')),
    action('primary', 'Primary', 'Attack or confirm', keys(0, ' ', 'x'), pad('a')),
    action('secondary', 'Secondary', 'Use an item or cancel', keys(0, 'Shift', 'c'), pad('b')),
    action('pause', 'Pause', '', keys(0, 'Escape', 'Enter'), pad('start')),
  ],
  'two-players': [
    action(
      'left',
      'Left',
      '',
      keys(0, 'a', 'q'),
      keys(1, 'ArrowLeft'),
      pad('dpad-left', 'stick-left'),
    ),
    action(
      'right',
      'Right',
      '',
      keys(0, 'd'),
      keys(1, 'ArrowRight'),
      pad('dpad-right', 'stick-right'),
    ),
    action('up', 'Up', '', keys(0, 'w', 'z'), keys(1, 'ArrowUp'), pad('dpad-up', 'stick-up')),
    action('down', 'Down', '', keys(0, 's'), keys(1, 'ArrowDown'), pad('dpad-down', 'stick-down')),
    action('action', 'Action', '', keys(0, ' ', 'f'), keys(1, 'Enter', 'm'), pad('a')),
    action('pause', 'Pause', '', keys(0, 'Escape'), keys(1, 'p'), pad('start')),
  ],
} as const satisfies Record<string, readonly ActionDraft[]>;

export type InputPresetId = keyof typeof INPUT_PRESETS;
export const INPUT_PRESET_IDS = Object.keys(INPUT_PRESETS) as InputPresetId[];
