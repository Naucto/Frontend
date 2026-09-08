import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * One offered thing in a suggestion list.
 *
 * The row the keyboard is on is filled and wears a bar down its left edge; the bar eats two of the
 * fourteen pixels of padding rather than adding to them, so the words do not shift as the
 * selection moves.
 */
@Component({
  selector: 'nc-suggest-row',
  template: '<ng-content />',
  host: {
    role: 'option',
    '[attr.aria-selected]': 'selected()',
    '[class]':
      '"flex w-full items-center gap-2 py-[7px] pr-[14px] text-left " + ' +
      '(selected() ? "border-l-2 border-gold bg-raised pl-[12px]" : "pl-[14px]")',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuggestRowComponent {
  readonly selected = input(false);
}
