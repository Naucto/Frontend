import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StatComponent } from '@naucto/ui';

import { type FloppyAction, FloppyComponent } from '../game-card/floppy.component';
import type { HubGame, HubSession } from './hub-game';

/**
 * A game on a shelf: its disk inside the link that opens it. `open` and `flyoutId` are what the
 * shelf hands each item, and make the link say whether its flyout is showing and which it is.
 */
@Component({
  selector: 'nc-shelf-disk',
  imports: [RouterLink, FloppyComponent, StatComponent],
  templateUrl: './shelf-disk.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShelfDiskComponent {
  readonly game = input.required<HubGame>();
  readonly link = input.required<string | readonly unknown[]>();
  readonly action = input<FloppyAction>('play');
  readonly actionLabel = input('');
  readonly open = input(false);
  readonly flyoutId = input<string | null>(null);
  /** The session this disk is an invitation to, when it stands for one rather than for the game. */
  readonly session = input<HubSession | null>(null);
}
