import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { type IconName } from '../icons/paths';
import { ButtonDirective } from './button.directive';
import { IconComponent } from './icon.component';

/**
 * A request that failed, said out loud.
 *
 * This is deliberately *not* `nc-empty-state` with a flag: "there is nothing here" and "we could not
 * find out whether there is anything here" are different facts, and collapsing them is how an outage
 * ends up rendering as "No games yet — be the first." It shares the empty state's 420px column so the
 * two read at the same rhythm, and adds what an error needs: a live region, a hot icon when the
 * failure is hard, and a retry.
 */
@Component({
  selector: 'nc-error-state',
  imports: [IconComponent, ButtonDirective],
  template: `
    <nc-icon
      [name]="icon()"
      [size]="48"
      [class]="tone() === 'hot' ? 'text-hot-ink' : 'text-ink-4'"
    />
    <h3 class="text-title text-ink-body">{{ title() }}</h3>
    @if (hint()) {
      <p class="max-w-[420px] text-meta leading-[1.6] text-ink-3">{{ hint() }}</p>
    }
    <ng-content select="[hint]" />
    @if (retryLabel(); as label) {
      <button ncButton variant="secondary" (click)="retry.emit()">{{ label }}</button>
    }
    <ng-content />
  `,
  host: {
    class: 'flex flex-col items-center justify-center gap-[14px] p-[44px] text-center',
    role: 'alert',
    'aria-live': 'polite',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorStateComponent {
  readonly icon = input<IconName>('alert');
  readonly title = input.required<string>();
  readonly hint = input<string>();
  /** Renders the retry button when set; the caller owns what retrying means. */
  readonly retryLabel = input<string>();
  /** `hot` for a hard failure, `neutral` for one the reader can shrug at. */
  readonly tone = input<'neutral' | 'hot'>('hot');
  readonly retry = output();
}
