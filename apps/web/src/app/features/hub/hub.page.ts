import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type Signal,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { unwrap } from '@app/core/api/api-errors';
import { AuthStore } from '@app/core/auth/auth.store';
import { PresenceStore } from '@app/core/presence/presence.store';
import { type PresenceDto } from '@app/core/presence/presence.types';
import { GameCoverComponent } from '@app/shared/game-card/game-cover.component';
import { qk } from '@app/shared/queries/query-keys';
import {
  injectFeaturedRelease,
  injectFork,
  injectReleaseImage,
  injectReleasesPage,
  type ReleaseQuery,
} from '@app/shared/queries/releases.queries';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { projectControllerFindAll, type ProjectExResponseDto } from '@naucto/api-client';
import {
  AvatarComponent,
  ButtonDirective,
  EmptyStateComponent,
  ErrorStateComponent,
  formatCount,
  IconComponent,
  PanelComponent,
  RelativeTimePipe,
  SegmentedComponent,
  SkeletonComponent,
  ToastService,
} from '@naucto/ui';
import { injectQuery } from '@tanstack/angular-query-experimental';

import { FILTER_TAGS, type HubFilter, HubFiltersStore } from './hub-filters.store';
import { HubRowComponent, type ShelfState } from './hub-row.component';

const SHELF_SIZE = 10;

@Component({
  selector: 'nc-hub-page',
  imports: [
    RouterLink,
    TranslocoDirective,
    AvatarComponent,
    ButtonDirective,
    EmptyStateComponent,
    ErrorStateComponent,
    SkeletonComponent,
    GameCoverComponent,
    IconComponent,
    PanelComponent,
    RelativeTimePipe,
    SegmentedComponent,
    HubRowComponent,
  ],
  template: `
    <div *transloco="let t" class="grid gap-3.5">
      @if (term()) {
        @if (searchResults().length) {
          <nc-hub-row
            [title]="t('hub.results', { q: term() })"
            [games]="searchResults()"
            [count]="searchTotal()"
          />
        } @else {
          <nc-empty-state
            class="py-12"
            icon="search"
            [title]="t('hub.noMatch')"
            [hint]="t('hub.noMatchHint', { q: term() })"
          >
            <a ncButton variant="primary" routerLink="/games/new">
              <nc-icon name="plus" [size]="12" />
              {{ t('hub.makeIt') }}
            </a>
          </nc-empty-state>
        }
      } @else {
        <div class="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_300px]">
          @if (hero(); as g) {
            <div
              class="relative min-h-[180px] overflow-hidden rounded-md border border-line bg-inset md:min-h-[300px]"
            >
              <!-- A hero with no cover takes the same hatch a coverless card does; a flat
                   rectangle under a gradient reads as a broken image. -->
              <a
                [routerLink]="['/play', g.id]"
                class="absolute inset-0"
                [class.no-cover]="!heroCover.data()"
                [attr.aria-label]="g.name"
              >
                @if (heroCover.data(); as url) {
                  <img [src]="url" alt="" class="pixelated h-full w-full object-cover" />
                }
              </a>
              <!-- The scrim is a fixed dark wash, not the page colour: the title over it is
                   --color-on-accent-dark in both themes, so a scrim that followed the theme put
                   near-white ink on a near-white ground in daylight. It also replaces the opacity
                   the cover used to carry, which washed the art out instead of darkening it. -->
              <div
                class="pointer-events-none absolute inset-0 flex flex-col justify-end bg-[image:var(--nc-scrim-hero)] p-3"
              >
                <!-- Everything in here sits on the fixed dark scrim, so it takes the fixed
                     "ink on a colour" family rather than the page's theme-aware inks: gold-ink and
                     ink-2 both go dark in daylight, which put dark text on a dark wash. -->
                <div class="label mb-[9px] text-gold">{{ t('hub.gameOfTheWeek') }}</div>
                <div
                  class="mb-1 text-[22px] leading-[1.1] tracking-[0.03em] text-on-accent-dark md:text-hero"
                >
                  {{ g.name }}
                </div>
                <!-- The byline is a step up from meta here: the design sets it at 12px so the
                     "· remixable" it carries is readable rather than fine print. -->
                <div class="text-body tracking-[0.02em] text-on-accent-dark/75">
                  {{ t('hub.by', { name: g.creator.username }) }} · {{ plays(g.viewCount) }}
                  {{ t('hub.plays') }}
                  @if (g.tags.includes('remixable')) {
                    · {{ t('hub.remixable') }}
                  }
                </div>
                <div class="pointer-events-auto mt-2 flex gap-1">
                  <a ncButton variant="run" size="hero" [routerLink]="['/play', g.id]">
                    <nc-icon name="play" [size]="12" />
                    {{ t('hub.play') }}
                  </a>
                  <button
                    ncButton
                    variant="secondary"
                    size="hero"
                    (click)="remix(g.id, $event)"
                    [disabled]="!auth.isAuthenticated() || fork.isPending()"
                  >
                    {{ t('hub.remix') }}
                  </button>
                </div>
              </div>
            </div>
          } @else {
            <!-- No hero and no explanation used to be an empty bordered box, which reads as a
                 broken image rather than as "still asking" or "could not ask". -->
            @if (popularState() === 'error') {
              <div
                class="flex min-h-[180px] items-center justify-center rounded-md border border-line bg-panel md:min-h-[300px]"
              >
                <nc-error-state
                  [title]="t('hub.heroErrorTitle')"
                  [hint]="t('hub.rowError')"
                  [retryLabel]="t('game.retry')"
                  (retry)="retryShelves()"
                />
              </div>
            } @else {
              <nc-skeleton
                class="min-h-[180px] md:min-h-[300px]"
                height="100%"
                radius="rounded-md"
              />
            }
          }

          <!-- One panel, the height of the hero, with the CTA on its bottom edge. -->
          <nc-panel class="flex flex-col md:h-[300px]">
            <span class="label shrink-0">{{ t('hub.jumpBackIn') }}</span>
            <!-- One row, the way the artboard draws it: the game you were last building, not a
                 scroller of games you played. Five rows in a 300px panel is what used to crowd
                 FRIENDS PLAYING out against its own CTA. -->
            <div class="mt-1 min-h-0 shrink-0">
              @if (lastEdited(); as g) {
                <a [routerLink]="['/edit', g.id]" class="group flex items-center gap-[11px]">
                  <nc-game-cover
                    class="h-[45px] w-[80px] shrink-0 rounded-xs"
                    [releaseId]="g.id"
                    [iconSize]="12"
                  />
                  <span class="min-w-0">
                    <span class="block truncate text-body text-ink group-hover:text-gold-ink">
                      {{ g.name }}
                    </span>
                    <span class="label tracking-button text-ink-4">
                      {{ t('hub.editedAgo', { when: g.updatedAt | ncRelativeTime }) }}
                    </span>
                  </span>
                </a>
              } @else {
                <p class="text-meta text-ink-3">{{ t('hub.nothingEdited') }}</p>
              }
            </div>

            @if (auth.isAuthenticated()) {
              <span class="label mt-2 shrink-0">{{ t('hub.friendsPlaying') }}</span>
              <div class="mt-1 grid shrink-0 gap-1">
                @for (p of friendsPlaying(); track p.userId) {
                  <a
                    [routerLink]="p.releaseId ? ['/play', p.releaseId] : ['/friends']"
                    class="flex items-center gap-1 text-meta text-ink-body hover:text-ink"
                  >
                    <nc-avatar
                      [name]="p.username ?? '?'"
                      [id]="p.userId"
                      [size]="20"
                      class="shrink-0"
                    />
                    <span class="truncate">
                      {{ p.nickname ?? p.username }} {{ verb(p) }}
                      <span class="text-ink">{{ p.title }}</span>
                    </span>
                  </a>
                } @empty {
                  <p class="text-meta text-ink-3">{{ t('hub.friendsEmpty') }}</p>
                }
              </div>
              <!-- The gap lives on a wrapper, not the button: the auto top margin is what pins
                   the CTA to the panel's bottom edge, and when the list above fills the panel that
                   margin resolves to zero — the empty-state sentence ended up sitting flush on top
                   of the button. -->
              <div class="mt-2 shrink-0 md:mt-auto md:pt-2">
                <a
                  ncButton
                  variant="secondary"
                  size="md"
                  routerLink="/friends"
                  class="w-full justify-center"
                >
                  {{ t('hub.seeAllFriends') }}
                </a>
              </div>
            }
          </nc-panel>
        </div>

        <nc-hub-row
          [title]="t('hub.popular')"
          [games]="popular()"
          [state]="popularState()"
          [count]="popularTotal()"
          [seeAll]="['/hub/all', 'popular']"
          [empty]="t('hub.empty')"
        >
          <nc-segmented
            actions
            variant="chips"
            [options]="filterOptions"
            [value]="filters.popular()"
            (valueChange)="setFilter($event)"
            label="Filter"
          />
        </nc-hub-row>
        <nc-hub-row
          [title]="t('hub.fresh')"
          [games]="fresh()"
          [state]="freshState()"
          [seeAll]="['/hub/all', 'fresh']"
          [empty]="t('hub.empty')"
        />
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HubPage {
  /** `?q=` from the top-bar search. */
  readonly q = input<string>();
  /** Trimmed `?q=`; empty means the shelves are shown rather than results. */
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  protected readonly fork = injectFork();
  protected readonly filters = inject(HubFiltersStore);
  private readonly presence = inject(PresenceStore);
  private readonly transloco = inject(TranslocoService);
  protected readonly term = computed(() => this.q()?.trim() ?? '');
  private readonly page = signal(1);

  protected readonly filterOptions = [
    { value: 'all', label: 'All' },
    { value: 'arcade', label: 'Arcade' },
    { value: 'puzzle', label: 'Puzzle' },
    { value: 'multiplayer', label: 'Multiplayer' },
    { value: 'remixable', label: 'Remixable' },
  ] as const;

  // Each shelf is its own server-side query: "fresh" really is the newest game, not the newest of
  // whatever page happened to load.
  private readonly popularQuery = computed<ReleaseQuery>(() => ({
    sort: 'trending',
    tag: FILTER_TAGS[this.filters.popular()] ?? undefined,
  }));
  private readonly popularPage = injectReleasesPage(() => 1, SHELF_SIZE, this.popularQuery);
  private readonly freshPage = injectReleasesPage(
    () => 1,
    SHELF_SIZE,
    () => ({ sort: 'newest' }),
  );
  private readonly searchPage = injectReleasesPage(
    () => this.page(),
    24,
    (): ReleaseQuery => ({ q: this.term() }),
  );

  private readonly featured = injectFeaturedRelease();
  protected readonly hero = computed(
    // `?.items?.[0]`, not `?.items[0]`: an error response still resolves `data()` to a value whose
    // `items` is absent, and indexing it threw inside the computed on every hub render.
    () => this.featured.data() ?? this.popularPage.data()?.items?.[0] ?? null,
  );
  protected readonly heroCover = injectReleaseImage(() => this.hero()?.id ?? null);

  /**
   * A shelf that could not be fetched must not borrow the empty copy. "No games yet — be the
   * first." is a claim about the platform, and an outage was making the app state it confidently.
   */
  private readonly shelfState = (q: {
    isPending: () => boolean;
    isError: () => boolean;
  }): Signal<ShelfState> =>
    computed<ShelfState>(() => (q.isError() ? 'error' : q.isPending() ? 'pending' : 'ready'));
  protected readonly popularState = this.shelfState(this.popularPage);

  protected retryShelves(): void {
    void this.popularPage.refetch();
    void this.freshPage.refetch();
    void this.featured.refetch();
  }
  protected readonly freshState = this.shelfState(this.freshPage);
  protected readonly searchState = this.shelfState(this.searchPage);

  protected readonly popular = computed(() => this.popularPage.data()?.items ?? []);
  protected readonly popularTotal = computed(() => this.popularPage.data()?.total ?? 0);
  protected readonly fresh = computed(() => this.freshPage.data()?.items ?? []);
  protected readonly searchResults = computed(() => this.searchPage.data()?.items ?? []);
  protected readonly searchTotal = computed(() => this.searchPage.data()?.total ?? 0);

  /**
   * The one project you touched last. `/projects` already orders by `updatedAt` desc, so a page of
   * one is exactly the row the panel wants -- no sorting here, and no fetching a hundred to use one.
   */
  private readonly lastEditedQuery = injectQuery(() => ({
    queryKey: qk.myProjects({ page: 1, limit: 1 }),
    enabled: this.auth.isAuthenticated(),
    queryFn: async () => unwrap(await projectControllerFindAll({ query: { page: 1, limit: 1 } })),
  }));
  protected readonly lastEdited = computed<ProjectExResponseDto | null>(
    () => this.lastEditedQuery.data()?.projects?.[0] ?? null,
  );

  protected readonly friendsPlaying = computed(() =>
    this.presence
      .active()
      .filter((p) => p.title)
      .slice(0, 3),
  );

  protected plays(n: number): string {
    return formatCount(n);
  }

  protected verb(p: PresenceDto): string {
    if (p.kind === 'HOSTING') return 'hosts';
    if (p.kind === 'BUILDING') return 'is building';
    return 'is in';
  }

  protected remix(id: number, e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    this.fork.mutate(id, {
      onSuccess: (r) => void this.router.navigate(['/edit', r.id]),
      onError: () => {
        this.toasts.show(this.transloco.translate('hub.remixFailed'), 'error');
      },
    });
  }

  protected setFilter(f: HubFilter | undefined): void {
    if (f) this.filters.setPopular(f);
  }
}
