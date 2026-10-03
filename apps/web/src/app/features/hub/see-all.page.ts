import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  injectReleasesInfinite,
  RELEASE_PAGE_SIZE,
  SORTERS,
} from '@app/shared/queries/releases.queries';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import type { ProjectExResponseDto } from '@naucto/api-client';
import { ButtonDirective, IconComponent, SegmentedComponent } from '@naucto/ui';

import { HubRowComponent, type ShelfState } from './hub-row.component';

type Sort = 'newest' | 'trending' | 'mostPlayed' | 'multiplayer' | 'solo';
const SORTS: Sort[] = ['newest', 'trending', 'mostPlayed', 'multiplayer', 'solo'];
const STEP = 15;

/** Every game of a hub row, five to a line, with the sort strip and "show more". */
@Component({
  selector: 'nc-see-all-page',
  imports: [
    RouterLink,
    TranslocoDirective,
    ButtonDirective,
    IconComponent,
    SegmentedComponent,
    HubRowComponent,
  ],
  templateUrl: './see-all.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeeAllPage {
  readonly row = input<'popular' | 'fresh'>('popular');
  private readonly i18n = inject(TranslocoService);
  protected readonly releases = injectReleasesInfinite(RELEASE_PAGE_SIZE, () => ({
    sort: this.effectiveSort() === 'newest' ? 'fresh' : 'popular',
    ...(this.effectiveSort() === 'multiplayer' ? { tags: 'multiplayer' } : {}),
  }));
  /** Same three-way split as the hub's shelves: a failed page is not an empty one. */
  protected readonly state = computed<ShelfState>(() =>
    this.releases.isError() ? 'error' : this.releases.isPending() ? 'pending' : 'ready',
  );
  protected readonly step = STEP;
  protected readonly sort = signal<Sort | null>(null);
  protected readonly limit = signal(STEP);
  protected readonly sortOptions = computed(() =>
    SORTS.map((value) => ({ value, label: this.i18n.translate(`hub.sort.${value}`) })),
  );
  protected readonly effectiveSort = computed<Sort>(
    () => this.sort() ?? (this.row() === 'fresh' ? 'newest' : 'trending'),
  );
  private readonly all = computed<ProjectExResponseDto[]>(
    () => this.releases.data()?.pages.flatMap((p) => p.items) ?? [],
  );
  protected readonly total = computed(() => this.releases.data()?.pages[0]?.total ?? 0);
  protected readonly sorted = computed(() => {
    const s = this.effectiveSort();
    const has = (g: ProjectExResponseDto, tag: string): boolean =>
      g.tags.some((x) => x.toLowerCase() === tag);
    // The server has no order by players and no negated tag, so those two stay local.
    if (s === 'mostPlayed') return [...this.all()].sort(SORTERS.uniquePlayers);
    if (s === 'solo') return this.all().filter((g) => !has(g, 'multiplayer'));
    return this.all();
  });
  protected readonly visible = computed(() => this.sorted().slice(0, this.limit()));

  protected setSort(s: string | undefined): void {
    if (SORTS.includes(s as Sort)) this.sort.set(s as Sort);
  }

  protected more(): void {
    this.limit.update((n) => n + STEP);
    if (this.limit() > this.sorted().length && this.releases.hasNextPage())
      void this.releases.fetchNextPage();
  }
}
