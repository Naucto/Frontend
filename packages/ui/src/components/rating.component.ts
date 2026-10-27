import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  input,
  model,
  viewChildren,
} from '@angular/core';

/** A score of this or less reads as a complaint. */
export const LOW_RATING_MAX = 4;

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

  protected readonly scores = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  protected readonly lowMax = LOW_RATING_MAX;
  private readonly cells = viewChildren<ElementRef<HTMLButtonElement>>('cell');

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
