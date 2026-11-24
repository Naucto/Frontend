export const MAX_PLAYERS = 4;
/** One bit of a 32-bit mask per action. */
export const MAX_ACTIONS = 32;
export const ACTION_NAME_MAX = 24;
export const ACTION_LABEL_MAX = 25;
export const ACTION_DESCRIPTION_MAX = 60;

/** The controls of a gamepad an action can be plugged into, the same on every pad. */
export const PAD_CONTROLS = [
  'dpad-up',
  'dpad-down',
  'dpad-left',
  'dpad-right',
  'stick-up',
  'stick-down',
  'stick-left',
  'stick-right',
  'a',
  'b',
  'x',
  'y',
  'lb',
  'rb',
  'start',
  'select',
] as const;
export type PadControl = (typeof PAD_CONTROLS)[number];

/** Which keyboard layout a key belongs to: the first player's or the second's. */
export type KeyboardPlayer = 0 | 1;

/**
 * One thing that triggers an action: a keyboard key of the first or the second player, named as
 * `event.key` names it, or a gamepad control, which every pad has.
 */
export type ActionInput =
  { kind: 'key'; player: KeyboardPlayer; key: string } | { kind: 'pad'; control: PadControl };

/** What an author states about an action. `name` is what the code reads it by. */
export interface ActionDraft {
  name: string;
  label: string;
  description: string;
  inputs: readonly ActionInput[];
}

/** An action of a game, as its document holds it. */
export interface GameAction extends ActionDraft {
  id: string;
  order: number;
}

/**
 * A letter reports its case from Shift and Caps Lock, not from the key pressed, so `a` and `A` are
 * one key.
 */
export function canonicalKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

const isPadControl = (value: string): value is PadControl =>
  (PAD_CONTROLS as readonly string[]).includes(value);

/** What names an input in a document and tells two inputs apart. */
export function inputId(input: ActionInput): string {
  return input.kind === 'key'
    ? `key:${String(input.player)}:${canonicalKey(input.key)}`
    : `pad:${input.control}`;
}

/** The input an id names, or null for one this build does not know. A key may itself be a colon. */
export function parseInputId(id: string): ActionInput | null {
  if (id.startsWith('pad:')) {
    const control = id.slice(4);

    return isPadControl(control) ? { kind: 'pad', control } : null;
  }
  const player = id.startsWith('key:0:') ? 0 : id.startsWith('key:1:') ? 1 : null;
  const key = id.slice(6);

  return player === null || key === '' ? null : { kind: 'key', player, key: canonicalKey(key) };
}

export type ActionNameIssue = 'empty' | 'format' | 'too-long' | 'taken';

const ACTION_NAME = /^[a-z][a-z0-9_]*$/;

/** Why a name cannot be an action's, among the names the game's other actions already have. */
export function actionNameIssue(
  name: string,
  taken: Iterable<string> = [],
): ActionNameIssue | null {
  if (name === '') {
    return 'empty';
  }
  if (!ACTION_NAME.test(name)) {
    return 'format';
  }
  if (name.length > ACTION_NAME_MAX) {
    return 'too-long';
  }
  for (const other of taken) {
    if (other === name) {
      return 'taken';
    }
  }

  return null;
}

/** The other actions an input is already plugged into; a key says for which player. */
export function actionsUsing(
  actions: readonly GameAction[],
  input: ActionInput,
  except?: string,
): GameAction[] {
  const wanted = inputId(input);

  return actions.filter(
    (action) =>
      action.id !== except && action.inputs.some((plugged) => inputId(plugged) === wanted),
  );
}
