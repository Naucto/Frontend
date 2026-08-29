import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { type IconName } from '../icons/paths';
import { IconComponent } from './icon.component';

/**
 * Centered empty state: icon, title, hint, CTA. The 14px column gap does the spacing, so nothing
 * inside carries a margin — a projected paragraph sits at the same rhythm as the `hint` input.
 */
@Component({
  selector: 'nc-empty-state',
  imports: [IconComponent],
  template: `
    <nc-icon [name]="icon()" [size]="48" class="text-ink-4" />
    <h3 class="text-title text-ink-body">{{ title() }}</h3>
    @if (hint()) {
      <p class="max-w-[420px] text-meta leading-[1.6] text-ink-3">{{ hint() }}</p>
    }
    <ng-content select="[hint]" />
    <ng-content />
  `,
  host: { class: 'flex flex-col items-center justify-center gap-[14px] p-[44px] text-center' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  readonly icon = input.required<IconName>();
  readonly title = input.required<string>();
  readonly hint = input<string>();
}
