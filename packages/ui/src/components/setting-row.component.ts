import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Settings row: title and hint on the left, the control on the right. */
@Component({
  selector: 'nc-setting-row',
  templateUrl: './setting-row.component.html',
  host: {
    class: 'flex items-center justify-between gap-1.75 px-1.5 py-1.5 [&:nth-of-type(odd)]:bg-inset',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingRowComponent {
  readonly title = input.required<string>();
  readonly hint = input<string>();
  readonly danger = input(false);
}
