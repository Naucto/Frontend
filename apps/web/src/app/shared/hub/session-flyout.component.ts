import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { AvatarComponent, ChipComponent, formatElapsed, IconComponent } from '@naucto/ui';

import type { HubSession } from './hub-game';
import { rosterRows } from './session-roster';

/**
 * What a shelf says of an open session beside its disk: when it started, what the game is, and who
 * is in it, with the seats left. The viewer's own row is theirs to leave.
 */
@Component({
  selector: 'nc-session-flyout',
  imports: [TranslocoDirective, AvatarComponent, ChipComponent, IconComponent],
  templateUrl: './session-flyout.component.html',
  host: { class: 'grid gap-[16px]' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionFlyoutComponent {
  readonly session = input.required<HubSession>();
  /** What the game is, in a line or two. */
  readonly description = input.required<string>();
  /** The signed-in player, when they are one. */
  readonly viewerId = input<number | null>(null);
  readonly leave = output();

  protected readonly rows = computed(() => rosterRows(this.session(), this.viewerId()));
  /** How long ago it started, or nothing for one that just did. */
  protected readonly elapsed = computed(() => {
    const elapsed = formatElapsed(this.session().startedAt);
    return elapsed === 'just now' ? '' : elapsed;
  });
}
