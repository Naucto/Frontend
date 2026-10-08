import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Settings row: title + hint on the left, the control on the right, hairline below. */
@Component({
  selector: 'nc-setting-row',
  templateUrl: './setting-row.component.html',
  host: {
    class: 'flex items-center justify-between gap-1.75 border-b border-line py-1.5 last:border-b-0',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingRowComponent {
  readonly title = input.required<string>();
  readonly hint = input<string>();
  readonly danger = input(false);
}
