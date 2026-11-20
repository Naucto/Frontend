import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import type { ProjectExResponseDto } from '@naucto/api-client';
import { ButtonDirective, IconComponent, SkeletonComponent } from '@naucto/ui';

import { DISK_RATIO } from '../../shared/game-card/floppy.component';
import { GameDiskComponent } from '../../shared/game-card/game-disk.component';

/** Whether the shelf has its games, is still asking, or could not find out. */
export type ShelfState = 'ready' | 'pending' | 'error';

/** A titled shelf of game disks, five to a row at full width, with a "see all" link and actions. */
@Component({
  selector: 'nc-hub-row',
  imports: [
    RouterLink,
    TranslocoDirective,
    ButtonDirective,
    GameDiskComponent,
    IconComponent,
    SkeletonComponent,
  ],
  templateUrl: './hub-row.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HubRowComponent {
  readonly title = input<string>('');
  readonly games = input.required<ProjectExResponseDto[]>();
  readonly seeAll = input<string | unknown[] | null>(null);
  readonly empty = input('Nothing here yet.');
  /** How many games the shelf has in total, shown beside "see all". */
  readonly count = input(0);
  /** Whether this shelf's disks open the editor rather than the play page. */
  readonly opensEditor = input(false);
  readonly state = input<ShelfState>('ready');
  /**
   * How many cells the shelf keeps whatever it holds, so narrowing it does not change its height;
   * the cells the games do not fill stay, empty, at a disk's geometry.
   */
  readonly reserve = input(0);
  protected readonly DISK_RATIO = DISK_RATIO;
  protected readonly placeholders = [0, 1, 2, 3, 4];
  /** An empty shelf still takes one cell for its copy, so the ghosts start after it. */
  protected readonly ghosts = computed(() =>
    Array.from(
      { length: Math.max(0, this.reserve() - Math.max(1, this.games().length)) },
      (_, i) => i,
    ),
  );
}
