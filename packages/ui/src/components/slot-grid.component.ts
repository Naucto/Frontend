import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/** One numbered place in a bank, and whether anything is in it. */
export interface SlotCell {
  /** The number written in the cell, which is what the slot is called everywhere else. */
  n: number;
  /** `current` is the one being worked on; `filled` holds something; `empty` is free. */
  state: 'empty' | 'filled' | 'current';
  /** Accessible name. Falls back to the number, which is what the cell shows. */
  label?: string;
}

/**
 * Numbers a bank shows: every number in use, and a whole free row past the last of them.
 *
 * A bank is not a fixed set of places — it grows as it fills, and the free row at the end is where
 * the next thing goes. Empty, it is one row of nothing.
 */
export function slotRange(taken: Iterable<number>, columns: number): number[] {
  let max = -1;
  for (const n of taken) if (n > max) max = n;
  const rows = Math.floor(max / columns) + 2;
  return Array.from({ length: rows * columns }, (_, i) => i);
}

/**
 * Room under the last row, past the gaps between them.
 *
 * Measured to the pixel, the bank ends flush with its own scrolling edge, and the last row reads
 * as cut off rather than as the last one.
 */
const TAIL = 4;

/** Row gap, in pixels. */
const GAP = 4;

/**
 * A bank of numbered slots. The number is the whole of what a cell says: it is what everything else
 * refers to the slot by, so a name beside it would be a second thing to read to know the same one.
 */
@Component({
  selector: 'nc-slot-grid',
  templateUrl: './slot-grid.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlotGridComponent {
  readonly cells = input.required<readonly SlotCell[]>();
  readonly columns = input(4);
  /**
   * Rows the bank stands at, whatever it holds.
   *
   * A bank has no last slot, so left to its content it would grow without bound and shift
   * everything under it every time a row was added. It keeps its height and scrolls instead.
   */
  readonly rows = input(5);
  readonly pick = output<number>();

  protected readonly gap = GAP;

  protected readonly columnTrack = computed(
    () => `repeat(${String(this.columns())}, minmax(0, 1fr))`,
  );

  protected readonly height = computed(
    () =>
      `calc(${String(this.rows())} * var(--nc-control-h-xs) + ${String((this.rows() - 1) * GAP + TAIL)}px)`,
  );

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  protected cellClass(c: SlotCell): string {
    if (c.state === 'current') return 'border-gold bg-gold text-on-accent';
    if (c.state === 'filled') return 'border-line-strong bg-raised text-ink-body';
    return 'border-line bg-inset text-ink-4 hover:border-line-strong hover:text-ink';
  }
}
