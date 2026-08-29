import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { unwrap } from '@app/core/api/api-errors';
import { friendsApi, usersApi } from '@app/core/api/planned.api';
import { AuthStore } from '@app/core/auth/auth.store';
import { PresenceStore } from '@app/core/presence/presence.store';
import { HubRowComponent } from '@app/features/hub/hub-row.component';
import { injectReleasesPage } from '@app/shared/queries/releases.queries';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  type ProjectExResponseDto,
  userPublicControllerGetLikedGames,
  userPublicControllerGetPublicProfileByUsername,
  userPublicControllerGetPublishedGames,
} from '@naucto/api-client';
import {
  AvatarComponent,
  ButtonDirective,
  EmptyStateComponent,
  formatCompact,
  IconComponent,
  SegmentedComponent,
  StatComponent,
  ToastService,
} from '@naucto/ui';
import { injectMutation, injectQuery } from '@tanstack/angular-query-experimental';

type Shelf = 'games' | 'liked' | 'collabs' | 'remixes';

/**
 * Fields the profile DTO grows in the backend stack: `createdAt` for the joined year, and the
 * three totals so the header does not have to sum a page of games to show them. Read optionally
 * until every deployment serves them.
 */
interface ProfileExtras {
  createdAt?: string;
  gameCount?: number;
  totalPlays?: number;
  totalLikes?: number;
}

/** Profile — a shelf, not a social feed. */
@Component({
  selector: 'nc-profile-page',
  imports: [
    RouterLink,
    TranslocoDirective,
    AvatarComponent,
    ButtonDirective,
    EmptyStateComponent,
    IconComponent,
    SegmentedComponent,
    StatComponent,
    HubRowComponent,
  ],
  template: `
    <div *transloco="let t" class="grid gap-3">
      @if (profile.data(); as p) {
        <!-- Full-bleed banner: the shell pads the page, so the bleed has to undo exactly that
             padding at each breakpoint rather than a fixed guess. -->
        <div
          class="relative -mx-2 -mt-2 h-[220px] overflow-hidden bg-inset md:-mx-3 md:-mt-3"
          [class.no-cover]="!p.backgroundImageUrl"
        >
          @if (p.backgroundImageUrl) {
            <img [src]="p.backgroundImageUrl" alt="" class="pixelated h-full w-full object-cover" />
          }
          <span
            class="absolute inset-0"
            style="background:linear-gradient(to bottom,color-mix(in srgb,var(--color-page) 10%,transparent) 0%,color-mix(in srgb,var(--color-page) 55%,transparent) 55%,var(--color-page) 100%)"
          ></span>
        </div>
        <!-- Positioned, so it paints above the banner it overlaps. The banner is positioned for
             its scrim, and a positioned element covers a static sibling whatever the DOM order —
             which left the display name hidden behind it. Ordering, not a z-index. -->
        <div class="relative -mt-6 flex flex-wrap items-start gap-2">
          <nc-avatar
            class="rounded-sm border border-line-strong"
            [name]="p.nickname || p.username"
            [src]="p.profileImageUrl ?? undefined"
            [id]="p.id"
            [size]="88"
          />
          <!-- Wide enough that the bio reads as a sentence rather than a column of two words;
               past that the stats wrap under instead of squeezing it. -->
          <div class="min-w-[220px] flex-1">
            <h1 class="text-display text-ink">{{ p.nickname || p.username }}</h1>
            <!-- One line, the way the design writes it: what this person says about themselves,
                 then the year they arrived. The handle is in the address bar. -->
            <div class="mt-[6px] max-w-[560px] text-body tracking-[0.02em] text-ink-3">
              {{ p.description || '@' + p.username }}
              @if (joined(); as year) {
                · {{ t('profile.joined', { year: year }) }}
              }
            </div>
            @if (presenceLine(); as line) {
              <div class="mt-0.5 flex items-center gap-0.5 text-meta text-jade-ink">
                <span class="inline-block h-1 w-1 bg-jade"></span>
                {{ line }}
              </div>
            }
          </div>
          <div class="flex flex-col items-end gap-1">
            <div class="flex gap-2">
              <nc-stat icon="grid" [value]="counts().games" [label]="t('profile.games')" compact />
              <nc-stat icon="play" [value]="counts().plays" [label]="t('profile.plays')" compact />
              <nc-stat
                icon="heart"
                [value]="counts().likes"
                [label]="t('profile.likes')"
                iconClass="text-hot-ink"
                compact
              />
            </div>
            @if (isSelf()) {
              <a ncButton variant="secondary" size="sm" routerLink="/settings">
                {{ t('profile.edit') }}
              </a>
            } @else if (auth.isAuthenticated()) {
              <!-- The button reads the real friendship, so reloading the page does not offer to
                   befriend someone who is already a friend. -->
              @if (friendship() === 'FRIENDS') {
                <span class="label flex items-center gap-0.5 text-jade-ink">
                  <nc-icon name="check" [size]="12" />
                  {{ t('profile.friends') }}
                </span>
              } @else {
                <button
                  ncButton
                  variant="primary"
                  size="sm"
                  (click)="addFriend(p.id)"
                  [disabled]="
                    adding.isPending() || adding.isSuccess() || friendship() === 'PENDING'
                  "
                >
                  <nc-icon name="plus" [size]="12" />
                  {{
                    adding.isSuccess() || friendship() === 'PENDING'
                      ? t('profile.pending')
                      : t('profile.addFriend')
                  }}
                </button>
              }
            }
          </div>
        </div>
        <nc-segmented
          variant="chips"
          [options]="shelves()"
          [value]="shelf()"
          (valueChange)="setShelf($event)"
        />
        @if (current().length) {
          <nc-hub-row [games]="current()" [drafts]="false" />
        } @else {
          <nc-empty-state
            class="py-12"
            icon="device-tv"
            [title]="t('profile.empty.' + shelf() + 'Title')"
            [hint]="t('profile.empty.' + shelf() + 'Hint')"
          >
            @if (isSelf()) {
              <a ncButton variant="primary" routerLink="/games/new">
                <nc-icon name="plus" [size]="12" />
                {{ t('nav.newGame') }}
              </a>
            }
          </nc-empty-state>
        }
      } @else if (profile.isError()) {
        <nc-empty-state class="py-12" icon="user" [title]="t('profile.notFound')" />
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePage {
  readonly username = input.required<string>();
  protected readonly auth = inject(AuthStore);
  private readonly toasts = inject(ToastService);
  private readonly presence = inject(PresenceStore);
  private readonly transloco = inject(TranslocoService);
  protected readonly shelf = signal<Shelf>('games');

  protected readonly profile = injectQuery(() => ({
    queryKey: ['profile', this.username()],
    queryFn: async () =>
      unwrap(
        await userPublicControllerGetPublicProfileByUsername({
          path: { username: this.username() },
        }),
      ).data,
    retry: false,
  }));
  private readonly userId = computed(() => this.profile.data()?.id ?? 0);
  private readonly published = injectQuery(() => ({
    queryKey: ['profile', this.userId(), 'games'],
    enabled: this.userId() > 0,
    queryFn: async () =>
      unwrap(
        await userPublicControllerGetPublishedGames({
          path: { id: this.userId() },
          query: { page: 1, limit: 100 },
        }),
      ),
  }));
  private readonly liked = injectQuery(() => ({
    queryKey: ['profile', this.userId(), 'liked'],
    enabled: this.userId() > 0,
    queryFn: async () =>
      unwrap(await userPublicControllerGetLikedGames({ path: { id: this.userId() } })),
  }));
  /**
   * COLLABS and REMIXES have dedicated endpoints; until every deployment has them, the shelves
   * fall back to deriving what they can from the first page of releases rather than showing
   * nothing. `injectReleasesPage` is the fallback source, not the primary one.
   */
  private readonly all = injectReleasesPage(() => 1, 48);
  private readonly collabsQuery = injectQuery(() => ({
    queryKey: ['profile', this.userId(), 'collabs'],
    enabled: this.userId() > 0,
    retry: false,
    queryFn: () => usersApi.collaborations(this.userId()),
  }));
  private readonly remixesQuery = injectQuery(() => ({
    queryKey: ['profile', this.userId(), 'remixes'],
    enabled: this.userId() > 0,
    retry: false,
    queryFn: () => usersApi.remixes(this.userId()),
  }));
  private readonly friendshipQuery = injectQuery(() => ({
    queryKey: ['friendship', this.userId()],
    enabled: this.userId() > 0 && this.auth.isAuthenticated() && !this.isSelf(),
    retry: false,
    queryFn: () => friendsApi.friendship(this.userId()),
  }));
  protected readonly adding = injectMutation(() => ({
    mutationFn: (userId: number) => friendsApi.send({ userId }),
    onError: (e: Error) => {
      this.toasts.show(e.message, 'error');
    },
  }));

  protected readonly isSelf = computed(() => this.auth.user()?.username === this.username());
  protected readonly games = computed<ProjectExResponseDto[]>(() => this.published.data() ?? []);
  protected readonly likedGames = computed<ProjectExResponseDto[]>(() => this.liked.data() ?? []);
  protected readonly collabs = computed<ProjectExResponseDto[]>(
    () =>
      this.collabsQuery.data() ??
      (this.all.data()?.items ?? []).filter((g) =>
        g.collaborators.some((c) => c.id === this.userId()),
      ),
  );
  protected readonly remixes = computed<ProjectExResponseDto[]>(() => {
    const served = this.remixesQuery.data();
    if (served) return served;
    const mine = new Set(this.games().map((g) => g.id));
    return (this.all.data()?.items ?? []).filter((g) => g.forkedFromId && mine.has(g.forkedFromId));
  });
  /** Totals come from the profile when it carries them; otherwise they are summed here. */
  private readonly extras = computed<ProfileExtras>(
    () => (this.profile.data() ?? {}) as ProfileExtras,
  );
  protected readonly counts = computed(() => {
    const p = this.extras();
    return {
      games: p?.gameCount ?? this.games().length,
      plays: p?.totalPlays ?? this.games().reduce((n, g) => n + g.viewCount, 0),
      likes: p?.totalLikes ?? this.games().reduce((n, g) => n + g.likes, 0),
    };
  });
  protected readonly joined = computed(() => {
    const at = this.extras().createdAt;
    return at ? new Date(at).getFullYear() : null;
  });
  protected readonly friendship = computed(() => this.friendshipQuery.data()?.status ?? 'NONE');
  protected readonly presenceLine = computed(() => {
    const p = this.presence.of(this.userId());
    if (!p || p.kind === 'IDLE') return '';
    const verb = p.kind === 'PLAYING' ? 'playing' : p.kind === 'BUILDING' ? 'building' : 'hosting';
    return p.title ? `${this.transloco.translate(`friends.${verb}`)} ${p.title}` : '';
  });
  protected readonly shelves = computed(() => [
    { value: 'games' as const, label: `Games ${formatCompact(this.counts().games)}` },
    { value: 'liked' as const, label: `Liked ${formatCompact(this.likedGames().length)}` },
    { value: 'collabs' as const, label: `Collabs ${formatCompact(this.collabs().length)}` },
    { value: 'remixes' as const, label: `Remixes ${formatCompact(this.remixes().length)}` },
  ]);
  protected readonly current = computed(() =>
    this.shelf() === 'games'
      ? this.games()
      : this.shelf() === 'liked'
        ? this.likedGames()
        : this.shelf() === 'collabs'
          ? this.collabs()
          : this.remixes(),
  );

  protected setShelf(v: Shelf | undefined): void {
    if (v) this.shelf.set(v);
  }

  protected addFriend(userId: number): void {
    this.adding.mutate(userId);
  }
}
