import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { unwrap } from '@app/core/api/api-errors';
import { friendsApi, type PersonalColour, profileApi, usersApi } from '@app/core/api/planned.api';
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
  DialogService,
  EmptyStateComponent,
  formatCompact,
  IconComponent,
  type IdentityAccent,
  InputDirective,
  SegmentedComponent,
  StatComponent,
  ToastService,
} from '@naucto/ui';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';

import { EditChipComponent } from './edit-chip.component';
import {
  ProfileImageDialogComponent,
  type ProfileImageResult,
  type ProfileImageZone,
} from './profile-image.dialog';

type Shelf = 'games' | 'liked' | 'collabs' | 'remixes';

/** The one zone currently open. There is no edit mode, so at most one is. */
type Zone = 'nickname' | 'description' | 'colour';

/**
 * The six a person may wear, and the fill each one is drawn in.
 *
 * Written out rather than computed: Tailwind reads the source text, so a class string a signal
 * assembles does not exist by the time the stylesheet is built.
 */
const SWATCH: Record<PersonalColour, string> = {
  SKY: 'bg-presence-sky',
  BLUSH: 'bg-presence-blush',
  JADE: 'bg-presence-jade',
  GOLD: 'bg-gold',
  ORANGE: 'bg-orange',
  HOT: 'bg-hot',
};

/** The stored name, as the kit spells it. */
const ACCENT: Record<PersonalColour, IdentityAccent> = {
  SKY: 'sky',
  BLUSH: 'blush',
  JADE: 'jade',
  GOLD: 'gold',
  ORANGE: 'orange',
  HOT: 'hot',
};

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
    InputDirective,
    SegmentedComponent,
    StatComponent,
    HubRowComponent,
    EditChipComponent,
  ],
  template: `
    <div *transloco="let t" class="grid gap-3">
      @if (profile.data(); as p) {
        <!-- Full-bleed banner: the shell pads the page, so the bleed has to undo exactly that
             padding at each breakpoint rather than a fixed guess. -->
        <div
          class="group relative -mx-2 -mt-2 h-[220px] overflow-hidden bg-inset md:-mx-3 md:-mt-3"
          [class.no-cover]="!p.backgroundImageUrl && !isSelf()"
        >
          @if (p.backgroundImageUrl) {
            <!-- A photograph being scaled: nearest-neighbour tears it, so it is resampled. The
                 console's own art is drawn on a grid and keeps that rule elsewhere. -->
            <img [src]="p.backgroundImageUrl" alt="" class="h-full w-full object-cover" />
          }
          @if (isSelf()) {
            <!-- The whole band is the target, not just the pencil in its corner: a chip that only
                 exists on hover, on a strip this wide, is a control you have to already know about.
                 Empty, it says what to do with itself — and never borrows the hatch, which means
                 "no cover" on someone else's profile. -->
            <button
              type="button"
              class="absolute inset-0 flex items-center justify-center gap-1 text-ink-3 hover:text-ink-2"
              [attr.aria-label]="t('profile.image.banner')"
              (click)="editImage('banner')"
            >
              @if (!p.backgroundImageUrl) {
                <nc-icon name="image" [size]="24" />
                <span class="label">{{ t('profile.setBanner') }}</span>
              }
            </button>
            <span class="absolute top-2 right-2 flex gap-1">
              <span class="pointer-events-none">
                <nc-edit-chip [label]="t('profile.image.banner')" />
              </span>
              @if (p.backgroundImageUrl) {
                <nc-edit-chip
                  icon="trash"
                  [label]="t('profile.image.clear.banner')"
                  (click)="clearImage('banner')"
                />
              }
            </span>
          }
          <!-- Decorative, and drawn last, so it lies over the whole band: without this it swallows
               every click meant for what is underneath. -->
          <span
            class="pointer-events-none absolute inset-0"
            style="background:linear-gradient(to bottom,color-mix(in srgb,var(--color-page) 10%,transparent) 0%,color-mix(in srgb,var(--color-page) 55%,transparent) 55%,var(--color-page) 100%)"
          ></span>
        </div>
        <!-- Positioned, so it paints above the banner it overlaps. The banner is positioned for
             its scrim, and a positioned element covers a static sibling whatever the DOM order —
             which left the display name hidden behind it. Ordering, not a z-index. -->
        <div class="relative -mt-6 flex flex-wrap items-start gap-2">
          <span class="group relative">
            <nc-avatar
              class="rounded-sm border border-line-strong"
              [name]="p.nickname || p.username"
              [src]="p.profileImageUrl ?? undefined"
              [id]="p.id"
              [colour]="avatarColour()"
              [size]="88"
            />
            @if (isSelf()) {
              <span class="absolute right-1 bottom-1 flex gap-1">
                <nc-edit-chip [label]="t('profile.image.picture')" (click)="editImage('picture')" />
                @if (p.profileImageUrl) {
                  <nc-edit-chip
                    icon="trash"
                    [label]="t('profile.image.clear.picture')"
                    (click)="clearImage('picture')"
                  />
                }
              </span>
            }
          </span>
          <!-- Wide enough that the bio reads as a sentence rather than a column of two words;
               past that the stats wrap under instead of squeezing it. -->
          <div class="min-w-[220px] flex-1">
            @if (editing() === 'nickname') {
              <input
                ncInput
                class="w-full max-w-[360px]"
                [value]="p.nickname || p.username"
                #zoneInput
                maxlength="32"
                [attr.aria-label]="t('settings.displayName')"
                (keydown.enter)="commit('nickname', $any($event.target).value)"
                (keydown.escape)="editing.set(null)"
                (blur)="commit('nickname', $any($event.target).value)"
              />
            } @else {
              <span class="group relative inline-flex items-center gap-1.5">
                <h1 class="text-display text-ink">{{ p.nickname || p.username }}</h1>
                @if (isSelf()) {
                  <nc-edit-chip
                    [label]="t('settings.displayName')"
                    (click)="editing.set('nickname')"
                  />
                }
              </span>
            }
            <!-- One line, the way the design writes it: what this person says about themselves,
                 then the year they arrived. The handle is in the address bar. -->
            @if (editing() === 'description') {
              <input
                ncInput
                class="mt-[6px] w-full max-w-[560px]"
                [value]="p.description ?? ''"
                #zoneInput
                maxlength="160"
                [attr.aria-label]="t('profile.status')"
                (keydown.enter)="commit('description', $any($event.target).value)"
                (keydown.escape)="editing.set(null)"
                (blur)="commit('description', $any($event.target).value)"
              />
            } @else {
              <div
                class="group relative mt-[6px] flex max-w-[560px] items-center gap-1.5 text-body tracking-copy text-ink-3"
              >
                <span>
                  {{ p.description || '@' + p.username }}
                  @if (joined(); as year) {
                    · {{ t('profile.joined', { year: year }) }}
                  }
                </span>
                @if (isSelf()) {
                  <nc-edit-chip
                    [label]="t('profile.status')"
                    (click)="editing.set('description')"
                  />
                }
              </div>
            }
            @if (isSelf()) {
              <div class="group relative mt-1 flex items-center gap-1.5">
                @if (editing() === 'colour') {
                  <span
                    class="flex gap-[5px]"
                    role="radiogroup"
                    [attr.aria-label]="t('profile.colour')"
                  >
                    @for (c of COLOURS; track c) {
                      <button
                        type="button"
                        role="radio"
                        class="size-[22px] rounded-xs"
                        [class]="swatch(c)"
                        [class.ring-2]="accent() === c"
                        [attr.aria-checked]="accent() === c"
                        [attr.aria-label]="c"
                        (click)="commit('colour', c)"
                      ></button>
                    }
                  </span>
                } @else {
                  <span class="label text-ink-4">{{ t('profile.colour') }}</span>
                  <span class="size-[22px] rounded-xs" [class]="swatch(accent())"></span>
                  <nc-edit-chip [label]="t('profile.colour')" (click)="editing.set('colour')" />
                }
              </div>
            }
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
                {{ t('profile.settings') }}
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
  protected readonly editing = signal<Zone | null>(null);
  protected readonly COLOURS = Object.keys(SWATCH) as PersonalColour[];
  private readonly dialogs = inject(DialogService);
  private readonly queries = inject(QueryClient);
  private readonly zoneInput = viewChild<ElementRef<HTMLInputElement>>('zoneInput');

  constructor() {
    // Opening a zone has to put the caret in it: the pencil was the click, and asking for a second
    // one to reach the field it just opened is a step the design does not draw.
    effect(() => {
      if (!this.editing()) return;
      const el = untracked(() => this.zoneInput()?.nativeElement);
      el?.focus();
      el?.select();
    });
  }

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

  /** The colour this person is drawn in: their own pick, or the one derived from their id. */
  protected readonly accent = computed<PersonalColour>(() => {
    const chosen = (this.profile.data() as { colour?: PersonalColour | null } | undefined)?.colour;
    return chosen ?? this.COLOURS[this.userId() % this.COLOURS.length] ?? 'SKY';
  });

  /** What the avatar is told, which is the kit's name for the same colour. */
  protected readonly avatarColour = computed<IdentityAccent>(() => ACCENT[this.accent()]);

  protected swatch(colour: PersonalColour): string {
    return SWATCH[colour];
  }

  /** One zone at a time, each committing on its own — there is no save bar to abandon. */
  protected async commit(zone: Zone, value: string): Promise<void> {
    this.editing.set(null);
    const p = this.profile.data();
    if (!p) return;
    const patch =
      zone === 'colour'
        ? { colour: value as PersonalColour }
        : zone === 'nickname'
          ? { nickname: value.trim() }
          : { description: value.trim() };
    if (zone === 'nickname' && (p.nickname ?? '') === patch.nickname) return;
    if (zone === 'description' && (p.description ?? '') === patch.description) return;

    try {
      await profileApi.update(patch);
      await this.refresh();
    } catch {
      this.toasts.show(this.transloco.translate('settings.saveFailed'));
    }
  }

  protected editImage(zone: ProfileImageZone): void {
    const id = this.userId();
    if (!id) return;
    this.dialogs
      .open<ProfileImageDialogComponent, unknown, ProfileImageResult | undefined>(
        ProfileImageDialogComponent,
        { width: '520px', data: { zone } },
      )
      .closed.subscribe((result) => {
        if (result?.kind !== 'save') return;
        void this.upload(id, zone, result.blob);
      });
  }

  protected async clearImage(zone: ProfileImageZone): Promise<void> {
    const id = this.userId();
    if (!id) return;
    try {
      await profileApi.removeImage(id, zone === 'picture' ? 'picture' : 'background');
      await this.refresh();
    } catch {
      this.toasts.show(this.transloco.translate('settings.saveFailed'));
    }
  }

  private async upload(id: number, zone: ProfileImageZone, blob: Blob): Promise<void> {
    try {
      await profileApi.uploadImage(id, zone === 'picture' ? 'picture' : 'background', blob);
      await this.refresh();
    } catch {
      this.toasts.show(this.transloco.translate('settings.saveFailed'));
    }
  }

  /** Read the profile back rather than patching it here — the server owns what it stored. */
  private async refresh(): Promise<void> {
    await this.auth.refreshProfile();
    await this.queries.invalidateQueries({ queryKey: ['profile'] });
  }
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
