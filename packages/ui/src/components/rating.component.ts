import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  input,
  model,
  viewChildren,
} from '@angular/core';

export const RATING_SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** A score of this or less reads as a complaint. */
export const LOW_RATING_MAX = 4;

/** Written out one by one: Tailwind reads the text of the sources, not what they compute to. */
const CHOSEN = {
  low: 'aria-checked:border-hot aria-checked:bg-hot aria-checked:text-on-accent-dark',
  mid: 'aria-checked:border-orange aria-checked:bg-orange aria-checked:text-on-accent',
  high: 'aria-checked:border-jade aria-checked:bg-jade aria-checked:text-on-accent',
} as const;

/**
 * A score out of ten, as one row of numbered cells. The chosen cell takes the colour of what the
 * score says, so a low one reads as a complaint before its number is read. The words at either
 * end come translated, since the kit has no locale of its own.
 */
@Component({
  selector: 'nc-rating',
  templateUrl: './rating.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RatingComponent {
  readonly value = model<number | null>(null);
  readonly label = input.required<string>();
  readonly lowLabel = input<string>();
  readonly highLabel = input<string>();
  readonly disabled = input(false);

  protected readonly scores = RATING_SCORES;
  private readonly cells = viewChildren<ElementRef<HTMLButtonElement>>('cell');

  protected cellClass(score: number): string {
    const tone = score <= LOW_RATING_MAX ? 'low' : score <= 7 ? 'mid' : 'high';
    return `h-(--nc-control-h) min-w-0 cursor-pointer rounded-xs border border-transparent bg-raised font-mono text-meta tabular-nums text-ink-3 transition-colors duration-100 hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 ${CHOSEN[tone]}`;
  }

  /** The chosen cell is the one tab stop; with nothing chosen yet, the first one is. */
  protected tabIndexFor(score: number): number {
    const value = this.value();
    return value === score || (value === null && score === 1) ? 0 : -1;
  }

  protected onKey(event: KeyboardEvent, index: number): void {
    const last = this.scores.length - 1;
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? Math.min(index + 1, last)
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? Math.max(index - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) {
      return;
    }
    event.preventDefault();
    this.value.set(this.scores[next] ?? null);
    this.cells()[next]?.nativeElement.focus();
  }
}
