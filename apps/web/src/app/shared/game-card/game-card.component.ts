import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProjectExResponseDto } from '@naucto/api-client';
import { ChipComponent, StatComponent } from '@naucto/ui';

import { UserAvatarComponent } from '../user-avatar.component';
import { GameCoverComponent } from './game-cover.component';

/** Hub card: cover, title, author chips, plays / likes / remixes. */
@Component({
  selector: 'nc-game-card',
  imports: [RouterLink, ChipComponent, GameCoverComponent, StatComponent, UserAvatarComponent],
  templateUrl: './game-card.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameCardComponent {
  readonly game = input.required<ProjectExResponseDto>();
  protected readonly cardClass = computed(() =>
    [
      'group block overflow-hidden border border-line hover:border-line-strong focus-visible:outline-2',
      this.dense() ? 'rounded-sm bg-page' : 'rounded-md bg-panel',
    ].join(' '),
  );
  /** A draft has no release: it takes the project's cover and wears the chip. */
  protected readonly isDraft = computed(() => !this.game().publishedAt);

  /**
   * Lead to the editor instead of the play page: the same published game is played from the hub and
   * opened from its owner's shelf.
   */
  readonly opensEditor = input(false);
  protected readonly link = computed(() =>
    this.opensEditor() ? ['/edit', this.game().id] : ['/play', this.game().id],
  );
  /** Tighter type and padding for the sidebar lists on the play page. */
  readonly dense = input(false, { transform: booleanAttribute });

  /** Collaborators other than the author, who already has the avatar beside their name. */
  private readonly others = computed(() =>
    this.game().collaborators.filter((collaborator) => collaborator.id !== this.game().creator.id),
  );
  protected readonly stacked = computed(() => this.others().slice(0, 2));
  protected readonly extra = computed(() => Math.max(0, this.others().length - 2));
}
