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
  template: `
    <div *transloco="let t" class="grid gap-3">
      <!-- A shelf opened out is still a shelf, so its heading is the size a shelf heading is on
           the hub. The artboard sets this one at 24px, which read as a different page rather than
           the same row with more of it showing. -->
      <div class="flex items-center gap-1.75">
        <a routerLink="/hub" class="label flex items-center gap-0.5 text-ink-3 hover:text-ink">
          <nc-icon name="arrow-left" [size]="12" />
          {{ t('nav.hub') }}
        </a>
        <h1 class="text-title text-ink">
          {{ row() === 'fresh' ? t('hub.fresh') : t('hub.popular') }}
        </h1>
        <span class="label">{{ total() }} {{ t('hub.games') }}</span>
        <span class="flex-1"></span>
        <nc-segmented
          [options]="sortOptions()"
          [value]="effectiveSort()"
          (valueChange)="setSort($event)"
        />
      </div>
      <nc-hub-row [games]="visible()" [state]="state()" [empty]="t('hub.empty')" />
      @if (visible().length < sorted().length || releases.hasNextPage()) {
        <div class="flex justify-center">
          <button
            ncButton
            variant="secondary"
            (click)="more()"
            [disabled]="releases.isFetchingNextPage()"
          >
            {{ t('hub.showMore', { n: step }) }}
          </button>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeeAllPage {
  readonly row = input<'popular' | 'fresh'>('popular');
  private readonly i18n = inject(TranslocoService);
  protected readonly releases = injectReleasesInfinite(RELEASE_PAGE_SIZE);
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
    const list = this.all().filter((g) =>
      s === 'multiplayer' ? has(g, 'multiplayer') : s === 'solo' ? !has(g, 'multiplayer') : true,
    );
    return list.sort(
      s === 'newest'
        ? SORTERS.publishedAt
        : s === 'mostPlayed'
          ? SORTERS.uniquePlayers
          : SORTERS.viewCount,
    );
  });
  protected readonly visible = computed(() => this.sorted().slice(0, this.limit()));

  protected setSort(s: string | undefined): void {
    if (SORTS.includes(s as Sort)) this.sort.set(s as Sort);
  }

  protected more(): void {
    this.limit.update((n) => n + STEP);
    if (this.limit() > this.all().length && this.releases.hasNextPage())
      void this.releases.fetchNextPage();
  }
}
