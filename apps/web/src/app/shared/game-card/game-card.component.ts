import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import type { ProjectExResponseDto } from '@naucto/api-client';
import { ChipComponent, colourOf, StatComponent } from '@naucto/ui';

import { injectProjectImage, injectReleaseImage } from '../queries/releases.queries';
import { UserAvatarComponent } from '../user-avatar.component';
import { FloppyComponent } from './floppy.component';

/** Hub card: the game as a disk, its name, author chips, plays / likes / remixes. */
@Component({
  selector: 'nc-game-card',
  imports: [
    RouterLink,
    TranslocoDirective,
    ChipComponent,
    FloppyComponent,
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
  /** A row with the disk as its thumbnail, for the sidebar lists on the play page. */
  readonly dense = input(false, { transform: booleanAttribute });

  /** A game has no colour of its own, so its disk takes one that is stable for its id. */
  protected readonly body = computed(() => colourOf(this.game().id));

  private readonly released = injectReleaseImage(() => (this.isDraft() ? null : this.game().id));
  private readonly draft = injectProjectImage(() => (this.isDraft() ? this.game().id : null));
  protected readonly cover = computed(() => this.released.data() ?? this.draft.data() ?? null);

  /** Whether the keyboard is on the card, which opens the disk the way the pointer does. */
  protected readonly focused = signal(false);

  /** Collaborators other than the author, who already has the avatar beside their name. */
  private readonly others = computed(() =>
    this.game().collaborators.filter((collaborator) => collaborator.id !== this.game().creator.id),
  );
  protected readonly stacked = computed(() => this.others().slice(0, 2));
  protected readonly extra = computed(() => Math.max(0, this.others().length - 2));
}
