import type { ActionInput, PadControl } from '@naucto/engine';
import type { MarkName } from '@naucto/ui';

type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * What a keycap shows for an input. The words are translation keys; a direction is drawn, as the
 * kit's arrow, and `direction` is the word read out in its place.
 */
export interface InputLegend {
  /** The key or the button as it is engraved: a letter, `F1`, `LB`. */
  text: string | null;
  word: string | null;
  mark: MarkName | null;
  direction: string | null;
}

const ARROW_KEYS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/** Keys whose `event.key` name is not what the key says on it. */
const KEY_WORDS: Record<string, string> = {
  ' ': 'input.key.space',
  Escape: 'input.key.escape',
  Enter: 'input.key.enter',
  Shift: 'input.key.shift',
  Control: 'input.key.control',
  Alt: 'input.key.alt',
  Meta: 'input.key.meta',
  Tab: 'input.key.tab',
  Backspace: 'input.key.backspace',
  Delete: 'input.key.delete',
  CapsLock: 'input.key.capsLock',
};

const PAD_LEGENDS: Record<PadControl, { text?: string; word?: string; toward?: Direction }> = {
  'dpad-up': { word: 'input.pad.dpad', toward: 'up' },
  'dpad-down': { word: 'input.pad.dpad', toward: 'down' },
  'dpad-left': { word: 'input.pad.dpad', toward: 'left' },
  'dpad-right': { word: 'input.pad.dpad', toward: 'right' },
  'stick-up': { word: 'input.pad.stick', toward: 'up' },
  'stick-down': { word: 'input.pad.stick', toward: 'down' },
  'stick-left': { word: 'input.pad.stick', toward: 'left' },
  'stick-right': { word: 'input.pad.stick', toward: 'right' },
  a: { text: 'A' },
  b: { text: 'B' },
  x: { text: 'X' },
  y: { text: 'Y' },
  lb: { text: 'LB' },
  rb: { text: 'RB' },
  start: { word: 'input.pad.start' },
  select: { word: 'input.pad.select' },
};

export function legendOf(input: ActionInput): InputLegend {
  const { text, word, toward } =
    input.kind === 'pad'
      ? PAD_LEGENDS[input.control]
      : {
          toward: ARROW_KEYS[input.key],
          word: KEY_WORDS[input.key],
          text: input.key in ARROW_KEYS || input.key in KEY_WORDS ? undefined : input.key,
        };

  return {
    text: text ?? null,
    word: word ?? null,
    mark: toward ? `arrow-${toward}` : null,
    direction: toward ? `input.direction.${toward}` : null,
  };
}
