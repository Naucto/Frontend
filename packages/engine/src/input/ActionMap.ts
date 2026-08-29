/** A name the game gives one of the engine's actions, for the controls table and "how to play". */
export interface DeclaredAction {
  action: Action;
  label: string;
}

export const ACTIONS = ['left', 'right', 'up', 'down', 'a', 'b', 'x', 'y', 'pause'] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_BIT: Record<Action, number> = {
  left: 1 << 0,
  right: 1 << 1,
  up: 1 << 2,
  down: 1 << 3,
  a: 1 << 4,
  b: 1 << 5,
  x: 1 << 6,
  y: 1 << 7,
  pause: 1 << 8,
};

export const MAX_PLAYERS = 4;

export interface GamepadButtonRef {
  /** Standard-mapping button index, or axis ref. */
  button?: number;
  axis?: number;
  /** +1 or -1 for axes. */
  direction?: 1 | -1;
}

export interface ActionBindings {
  /** Per player (index 0 = player 1): action → event.key names. */
  keyboard: Record<Action, string[]>[];
  gamepad: Record<Action, GamepadButtonRef[]>;
}

export const DEFAULT_BINDINGS: ActionBindings = {
  keyboard: [
    {
      left: ['ArrowLeft', 'a', 'A', 'q', 'Q'],
      right: ['ArrowRight', 'd', 'D'],
      up: ['ArrowUp', 'w', 'W', 'z', 'Z'],
      down: ['ArrowDown', 's', 'S'],
      a: ['x', 'X', ' '],
      b: ['c', 'C', 'Shift'],
      x: ['v', 'V'],
      y: ['b', 'B'],
      pause: ['Escape', 'Enter'],
    },
    {
      left: ['j', 'J'],
      right: ['l', 'L'],
      up: ['i', 'I'],
      down: ['k', 'K'],
      a: ['n', 'N'],
      b: ['m', 'M'],
      x: [',', ';'],
      y: ['.', ':'],
      pause: ['p', 'P'],
    },
  ],
  gamepad: {
    left: [{ button: 14 }, { axis: 0, direction: -1 }],
    right: [{ button: 15 }, { axis: 0, direction: 1 }],
    up: [{ button: 12 }, { axis: 1, direction: -1 }],
    down: [{ button: 13 }, { axis: 1, direction: 1 }],
    a: [{ button: 0 }],
    b: [{ button: 1 }],
    x: [{ button: 2 }],
    y: [{ button: 3 }],
    pause: [{ button: 9 }],
  },
};

export const isAction = (v: unknown): v is Action =>
  typeof v === 'string' && (ACTIONS as readonly string[]).includes(v);
