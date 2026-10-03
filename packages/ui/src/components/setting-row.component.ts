import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Settings row: title + hint on the left, the control on the right, hairline below. */
@Component({
  selector: 'nc-setting-row',
  template: `
    <div class="min-w-0">
      <div class="text-ui" [class]="danger() ? 'text-hot-ink' : 'text-ink'">{{ title() }}</div>
      @if (hint()) {
        <div class="text-meta text-ink-3">{{ hint() }}</div>
      }
    </div>
    <div class="flex shrink-0 items-center justify-end gap-1"><ng-content /></div>
  `,
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
