import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { type Pattern, type Song, SONG_SLOTS } from '@naucto/engine';
import {
  HelpDotComponent,
  NumberFieldComponent,
  type NumberFieldTone,
  TransportComponent,
} from '@naucto/ui';

const COLUMNS = 4;

/**
 * Rows the grid stands at, whatever the music holds.
 *
 * Left to its content it would grow a row at a time and shift everything under it on every one.
 * It keeps its height and scrolls instead.
 */
const ROWS = 5;

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
  template: `
    <div *transloco="let t" class="border-t border-line p-1.5">
      <!-- A head of the same fixed height as the bank of sound effects above it: both hold five
           rows of boxes, so the only thing that could make the two sections differ is this row,
           and left to its contents it does. -->
      <div class="mb-1 flex h-(--nc-control-h) items-center gap-1">
        <span class="label shrink-0 text-ink-3">{{ t('editor.sound.music') }}</span>
        <!-- Beside its own name rather than at the far end of the row: pushed there it was the one
             thing with nowhere to go when the row ran out of width. -->
        <nc-number-field
          class="shrink-0"
          [label]="t('editor.sound.musicSlot')"
          [value]="slot()"
          [max]="MAX_SLOT"
          size="sm"
          (requested)="slotChange.emit($event)"
        />
        <!-- The music has a transport of its own: playing a chain and auditioning the pattern in
             front of you are two things to listen to, and one button cannot be both. At the drawn
             density, because this is a section head and not the tab's own bar. -->
        <nc-transport
          class="nc-density-small"
          [playing]="playing()"
          [canRewind]="playing()"
          [canStop]="playing()"
          [playLabel]="t('editor.sound.playMusic')"
          [pauseLabel]="t('editor.sound.pauseMusic')"
          [rewindLabel]="t('editor.sound.musicToStart')"
          [stopLabel]="t('editor.sound.stopMusic')"
          (started)="started.emit()"
          (paused)="paused.emit()"
          (rewound)="rewound.emit()"
          (stopped)="stopped.emit()"
        />
        <span class="flex-1"></span>
        <nc-help-dot [text]="t('editor.sound.musicHelp')" />
      </div>

      <div class="overflow-y-auto" [style.height]="height" [style.scrollbar-gutter]="'stable'">
        <div class="grid gap-0.5" [style.grid-template-columns]="columnTrack" role="group">
          @for (c of cells(); track c.index) {
            <nc-number-field
              class="h-(--nc-control-h-xs) w-full"
              size="sm"
              fill
              clearable
              [pad]="2"
              placeholder="--"
              [ariaLabel]="rowLabel(c.index)"
              [value]="c.slot"
              [max]="maxSlot()"
              [tone]="c.tone"
              (requested)="assign.emit({ index: c.index, slot: $event })"
              (cleared)="assign.emit({ index: c.index, slot: null })"
            />
          }
        </div>
      </div>
    </div>
  `,
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
  readonly maxSlot = input(99);

  readonly slotChange = output<number>();
  /** One place of the chain, by pattern number — `null` empties it. */
  readonly assign = output<{ index: number; slot: number | null }>();
  readonly started = output();
  readonly paused = output();
  readonly rewound = output();
  readonly stopped = output();

  protected readonly MAX_SLOT = SONG_SLOTS - 1;
  protected readonly columnTrack = `repeat(${String(COLUMNS)}, minmax(0, 1fr))`;
  protected readonly height = `calc(${String(ROWS)} * var(--nc-control-h-xs) + ${String(
    (ROWS - 1) * 2,
  )}px)`;

  /** The chain, padded out to whole rows with a free row past the last thing in it. */
  protected readonly cells = computed<Cell[]>(() => {
    const sequence = this.song()?.sequence ?? [];
    const patterns = this.patterns();
    const playingAt = this.playingIndex();
    let last = -1;
    for (let i = 0; i < sequence.length; i++) if (sequence[i]) last = i;
    // At least the height of the box, so the empty grid is a grid and not a single row.
    const rows = Math.max(ROWS, Math.floor(last / COLUMNS) + 2);
    return Array.from({ length: rows * COLUMNS }, (_, index) => {
      const id = sequence[index] ?? null;
      const pattern = id ? patterns.get(id) : undefined;
      // A place whose pattern is gone keeps its place rather than closing up: every place after it
      // would otherwise shift, and where a pattern sits in the chain is what the reader is reading.
      // A place whose pattern has been deleted is as wrong as an empty one with music after it,
      // and reads the same way: a box with nothing in it where something was meant to play.
      const missing = id !== null && pattern === undefined;
      // Orange for both of those — a mistake, not a rest, and the music stops before it. Pink for
      // the place that is sounding.
      const tone: NumberFieldTone =
        index === playingAt ? 'accent' : missing || (!id && index < last) ? 'warn' : 'default';
      return { index, slot: pattern?.slot ?? null, tone };
    });
  });

  protected rowLabel(index: number): string {
    return String(index).padStart(2, '0');
  }
}
