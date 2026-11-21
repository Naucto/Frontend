/**
 * What schema v2 gave every game: nine fixed actions, each player free to rebind them from one set
 * of default bindings, and on `game.meta` the names a game gave some of them. Frozen: it describes
 * v2 as it was, so it must not follow the presets as they move on.
 */
export const V2_ACTIONS = ['left', 'right', 'up', 'down', 'a', 'b', 'x', 'y', 'pause'] as const;
export type V2Action = (typeof V2_ACTIONS)[number];

export const V2_LABELS_KEY = 'actions';

/** What an action is called when the game did not name it. */
export const V2_DEFAULT_LABELS: Record<V2Action, string> = {
  left: 'Left',
  right: 'Right',
  up: 'Up',
  down: 'Down',
  a: 'A',
  b: 'B',
  x: 'X',
  y: 'Y',
  pause: 'Pause',
};

/**
 * The default keys of the first and the second player, as `event.key` names them. v2 listed both
 * cases of a letter; a key is matched whatever its case now, so each is listed once.
 */
export const V2_DEFAULT_KEYS: readonly [Record<V2Action, string[]>, Record<V2Action, string[]>] = [
  {
    left: ['ArrowLeft', 'a', 'q'],
    right: ['ArrowRight', 'd'],
    up: ['ArrowUp', 'w', 'z'],
    down: ['ArrowDown', 's'],
    a: ['x', ' '],
    b: ['c', 'Shift'],
    x: ['v'],
    y: ['b'],
    pause: ['Escape', 'Enter'],
  },
  {
    left: ['j'],
    right: ['l'],
    up: ['i'],
    down: ['k'],
    a: ['n'],
    b: ['m'],
    x: [',', ';'],
    y: ['.', ':'],
    pause: ['p'],
  },
];

/**
 * The default gamepad bindings, in the names schema v3 gives the controls: v2 read buttons 12 to
 * 15 and the first two axes for the directions, 0 to 3 for the face buttons and 9 for pause.
 */
export const V2_DEFAULT_PAD: Record<V2Action, string[]> = {
  left: ['dpad-left', 'stick-left'],
  right: ['dpad-right', 'stick-right'],
  up: ['dpad-up', 'stick-up'],
  down: ['dpad-down', 'stick-down'],
  a: ['a'],
  b: ['b'],
  x: ['x'],
  y: ['y'],
  pause: ['start'],
};

/**
 * Where schema v3 keeps a game's actions: a root of entries keyed by id, each holding its fields
 * and a map from every input plugged into it to its rank among them.
 */
export const V3_ACTIONS = {
  root: 'input.actions',
  name: 'name',
  label: 'label',
  description: 'description',
  order: 'order',
  inputs: 'inputs',
  key: (player: number, key: string): string => `key:${String(player)}:${key}`,
  pad: (control: string): string => `pad:${control}`,
} as const;
