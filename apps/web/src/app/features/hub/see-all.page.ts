import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  injectReleasesPage,
  RELEASE_PAGE_SIZE,
  SORTERS,
} from '@app/shared/queries/releases.queries';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective } from '@naucto/ui';

import { HubRowComponent, type ShelfState } from './hub-row.component';

@Component({
  selector: 'nc-see-all-page',
  imports: [RouterLink, TranslocoDirective, ButtonDirective, HubRowComponent],
  template: `
    <div *transloco="let t" class="grid gap-3">
      <div class="flex items-center gap-2">
        <a routerLink="/hub" class="label text-ink-3 hover:text-ink">← {{ t('nav.hub') }}</a>
        <h1 class="text-display text-ink">
          {{ row() === 'fresh' ? t('hub.fresh') : t('hub.popular') }}
        </h1>
        <span class="label">{{ total() }} {{ t('hub.games') }}</span>
      </div>
      <nc-hub-row [title]="''" [games]="games()" [state]="state()" [empty]="t('hub.empty')" />
      <div class="flex justify-center gap-1">
        <button
          ncButton
          variant="secondary"
          (click)="page.set(page() - 1)"
          [disabled]="page() <= 1"
        >
          ←
        </button>
        <span class="label self-center">{{ page() }} / {{ pages() }}</span>
        <button
          ncButton
          variant="secondary"
          (click)="page.set(page() + 1)"
          [disabled]="page() >= pages()"
        >
          →
        </button>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SeeAllPage {
  readonly row = input<'popular' | 'fresh'>('popular');
  protected readonly page = signal(1);
  private readonly releases = injectReleasesPage(() => this.page(), RELEASE_PAGE_SIZE);
  /** Same three-way split as the hub's shelves: a failed page is not an empty one. */
  protected readonly state = computed<ShelfState>(() =>
    this.releases.isError() ? 'error' : this.releases.isPending() ? 'pending' : 'ready',
  );
  protected readonly total = computed(() => this.releases.data()?.total ?? 0);
  protected readonly pages = computed(() =>
    Math.max(1, Math.ceil(this.total() / RELEASE_PAGE_SIZE)),
  );
  protected readonly games = computed(() =>
    [...(this.releases.data()?.items ?? [])].sort(
      this.row() === 'fresh' ? SORTERS.publishedAt : SORTERS.viewCount,
    ),
  );
}
