import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  type Signal,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { unwrap } from '@app/core/api/api-errors';
import { AuthStore } from '@app/core/auth/auth.store';
import { PresenceStore } from '@app/core/presence/presence.store';
import { type PresenceDto } from '@app/core/presence/presence.types';
import { SignedInAction } from '@app/shared/auth/signed-in-action';
import { GameCoverComponent } from '@app/shared/game-card/game-cover.component';
import { qk } from '@app/shared/queries/query-keys';
import {
  injectFeaturedRelease,
  injectFork,
  injectReleaseImage,
  injectReleasesPage,
  type ReleaseQuery,
} from '@app/shared/queries/releases.queries';
import { UserAvatarComponent } from '@app/shared/user-avatar.component';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { projectControllerFindAll, type ProjectExResponseDto } from '@naucto/api-client';
import {
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
import { QueryClient } from '@tanstack/angular-query-experimental';
import { injectQuery } from '@tanstack/angular-query-experimental';

import { FILTER_TAGS, type HubFilter } from './hub-filters';
import { HubRowComponent, type ShelfState } from './hub-row.component';

const SHELF_SIZE = 10;

@Component({
  selector: 'nc-hub-page',
  imports: [
    RouterLink,
    TranslocoDirective,
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
    UserAvatarComponent,
  ],
  templateUrl: './hub.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HubPage {
  /** `?q=` from the top-bar search. */
  readonly q = input<string>();
  /** `?tags=` — comma-separated; a game must carry all of them. */
  readonly tags = input<string>();
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  protected readonly fork = injectFork();
  private readonly presence = inject(PresenceStore);
  private readonly transloco = inject(TranslocoService);
  private readonly signedIn = inject(SignedInAction);
  /** Trimmed `?q=`; empty means the shelves are shown rather than results. */
  protected readonly term = computed(() => this.q()?.trim() ?? '');
  protected readonly tagFilter = computed(() => this.tags()?.trim() ?? '');
  /** Either narrows the shelves down to one row; neither leaves them as they are. */
  protected readonly narrowed = computed(() => this.term() !== '' || this.tagFilter() !== '');
  /**
   * Component state, deliberately: the shelf filter is a look you took at the catalogue, not a
   * setting you made. Leaving the hub ends it, and coming back starts over on every game.
   */
  protected readonly popularFilter = signal<HubFilter>('all');

  constructor() {
    // Refetch on every arrival: the catalogue changes elsewhere in the app, and the cached shelves
    // stay on screen meanwhile.
    void inject(QueryClient).invalidateQueries({ queryKey: qk.releasesAll() });
  }

  protected readonly shelfSize = SHELF_SIZE;
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
    sort: 'popular',
    tags: FILTER_TAGS[this.popularFilter()] ?? undefined,
  }));
  private readonly popularPage = injectReleasesPage(() => 1, SHELF_SIZE, this.popularQuery);
  private readonly freshPage = injectReleasesPage(
    () => 1,
    SHELF_SIZE,
    () => ({ sort: 'fresh' }),
  );
  private readonly searchPage = injectReleasesPage(
    () => 1,
    24,
    (): ReleaseQuery => ({
      ...(this.term() ? { search: this.term() } : {}),
      ...(this.tagFilter() ? { tags: this.tagFilter() } : {}),
    }),
  );

  private readonly featured = injectFeaturedRelease();
  /**
   * The hero is the game of the week, not the head of whichever filter is lit: with nothing
   * featured it takes the most popular game overall and holds it while the shelf is narrowed,
   * rather than swapping on every chip.
   */
  protected readonly hero = linkedSignal<
    { featured: ProjectExResponseDto | null; all: boolean; first: ProjectExResponseDto | null },
    ProjectExResponseDto | null
  >({
    source: () => ({
      featured: this.featured.data() ?? null,
      all: this.popularFilter() === 'all',
      // `items` can be absent: an error response still resolves `data()` to a value.
      first: this.popularPage.data()?.items?.[0] ?? null,
    }),
    computation: ({ featured, all, first }, prev) =>
      featured ?? (all ? first : (prev?.value ?? null)),
  });
  protected readonly heroCover = injectReleaseImage(() => this.hero()?.id ?? null);

  /**
   * A shelf that could not be fetched must not borrow the empty copy, which is a claim about the
   * catalogue.
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
  protected readonly searchState = computed<ShelfState>(() =>
    this.searchPage.isError()
      ? 'error'
      : this.searchPage.isPending() || this.searchPage.isPlaceholderData()
        ? 'pending'
        : 'ready',
  );

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

  protected remix(id: number): void {
    this.signedIn.run(() => {
      this.fork.mutate(id, {
        onSuccess: (r) => void this.router.navigate(['/edit', r.id]),
        onError: () => {
          this.toasts.show(this.transloco.translate('hub.remixFailed'), 'error');
        },
      });
    });
  }

  protected setFilter(f: HubFilter | undefined): void {
    if (f) this.popularFilter.set(f);
  }
}
