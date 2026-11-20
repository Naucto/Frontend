import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  AvatarComponent,
  ChipComponent,
  formatElapsed,
  IconComponent,
  MarkComponent,
} from '@naucto/ui';

import type { HubSession } from './hub-game';
import { rosterRows } from './session-roster';
import { displayName, playerColour } from './session-stickers';

/**
 * What a shelf says of an open session beside its disk: when it started, which game it is, and who
 * is in it, with the seats left. The viewer's own row is theirs to leave.
 */
@Component({
  selector: 'nc-session-flyout',
  imports: [TranslocoDirective, AvatarComponent, ChipComponent, IconComponent, MarkComponent],
  templateUrl: './session-flyout.component.html',
  host: { class: 'grid gap-[16px]' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionFlyoutComponent {
  readonly session = input.required<HubSession>();
  /** The signed-in player's username, when there is one. */
  readonly viewer = input<string | null>(null);
  readonly leave = output();

  protected readonly displayName = displayName;
  protected readonly playerColour = playerColour;
  protected readonly rows = computed(() => rosterRows(this.session(), this.viewer()));
  /** How long ago it started, or nothing for one that just did. */
  protected readonly elapsed = computed(() => {
    const elapsed = formatElapsed(this.session().startedAt);
    return elapsed === 'just now' ? '' : elapsed;
  });
}
