import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { diskStyleFor } from '../game-card/disk-style';
import { type FloppyAction, FloppyComponent } from '../game-card/floppy.component';
import type { HubGame } from './hub-game';

/**
 * A game on a shelf: its disk inside the link that opens it. `open` and `flyoutId` are what the
 * shelf hands each item, and make the link say whether its flyout is showing and which it is.
 */
@Component({
  selector: 'nc-shelf-disk',
  imports: [RouterLink, FloppyComponent],
  templateUrl: './shelf-disk.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShelfDiskComponent {
  readonly game = input.required<HubGame>();
  readonly link = input.required<string | readonly unknown[]>();
  readonly action = input<FloppyAction>('play');
  readonly open = input(false);
  readonly flyoutId = input<string | null>(null);

  protected readonly disk = computed(() => diskStyleFor(this.game()));
}
