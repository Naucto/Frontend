import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ChipComponent, StatComponent } from '@naucto/ui';

import type { HubGame } from './hub-game';

/** What a shelf says of a game beside its disk: its name, what it is, how much it is played, its tags. */
@Component({
  selector: 'nc-game-flyout',
  imports: [ChipComponent, StatComponent],
  templateUrl: './game-flyout.component.html',
  host: { class: 'grid gap-[16px]' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameFlyoutComponent {
  readonly game = input.required<HubGame>();
}
