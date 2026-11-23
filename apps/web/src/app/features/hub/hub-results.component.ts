import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  ButtonDirective,
  ChipComponent,
  EmptyStateComponent,
  ErrorStateComponent,
  IconComponent,
  MarkComponent,
  SegmentedComponent,
  ShelfComponent,
  ShelfFlyoutDirective,
  ShelfItemDirective,
} from '@naucto/ui';

import { GameFlyoutComponent } from '../../shared/hub/game-flyout.component';
import type { HubGame } from '../../shared/hub/hub-game';
import { ShelfDiskComponent } from '../../shared/hub/shelf-disk.component';
import { injectHubResults, type ResultsQuery } from '../../shared/queries/hub.queries';
import { injectReleaseTags, type ReleaseSort } from '../../shared/queries/releases.queries';
import { ShelfSkeletonComponent } from './shelf-skeleton.component';
import { capitalised, shelfTag, shelfTitle } from './shelf-title';

type Order = 'own' | 'played' | 'newest';

/** `own` asks for no sort: a shelf's own order, a search's best match first. */
const SORTS: Record<Order, ReleaseSort | undefined> = {
  own: undefined,
  played: 'popular',
  newest: 'fresh',
};
const TAGS_SUGGESTED = 6;

/**
 * Everything a search, a tag or a shelf holds, in shelves by the first tag of each game, a page at
 * a time. With nothing to show it offers the tags games carry most, and to make the game.
 */
@Component({
  selector: 'nc-hub-results',
  imports: [
    RouterLink,
    TranslocoDirective,
    ButtonDirective,
    ChipComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    GameFlyoutComponent,
    IconComponent,
    MarkComponent,
    SegmentedComponent,
    ShelfComponent,
    ShelfDiskComponent,
    ShelfFlyoutDirective,
    ShelfItemDirective,
    ShelfSkeletonComponent,
  ],
  templateUrl: './hub-results.component.html',
  host: { class: 'grid min-h-[60vh] min-w-0 content-start gap-[24px]' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HubResultsComponent {
  /** What is listed; its `sort` is this view's to choose. */
  readonly query = input.required<ResultsQuery>();

  private readonly transloco = inject(TranslocoService);

  /** What the results are of, and what they are called. */
  protected readonly head = computed(() => {
    const { shelf, search, tags } = this.query();
    const tag = shelf ? shelfTag(shelf) : (tags ?? null);
    if (tag !== null && !search) {
      return {
        kicker: 'tag',
        title: tag
          .split(',')
          .map((one) => `#${one.trim()}`)
          .join(' '),
      };
    }
    return shelf
      ? { kicker: 'shelf', title: shelfTitle(shelf, this.transloco) }
      : { kicker: 'search', title: this.transloco.translate('hub.results.quoted', { q: search }) };
  });

  /** A new search starts over in its own order. */
  protected readonly order = linkedSignal<ResultsQuery, Order>({
    source: this.query,
    computation: () => 'own',
  });
  protected readonly orders = computed(() =>
    (Object.keys(SORTS) as Order[]).map((value) => ({
      value,
      label: this.transloco.translate(
        value === 'own' && this.query().shelf
          ? 'hub.results.sort.shelf'
          : `hub.results.sort.${value}`,
      ),
    })),
  );

  protected readonly pages = injectHubResults(() => ({
    ...this.query(),
    sort: SORTS[this.order()],
  }));
  private readonly games = computed(
    () => this.pages.data()?.pages.flatMap((page) => page.games) ?? [],
  );
  protected readonly total = computed(() => this.pages.data()?.pages[0]?.total ?? 0);
  protected readonly left = computed(() => this.total() - this.games().length);

  /** The games by their first tag, in the order each tag first shows up; the untagged come under none. */
  protected readonly groups = computed(() => {
    const byTag = new Map<string, HubGame[]>();
    for (const game of this.games()) {
      const tag = game.tags[0] ?? '';
      byTag.set(tag, [...(byTag.get(tag) ?? []), game]);
    }
    return [...byTag].map(([tag, games]) => ({
      tag,
      label: tag ? capitalised(tag) : this.transloco.translate('hub.results.untagged'),
      games,
    }));
  });

  protected readonly suggested = injectReleaseTags(
    TAGS_SUGGESTED,
    () => this.pages.isSuccess() && this.total() === 0,
  );
}
