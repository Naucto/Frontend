import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Settings row: title and hint on the left, the control on the right, under them on a phone. */
@Component({
  selector: 'nc-setting-row',
  templateUrl: './setting-row.component.html',
  host: {
    class:
      'flex items-center justify-between gap-x-1.75 gap-y-1 px-2.25 py-1.5 max-sm:flex-col max-sm:items-start [&:nth-of-type(odd)]:bg-inset',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingRowComponent {
  readonly title = input.required<string>();
  readonly hint = input<string>();
  readonly danger = input(false);
}
