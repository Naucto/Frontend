import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  ChipComponent,
  EmptyStateComponent,
  ErrorStateComponent,
  PagerComponent,
  SegmentedComponent,
  SkeletonComponent,
} from '@naucto/ui';

import { CollectionBoxComponent } from '../../shared/hub/collection-box.component';
import {
  COLLECTION_PAGE_SIZE,
  type CollectionSort,
  injectCollectionsPage,
} from '../../shared/queries/collections.queries';

const SORTS: readonly CollectionSort[] = ['popular', 'recent', 'games'];

/** Every public collection, as boxes on a grid: sorted by `?sort=`, a page at a time by `?page=`. */
@Component({
  selector: 'nc-collections-page',
  imports: [
    TranslocoDirective,
    ChipComponent,
    CollectionBoxComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    PagerComponent,
    SegmentedComponent,
    SkeletonComponent,
  ],
  templateUrl: './collections.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class CollectionsPage {
  readonly sort = input<string>();
  readonly page = input<string>();

  protected readonly router = inject(Router);
  private readonly i18n = inject(TranslocoService);

  protected readonly order = computed(
    () => SORTS.find((sort) => sort === this.sort()) ?? 'popular',
  );
  /** The page asked for, from 1; anything that is not a page number is the first. */
  protected readonly number = computed(() => Math.max(1, Math.floor(Number(this.page())) || 1));
  protected readonly query = injectCollectionsPage(this.number, this.order);
  protected readonly pages = computed(() =>
    Math.ceil((this.query.data()?.total ?? 0) / COLLECTION_PAGE_SIZE),
  );
  protected readonly sorts = computed(() =>
    SORTS.map((value) => ({ value, label: this.i18n.translate(`collections.sort.${value}`) })),
  );
  protected readonly placeholders = [0, 1, 2, 3, 4, 5, 6, 7];

  /** The defaults stay out of the address, so `/collections` is the one link to the first page. */
  protected show(sort: CollectionSort, page: number): void {
    void this.router.navigate([], {
      queryParams: { sort: sort === 'popular' ? null : sort, page: page > 1 ? page : null },
    });
  }
}
