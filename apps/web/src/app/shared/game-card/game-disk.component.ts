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

import { injectProjectImage, injectReleaseImage } from '../queries/releases.queries';
import { DiskNameComponent } from './disk-name.component';
import { type DiskStyle, diskStyleFor } from './disk-style';
import { FloppyComponent } from './floppy.component';

/**
 * A game as the link to it: its disk over its name, or with `dense` a small disk beside its name
 * and counts. A published game is played; a draft opens in the editor.
 */
@Component({
  selector: 'nc-game-disk',
  imports: [
    RouterLink,
    TranslocoDirective,
    ChipComponent,
    DiskNameComponent,
    FloppyComponent,
    StatComponent,
  ],
  templateUrl: './game-disk.component.html',
  host: { class: 'block min-w-0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameDiskComponent {
  readonly game = input.required<ProjectExResponseDto & { disk?: DiskStyle | null }>();
  /** A draft has no release: it takes the project's cover and wears the chip. */
  protected readonly isDraft = computed(() => !this.game().publishedAt);
  protected readonly link = computed(() => [this.isDraft() ? '/edit' : '/play', this.game().id]);
  readonly dense = input(false, { transform: booleanAttribute });

  protected readonly disk = computed(() => diskStyleFor(this.game()));
  private readonly released = injectReleaseImage(() => (this.isDraft() ? null : this.game().id));
  private readonly draft = injectProjectImage(() => (this.isDraft() ? this.game().id : null));
  protected readonly cover = computed(() => this.released.data() ?? this.draft.data() ?? null);
}
