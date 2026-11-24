import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

import { type IconName } from '../icons/glyphs';
import { IconComponent } from './icon.component';

/**
 * Settings row: an icon, the title and hint, and the control on the right. On a phone the control
 * goes under the words, set in line with them rather than under the icon. `bare` is for a row
 * standing alone in a form: it takes neither the list's stripe nor its inset.
 */
@Component({
  selector: 'nc-setting-row',
  imports: [IconComponent],
  templateUrl: './setting-row.component.html',
  host: {
    class: 'grid items-center gap-x-3 gap-y-1',
    '[class]': 'layout()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingRowComponent {
  readonly title = input.required<string>();
  readonly hint = input<string>();
  readonly danger = input(false);
  readonly icon = input<IconName>();
  readonly bare = input(false, { transform: booleanAttribute });
  protected readonly layout = computed(() => {
    const columns = this.icon()
      ? 'grid-cols-[18px_minmax(0,1fr)_auto] max-sm:grid-cols-[18px_minmax(0,1fr)]'
      : 'grid-cols-[minmax(0,1fr)_auto] max-sm:grid-cols-[minmax(0,1fr)]';
    return this.bare() ? columns : `${columns} px-2.25 py-1.5 [&:nth-of-type(odd)]:bg-inset`;
  });
}
