import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { type Pattern, type Song, SONG_SLOTS } from '@naucto/engine';
import { ButtonDirective, HelpDotComponent, IconComponent, NumberFieldComponent } from '@naucto/ui';

/** How wide the grid is. Four numbers across is what the 237px column fits. */
const COLUMNS = 4;

/**
 * Rows the grid stands at, whatever the music holds.
 *
 * Left to its content it would grow a row at a time and shift the section under it on every one.
 * It keeps its height and scrolls, which is also the height of the bank of sound effects above it.
 */
const ROWS = 5;

interface Cell {
  index: number;
  /** What the box shows: a pattern number, `--` where the pattern it named is gone, or nothing. */
  text: string;
  state: 'empty' | 'gap' | 'set' | 'playing';
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
  imports: [
    TranslocoDirective,
    ButtonDirective,
    IconComponent,
    HelpDotComponent,
    NumberFieldComponent,
  ],
  template: `
    <div *transloco="let t" class="border-t border-line px-1.5 py-1.25">
      <div class="mb-1 flex items-center gap-1">
        <span class="label text-ink-3">{{ t('editor.sound.music') }}</span>
        <!-- The music has a transport of its own: playing a chain and auditioning the pattern in
             front of you are two things to listen to, and one button cannot be both. -->
        @if (playing()) {
          <button
            ncButton
            variant="ghost"
            size="sm"
            iconOnly
            [attr.aria-label]="t('editor.sound.pauseMusic')"
            (click)="paused.emit()"
          >
            <nc-icon name="pause" [size]="12" />
          </button>
        } @else {
          <button
            ncButton
            variant="ghost"
            size="sm"
            iconOnly
            [disabled]="!cells().some((c) => c.state === 'set' || c.state === 'playing')"
            [attr.aria-label]="t('editor.sound.playMusic')"
            (click)="started.emit()"
          >
            <nc-icon name="play" [size]="12" class="text-hot-ink" />
          </button>
        }
        <span class="flex-1"></span>
        <nc-number-field
          [label]="t('editor.sound.musicSlot')"
          [value]="slot()"
          [max]="MAX_SLOT"
          size="sm"
          (requested)="slotChange.emit($event)"
        />
        <nc-help-dot [text]="t('editor.sound.musicHelp')" />
      </div>

      <div class="overflow-y-auto" [style.height]="height" [style.scrollbar-gutter]="'stable'">
        <div class="grid gap-0.5" [style.grid-template-columns]="columnTrack" role="group">
          @for (c of cells(); track c.index) {
            <input
              type="text"
              inputmode="numeric"
              maxlength="2"
              placeholder="--"
              class="h-(--nc-control-h-xs) w-full rounded-xs border text-center font-mono text-label outline-none placeholder:text-ink-4"
              [class]="cellClass(c)"
              [value]="c.text"
              [attr.aria-label]="rowLabel(c.index)"
              (keydown.enter)="commit($event, c.index)"
              (keydown.arrowUp)="step($event, c, 1)"
              (keydown.arrowDown)="step($event, c, -1)"
              (blur)="commit($event, c.index)"
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

  protected readonly MAX_SLOT = SONG_SLOTS - 1;
  protected readonly columnTrack = `repeat(${String(COLUMNS)}, minmax(0, 1fr))`;
  /** Rows of boxes plus the gaps between them — the gap is `0.5`, which Tailwind sets at 2px. */
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
      const text = !id ? '' : pattern ? pad(pattern.slot) : '--';
      const state = index === playingAt ? 'playing' : id ? 'set' : index < last ? 'gap' : 'empty';
      return { index, text, state };
    });
  });

  protected rowLabel(index: number): string {
    return pad(index);
  }

  protected cellClass(c: Cell): string {
    if (c.state === 'playing') return 'border-hot bg-hot text-on-accent';
    if (c.state === 'set') return 'border-line-strong bg-raised text-ink-body';
    // Orange, because it is a mistake and not a rest: the music stops before it.
    if (c.state === 'gap') return 'border-orange bg-inset text-orange-ink';
    return 'border-line bg-inset text-ink-body focus:border-line-strong';
  }

  /** What was typed, read as a pattern number. Nothing typed empties the place. */
  protected commit(event: Event, index: number): void {
    const box = event.target as HTMLInputElement;
    const typed = box.value.replace(/[^\d]/g, '');
    if (typed === '') {
      this.assign.emit({ index, slot: null });
      return;
    }
    this.assign.emit({ index, slot: Math.min(this.maxSlot(), Number(typed)) });
  }

  /**
   * The arrows walk the numbers, which is how you find the pattern you meant without leaving the
   * box. An empty place starts at zero going up and stays empty going down.
   */
  protected step(event: Event, cell: Cell, direction: number): void {
    event.preventDefault();
    const current = this.slotOf(cell.index);
    if (current === null) {
      if (direction > 0) this.assign.emit({ index: cell.index, slot: 0 });
      return;
    }
    const next = current + direction;
    this.assign.emit({ index: cell.index, slot: next < 0 ? null : Math.min(this.maxSlot(), next) });
  }

  private slotOf(index: number): number | null {
    const id = this.song()?.sequence[index] ?? null;
    const pattern = id ? this.patterns().get(id) : undefined;
    return pattern?.slot ?? null;
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
