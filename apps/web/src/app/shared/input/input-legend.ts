import type { ActionInput, PadControl } from '@naucto/engine';
import type { MarkName, PadCapKind, PadDirection } from '@naucto/ui';

/**
 * What a keycap shows for an input. The words are translation keys; a direction is drawn, as the
 * kit's arrow on a key or as the pad control itself, and `direction` is the word read out in its
 * place.
 */
export interface InputLegend {
  /** The key or the button as it is engraved: a letter, `F1`, `LB`. */
  text: string | null;
  word: string | null;
  mark: MarkName | null;
  direction: string | null;
  /** A D-pad or stick direction, drawn as the control instead of a keycap. */
  pad: { kind: PadCapKind; direction: PadDirection } | null;
}

const ARROW_KEYS: Record<string, PadDirection> = {
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

const PAD_LEGENDS: Record<
  PadControl,
  {
    text?: string;
    word?: string;
    toward?: PadDirection;
    drawn?: PadCapKind;
  }
> = {
  'dpad-up': { word: 'input.pad.dpad', toward: 'up', drawn: 'dpad' },
  'dpad-down': { word: 'input.pad.dpad', toward: 'down', drawn: 'dpad' },
  'dpad-left': { word: 'input.pad.dpad', toward: 'left', drawn: 'dpad' },
  'dpad-right': { word: 'input.pad.dpad', toward: 'right', drawn: 'dpad' },
  'stick-up': { word: 'input.pad.stick', toward: 'up', drawn: 'stick' },
  'stick-down': { word: 'input.pad.stick', toward: 'down', drawn: 'stick' },
  'stick-left': { word: 'input.pad.stick', toward: 'left', drawn: 'stick' },
  'stick-right': { word: 'input.pad.stick', toward: 'right', drawn: 'stick' },
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
  const { text, word, toward, drawn } =
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
    mark: toward && !drawn ? `arrow-${toward}` : null,
    direction: toward ? `input.direction.${toward}` : null,
    pad: drawn && toward ? { kind: drawn, direction: toward } : null,
  };
}
