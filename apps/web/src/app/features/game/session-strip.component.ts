import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { GameSessionResponseDto } from '@naucto/api-client';
import { ButtonDirective, ChipComponent } from '@naucto/ui';

import { UserAvatarComponent } from '../../shared/user-avatar.component';

/** What is known of the session a visitor came for: it, that it has closed, or nothing yet. */
export type CameFor =
  | { state: 'open'; session: GameSessionResponseDto }
  | { state: 'ended' }
  | { state: 'unknown'; signedOut: boolean };

/**
 * The band over a game that was opened on a session, before the game starts: which session, who
 * hosts it and how full it is, and the way to play without it.
 */
@Component({
  selector: 'nc-session-strip',
  imports: [TranslocoDirective, ButtonDirective, ChipComponent, UserAvatarComponent],
  templateUrl: './session-strip.component.html',
  host: {
    class:
      'mx-auto flex min-h-(--nc-h-bar) max-w-[1600px] flex-wrap items-center gap-x-1.5 gap-y-0.5 ' +
      'border-3 border-b-0 border-line bg-panel px-1.5 py-0.75',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionStripComponent {
  readonly cameFor = input.required<CameFor>();
  readonly signIn = output();
  readonly alone = output();
}
