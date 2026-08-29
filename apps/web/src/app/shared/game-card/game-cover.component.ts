import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '@naucto/ui';

import { injectReleaseImage } from '../queries/releases.queries';

/**
 * A published game's cover, resolved from its signed URL, with the design's hatched placeholder
 * when there is none. Used by the hub cards, the "jump back in" rail and the sidebar lists.
 */
@Component({
  selector: 'nc-game-cover',
  imports: [IconComponent],
  template: `
    @if (cover.data(); as url) {
      <img [src]="url" [alt]="alt()" class="pixelated h-full w-full object-cover" loading="lazy" />
    } @else {
      <span
        class="no-cover flex h-full w-full flex-col items-center justify-center gap-0.5 text-ink-4"
      >
        <nc-icon name="image" [size]="iconSize()" />
        @if (label()) {
          <span class="label text-[9px]">{{ label() }}</span>
        }
      </span>
    }
  `,
  host: { class: 'block overflow-hidden border-b border-line' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameCoverComponent {
  readonly releaseId = input.required<number | null>();
  readonly alt = input('');
  /** Shown under the icon on the larger placeholders. */
  readonly label = input<string>();
  readonly iconSize = input<12 | 24 | 48>(24);

  protected readonly cover = injectReleaseImage(() => this.releaseId());
}
