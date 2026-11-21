import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { type IconName } from '../icons/glyphs';
import { IconComponent } from './icon.component';

/** Centered empty state: an icon in its well, a title, a hint, and the call to action under them. */
@Component({
  selector: 'nc-empty-state',
  imports: [IconComponent],
  templateUrl: './empty-state.component.html',
  host: {
    class: 'flex flex-col items-center justify-center gap-[10px] px-3 py-[36px] text-center',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  readonly icon = input.required<IconName>();
  readonly title = input.required<string>();
  readonly hint = input<string>();
}
