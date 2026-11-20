import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { diskStyleFor } from '../game-card/disk-style';
import { FloppyComponent } from '../game-card/floppy.component';
import type { HubSession } from './hub-game';
import { sessionStickers } from './session-stickers';

/**
 * An open session on a shelf: its game's disk wearing its players as stickers, inside the link to
 * the game. While the viewer is out and a seat is left, the disk's action is to join, which is
 * `joined` and not the link. `open` and `flyoutId` are what the shelf hands each item.
 */
@Component({
  selector: 'nc-session-disk',
  imports: [RouterLink, FloppyComponent],
  templateUrl: './session-disk.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionDiskComponent {
  readonly session = input.required<HubSession>();
  readonly link = input.required<string | readonly unknown[]>();
  /** The signed-in player's username, when there is one. */
  readonly viewer = input<string | null>(null);
  readonly open = input(false);
  readonly flyoutId = input<string | null>(null);
  readonly joined = output();

  protected readonly disk = computed(() => diskStyleFor({ id: this.session().projectId }));
  protected readonly stickers = computed(() => sessionStickers(this.session(), this.viewer()));
  protected readonly joinable = computed(
    () =>
      this.session().playerCount < this.session().maxPlayers &&
      !this.session().roster.some((player) => player.username === this.viewer()),
  );
}
