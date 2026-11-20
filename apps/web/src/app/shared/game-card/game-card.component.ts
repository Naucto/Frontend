import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import type { ProjectExResponseDto } from '@naucto/api-client';
import { ChipComponent, StatComponent } from '@naucto/ui';

import { UserAvatarComponent } from '../user-avatar.component';
import { COVER_RATIO, CoverCardComponent } from './cover-card.component';
import { GameCoverComponent } from './game-cover.component';

@Component({
  selector: 'nc-game-card',
  imports: [
    RouterLink,
    TranslocoDirective,
    ChipComponent,
    CoverCardComponent,
    GameCoverComponent,
    StatComponent,
    UserAvatarComponent,
  ],
  templateUrl: './game-card.component.html',
  host: { class: 'block min-w-0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameCardComponent {
  readonly game = input.required<ProjectExResponseDto>();
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
  readonly dense = input(false, { transform: booleanAttribute });
  protected readonly COVER_RATIO = COVER_RATIO;

  /** Collaborators other than the author, who already has the avatar beside their name. */
  private readonly others = computed(() =>
    this.game().collaborators.filter((collaborator) => collaborator.id !== this.game().creator.id),
  );
  protected readonly stacked = computed(() => this.others().slice(0, 2));
  protected readonly extra = computed(() => Math.max(0, this.others().length - 2));
}
