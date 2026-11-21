import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { glyphPath, glyphRendering, MARK_GLYPHS, type MarkName } from '@naucto/ui';

import type { PlayerTone } from '../input/player-tone';

/** The buttons of a gamepad, in the order the Gamepad API's standard mapping numbers them. */
export const PAD_BUTTONS = [
  'a',
  'b',
  'x',
  'y',
  'lb',
  'rb',
  'lt',
  'rt',
  'select',
  'start',
  'ls',
  'rs',
  'dpad-up',
  'dpad-down',
  'dpad-left',
  'dpad-right',
] as const;
export type PadButton = (typeof PAD_BUTTONS)[number];

/** Which way a stick leans on each axis: -1, 0 or 1, right and down being 1. */
export type StickLean = readonly [number, number];

/** Capitals drawn for the pad, three cells by five, a row per string. */
const LETTERS: Record<string, readonly string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  L: ['#..', '#..', '#..', '#..', '###'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
};

/** A word as one path of cells, a cell between two letters. */
function word(text: string): string {
  return Array.from(text, (letter, i) =>
    (LETTERS[letter] ?? [])
      .flatMap((row, y) =>
        Array.from(row, (cell, x) =>
          cell === '#' ? `M${String(i * 4 + x)} ${String(y)}h1v1h-1z` : '',
        ),
      )
      .join(''),
  ).join('');
}

/** The outline of a box, a cell thick, its four corner cells left empty as the kit's frames are. */
function frame(width: number, height: number): string {
  const run = String(width - 2);
  const rise = String(height - 2);

  return (
    `M1 0h${run}v1h-${run}z` +
    `M0 1h1v${rise}h-1z` +
    `M${String(width - 1)} 1h1v${rise}h-1z` +
    `M1 ${String(height - 1)}h${run}v1h-${run}z`
  );
}

const at = (x: number, y: number): string => `translate(${String(x)} ${String(y)})`;

interface Part {
  id: PadButton;
  at: string;
  frame: string;
  width: number;
  height: number;
  glyph: string;
  glyphAt: string;
}

const part = (
  id: PadButton,
  x: number,
  y: number,
  [width, height]: readonly [number, number],
  glyph = '',
  glyphAt = at(0, 0),
): Part => ({ id, at: at(x, y), frame: frame(width, height), width, height, glyph, glyphAt });

const BUTTON = [9, 9] as const;
const PILL = [9, 5] as const;
const SHOULDER = [11, 7] as const;
const ARROW_AT = at(2, 2);
/** A mark of the kit, in the pad's own unit: the cell. */
const arrow = (name: MarkName): string => glyphPath(MARK_GLYPHS[name], 5, 1);
const LETTER_AT = at(3, 2);

/** Drawn first: the body's top edge closes them. */
const SHOULDERS: readonly Part[] = [
  part('lt', 3, 0, SHOULDER, word('LT'), at(2, 1)),
  part('lb', 15, 0, SHOULDER, word('LB'), at(2, 1)),
  part('rb', 67, 0, SHOULDER, word('RB'), at(2, 1)),
  part('rt', 79, 0, SHOULDER, word('RT'), at(2, 1)),
];

/**
 * The cross on the left, Select and Start in the middle, the diamond on the right: A at the
 * bottom, B on the right, X on the left, Y at the top.
 */
const BUTTONS: readonly Part[] = [
  part('dpad-up', 13, 9, BUTTON, arrow('arrow-up'), ARROW_AT),
  part('dpad-left', 3, 19, BUTTON, arrow('arrow-left'), ARROW_AT),
  part('dpad-right', 23, 19, BUTTON, arrow('arrow-right'), ARROW_AT),
  part('dpad-down', 13, 29, BUTTON, arrow('arrow-down'), ARROW_AT),
  part('select', 36, 12, PILL),
  part('start', 48, 12, PILL),
  part('y', 71, 9, BUTTON, word('Y'), LETTER_AT),
  part('x', 61, 19, BUTTON, word('X'), LETTER_AT),
  part('b', 81, 19, BUTTON, word('B'), LETTER_AT),
  part('a', 71, 29, BUTTON, word('A'), LETTER_AT),
];

const WIDTH = 93;
const BODY_HEIGHT = 35;
const BODY_RUN = String(WIDTH - 4);
const BODY_RISE = String(BODY_HEIGHT - 4);
/** The body steps twice at each corner, as a large frame of the kit does. */
const BODY =
  `M2 0h${BODY_RUN}v1h-${BODY_RUN}z` +
  `M1 1h1v1h-1zM${String(WIDTH - 2)} 1h1v1h-1z` +
  `M0 2h1v${BODY_RISE}h-1zM${String(WIDTH - 1)} 2h1v${BODY_RISE}h-1z` +
  `M1 ${String(BODY_HEIGHT - 2)}h1v1h-1zM${String(WIDTH - 2)} ${String(BODY_HEIGHT - 2)}h1v1h-1z` +
  `M2 ${String(BODY_HEIGHT - 1)}h${BODY_RUN}v1h-${BODY_RUN}z`;
/** The same bottom edge, a cell lower. */
const SKIRT =
  `M0 ${String(BODY_HEIGHT - 2)}h1v1h-1zM${String(WIDTH - 1)} ${String(BODY_HEIGHT - 2)}h1v1h-1z` +
  `M1 ${String(BODY_HEIGHT - 1)}h1v1h-1zM${String(WIDTH - 2)} ${String(BODY_HEIGHT - 1)}h1v1h-1z` +
  `M2 ${String(BODY_HEIGHT)}h${BODY_RUN}v1h-${BODY_RUN}z`;

const LIT: Record<PlayerTone, string> = {
  gold: '[--pad-lit:var(--color-gold)] [--pad-on:var(--color-on-accent)]',
  sky: '[--pad-lit:var(--color-sky)] [--pad-on:var(--color-on-accent)]',
  jade: '[--pad-lit:var(--color-jade)] [--pad-on:var(--color-on-accent)]',
  hot: '[--pad-lit:var(--color-hot)] [--pad-on:var(--color-on-hot)]',
};

/**
 * A gamepad drawn on the kit's pixel: a cell of the drawing is 3px, and it is never scaled. What
 * is held lights in the colour of the player the pad drives; a stick lights when it leans or is
 * clicked, and its knob moves the way it leans.
 *
 * Hidden from assistive tech: it shows what a hand is doing, and the card around it carries the
 * words.
 */
@Component({
  selector: 'nc-pad-art',
  templateUrl: './pad-art.component.html',
  styleUrl: './pad-art.component.css',
  host: { class: 'inline-flex shrink-0', '[class]': 'lit()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PadArtComponent {
  readonly held = input<readonly PadButton[]>([]);
  readonly left = input<StickLean>([0, 0]);
  readonly right = input<StickLean>([0, 0]);
  readonly tone = input<PlayerTone>('gold');
  /** Outlines only, for a seat no gamepad has taken. */
  readonly ghost = input(false, { transform: booleanAttribute });

  protected readonly lit = computed(() => LIT[this.tone()]);
  protected readonly rendering = glyphRendering;
  protected readonly shoulders = SHOULDERS;
  protected readonly buttons = BUTTONS;
  protected readonly body = BODY;
  protected readonly skirt = SKIRT;
  protected readonly well = frame(11, 11);
  protected readonly knob = frame(5, 5);
  protected readonly sticks = computed(() =>
    (
      [
        { id: 'ls', x: 34, lean: this.left() },
        { id: 'rs', x: 48, lean: this.right() },
      ] as const
    ).map(({ id, x, lean }) => ({
      id,
      at: at(x, 25),
      knobAt: at(3 + 2 * lean[0], 3 + 2 * lean[1]),
      lit: this.held().includes(id) || lean[0] !== 0 || lean[1] !== 0,
    })),
  );
}
