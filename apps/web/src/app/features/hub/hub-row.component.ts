import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameCardComponent } from '@app/shared/game-card/game-card.component';
import { TranslocoDirective } from '@jsverse/transloco';
import type { ProjectExResponseDto } from '@naucto/api-client';
import { IconComponent, SkeletonComponent, StatComponent } from '@naucto/ui';

/** Whether the shelf has its games, is still asking, or could not find out. */
export type ShelfState = 'ready' | 'pending' | 'error';

/** A titled shelf of game cards, five to a row at full width, with a "see all" link and actions. */
@Component({
  selector: 'nc-hub-row',
  imports: [
    RouterLink,
    TranslocoDirective,
    GameCardComponent,
    IconComponent,
    SkeletonComponent,
    StatComponent,
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
  /** Whether this shelf's cards open the editor rather than the play page. */
  readonly opensEditor = input(false);
  readonly state = input<ShelfState>('ready');
  /**
   * How many cells the shelf keeps whatever it holds, so narrowing it does not change its height;
   * the cells the games do not fill stay, invisible, at a card's geometry.
   */
  readonly reserve = input(0);
  protected readonly placeholders = [0, 1, 2, 3, 4];
  /** An empty shelf still takes one cell for its copy, so the ghosts start after it. */
  protected readonly ghosts = computed(() =>
    Array.from(
      { length: Math.max(0, this.reserve() - Math.max(1, this.games().length)) },
      (_, i) => i,
    ),
  );
}
