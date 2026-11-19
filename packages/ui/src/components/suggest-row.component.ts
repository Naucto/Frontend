import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { OptionDirective } from './option.directive';

/**
 * One offered thing in a suggestion list: a list option, lit where the keyboard is. The frame is
 * there from the start and only its colour arrives, so the words do not shift as the selection
 * moves.
 */
@Component({
  selector: 'nc-suggest-row',
  template: '<ng-content />',
  hostDirectives: [{ directive: OptionDirective, inputs: ['selected'] }],
  host: {
    role: 'option',
    class: 'items-center',
    '[attr.aria-selected]': 'option.selected()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuggestRowComponent {
  protected readonly option = inject(OptionDirective);
}
