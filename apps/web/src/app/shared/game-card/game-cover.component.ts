import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from '@naucto/ui';

import { injectProjectImage, injectReleaseImage } from '../queries/releases.queries';

/**
 * A game's cover, resolved from its signed URL, with the design's hatched placeholder when there is
 * none.
 */
@Component({
  selector: 'nc-game-cover',
  imports: [IconComponent],
  templateUrl: './game-cover.component.html',
  host: {
    '[class]': '"block overflow-hidden " + (bordered() ? "border-b border-line" : "")',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameCoverComponent {
  /** A published game's cover, readable by anyone. */
  readonly releaseId = input.required<number | null>();
  /** The same game before it ships, readable by whoever may open it. Pass one or the other. */
  readonly projectId = input<number | null>(null);
  readonly alt = input('');
  /** Shown under the icon on the larger placeholders. */
  readonly label = input<string>();
  readonly iconSize = input<12 | 24 | 48>(24);
  /** The rule under a card. A thumbnail small enough to sit in a row has nothing to rule off. */
  readonly bordered = input(true);

  private readonly released = injectReleaseImage(() => this.releaseId());
  private readonly draft = injectProjectImage(() => this.projectId());

  protected readonly url = computed(() => this.released.data() ?? this.draft.data() ?? null);
}
