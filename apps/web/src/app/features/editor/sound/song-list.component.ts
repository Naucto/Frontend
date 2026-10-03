import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { type Pattern, type Song, SONG_SLOTS } from '@naucto/engine';
import {
  HelpDotComponent,
  NumberFieldComponent,
  type NumberFieldTone,
  TransportComponent,
} from '@naucto/ui';

import { pad2 } from './sound-library';

const COLUMNS = 4;

/**
 * Rows the grid stands at, whatever the music holds.
 *
 * Left to its content it would grow a row at a time and shift everything under it on every one.
 * It keeps its height and scrolls instead.
 */
const ROWS = 5;

/**
 * Room under the last row, so it does not end flush with the scrolling edge and read as cut off.
 */
const TAIL = 4;

interface Cell {
  index: number;
  /** The pattern's number, or nothing where the place is empty. */
  slot: number | null;
  tone: NumberFieldTone;
}

/**
 * A music, as a tracker writes one: a grid of pattern numbers, played left to right, top to bottom.
 *
 * Numbers, not names, all the way down. A place says which pattern plays; the pattern says what it
 * sounds like. Naming either would mean reading two things to know one.
 *
 * A hole is an error, not a silence — a pattern carries its own length and an empty place has none,
 * so nothing could say how long the silence lasts. An empty place with music after it is drawn in
 * orange, and the music stops before it.
 */
@Component({
  selector: 'nc-song-list',
  imports: [TranslocoDirective, HelpDotComponent, NumberFieldComponent, TransportComponent],
  templateUrl: './song-list.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SongListComponent {
  readonly slot = input.required<number>();
  readonly song = input<Song | null>(null);
  readonly patterns = input.required<Map<string, Pattern>>();
  /** Which place of the chain is sounding, or null when the music is not playing. */
  readonly playingIndex = input<number | null>(null);
  readonly playing = input(false);

  /** Highest pattern number there is, which is as far as a box will step. */
  readonly maxPattern = input.required<number>();

  readonly slotChange = output<number>();
  /** One place of the chain, by pattern number — `null` empties it. */
  readonly assign = output<{ index: number; slot: number | null }>();
  readonly started = output();
  readonly paused = output();
  readonly rewound = output();
  readonly stopped = output();

  protected readonly MAX_SONG_SLOT = SONG_SLOTS - 1;
  protected readonly columnTrack = `repeat(${String(COLUMNS)}, minmax(0, 1fr))`;
  protected readonly height = `calc(${String(ROWS)} * var(--nc-control-h-xs) + ${String(
    (ROWS - 1) * 2 + TAIL,
  )}px)`;

  /** The chain, padded out to whole rows with a free row past the last thing in it. */
  protected readonly cells = computed<Cell[]>(() => {
    const sequence = this.song()?.sequence ?? [];
    const patterns = this.patterns();
    const playingAt = this.playingIndex();
    let last = -1;
    for (let i = 0; i < sequence.length; i++) {
      if (sequence[i]) {
        last = i;
      }
    }
    // At least the height of the box, so the empty grid is a grid and not a single row.
    const rows = Math.max(ROWS, Math.floor(last / COLUMNS) + 2);
    return Array.from({ length: rows * COLUMNS }, (_, index) => {
      const id = sequence[index] ?? null;
      const pattern = id ? patterns.get(id) : undefined;
      // A place whose pattern is gone keeps its index, and warns like a hole with music after it. —
      // delete L90-91.
      const missing = id !== null && pattern === undefined;
      // Orange for both of those — a mistake, not a rest, and the music stops before it. Pink for
      // the place that is sounding.
      const tone: NumberFieldTone =
        index === playingAt ? 'accent' : missing || (!id && index < last) ? 'warn' : 'default';
      return { index, slot: pattern?.slot ?? null, tone };
    });
  });

  protected placeLabel(index: number): string {
    return pad2(index);
  }
}
