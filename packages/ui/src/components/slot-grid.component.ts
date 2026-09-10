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
 * A bank of numbered slots, as a tracker draws one: patterns, sound effects.
 *
 * The number is the whole of what a cell says. What lives at that number is named nowhere, because
 * a number is what everything else — a song's order list, `sound.play_sfx` — refers to it by, and
 * a name beside it would be a second thing to read to know the same one.
 */
@Component({
  selector: 'nc-slot-grid',
  template: `
    <div class="overflow-y-auto" [style.height]="height()" [style.scrollbar-gutter]="'stable'">
      <div class="grid gap-0.5" [style.grid-template-columns]="columnTrack()" role="group">
        @for (c of cells(); track c.n) {
          <button
            type="button"
            class="h-(--nc-control-h-xs) rounded-xs border font-mono text-label"
            [class]="cellClass(c)"
            [attr.aria-pressed]="c.state === 'current'"
            [attr.aria-label]="c.label ?? pad(c.n)"
            (click)="pick.emit(c.n)"
          >
            {{ pad(c.n) }}
          </button>
        }
      </div>
    </div>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SlotGridComponent {
  readonly cells = input.required<readonly SlotCell[]>();
  readonly columns = input(4);
  /**
   * Rows the bank stands at, whatever it holds.
   *
   * A bank has no last slot, so left to its content it would grow until it pushed whatever is
   * under it off the panel — and shift everything under it every time a row was added. It keeps
   * its height and scrolls instead.
   */
  readonly rows = input(5);
  readonly pick = output<number>();

  protected readonly columnTrack = computed(
    () => `repeat(${String(this.columns())}, minmax(0, 1fr))`,
  );

  /** Rows of cells plus the gaps between them — the gap is `0.5`, which Tailwind sets at 2px. */
  protected readonly height = computed(
    () =>
      `calc(${String(this.rows())} * var(--nc-control-h-xs) + ${String((this.rows() - 1) * 2)}px)`,
  );

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  protected cellClass(c: SlotCell): string {
    // A taken slot is a *fill*: an outline alone does not read as "there is something in this one"
    // across a grid of them, and the one you are working on inverts.
    if (c.state === 'current') return 'border-gold bg-gold text-on-accent';
    if (c.state === 'filled') return 'border-line-strong bg-raised text-ink-body';
    return 'border-line bg-inset text-ink-4 hover:border-line-strong hover:text-ink';
  }
}
