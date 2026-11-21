import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FitTextDirective } from '@naucto/ui';

/**
 * A game's name under its disk, where nothing beside the disk says it: one line, narrowed to the
 * disk's width, then cut.
 */
@Component({
  selector: 'nc-disk-name',
  template: `
    <span class="inline-block origin-left truncate align-top">
      <ng-content />
    </span>
  `,
  hostDirectives: [FitTextDirective],
  host: {
    class: 'mt-[9px] block overflow-hidden text-center text-body text-ink whitespace-nowrap',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiskNameComponent {}
