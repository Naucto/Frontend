import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { unwrap } from '@app/core/api/api-errors';
import { AuthStore } from '@app/core/auth/auth.store';
import { PresenceStore } from '@app/core/presence/presence.store';
import { HubRowComponent } from '@app/features/hub/hub-row.component';
import { qk } from '@app/shared/queries/query-keys';
import { injectReleasesPage } from '@app/shared/queries/releases.queries';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  friendsControllerSend,
  type ProjectExResponseDto,
  type UpdateUserProfileDto,
  userControllerRemoveProfileBackground,
  userControllerRemoveProfilePicture,
  userControllerUpdateMyProfile,
  userControllerUploadProfileBackground,
  userControllerUploadProfilePicture,
  userFriendshipControllerFriendship,
  userPublicControllerGetCollaborations,
  userPublicControllerGetLikedGames,
  userPublicControllerGetPublicProfileByUsername,
  userPublicControllerGetPublishedGames,
  userPublicControllerGetRemixes,
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

type Zone = 'nickname' | 'description' | 'colour';

/**
 * The six a person may wear, and the fill each one is drawn in.
 *
 * Written out rather than computed: Tailwind reads the source text, so a class string a signal
 * assembles does not exist by the time the stylesheet is built.
 */
type PersonalColour = NonNullable<UpdateUserProfileDto['colour']>;

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
  templateUrl: './profile.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePage {
  readonly username = input.required<string>();
  protected readonly auth = inject(AuthStore);
  private readonly toasts = inject(ToastService);
  private readonly presence = inject(PresenceStore);
  private readonly transloco = inject(TranslocoService);
  protected readonly shelf = signal<Shelf>('games');
  /** The one zone currently open. There is no edit mode, so at most one is. */
  protected readonly editing = signal<Zone | null>(null);
  protected readonly COLOURS = Object.keys(SWATCH) as PersonalColour[];
  private readonly dialogs = inject(DialogService);
  private readonly queries = inject(QueryClient);
  private readonly zoneInput = viewChild<ElementRef<HTMLInputElement>>('zoneInput');

  constructor() {
    afterRenderEffect(() => {
      if (!this.editing()) return;
      const el = this.zoneInput()?.nativeElement;
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

  /** The colour this person picked, if any; without one the kit derives it from their id. */
  protected readonly accent = computed<PersonalColour | null>(
    () => this.profile.data()?.colour ?? null,
  );

  /** What the avatar is told, which is the kit's name for the same colour. */
  protected readonly avatarColour = computed<IdentityAccent | undefined>(() => {
    const chosen = this.accent();
    return chosen ? ACCENT[chosen] : undefined;
  });

  protected swatch(colour: PersonalColour): string {
    return SWATCH[colour];
  }

  /** One zone at a time, each committing on its own — there is no save bar to abandon. */
  protected async commit(zone: Zone, value: string): Promise<void> {
    // Removing the focused input fires a blur, which must not commit a zone already closed.
    if (this.editing() !== zone) return;
    this.editing.set(null);
    const p = this.profile.data();
    if (!p) return;
    const patch =
      zone === 'colour'
        ? { colour: value as PersonalColour }
        : zone === 'nickname'
          ? { nickname: value.trim() }
          : { description: value.trim() };
    if (zone === 'nickname' && (p.nickname?.length ? p.nickname : p.username) === patch.nickname)
      return;
    if (zone === 'description' && (p.description ?? '') === patch.description) return;

    try {
      unwrap(await userControllerUpdateMyProfile({ body: patch }));
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
      const options = { path: { id } };
      unwrap(
        await (zone === 'picture'
          ? userControllerRemoveProfilePicture(options)
          : userControllerRemoveProfileBackground(options)),
      );
      await this.refresh();
    } catch {
      this.toasts.show(this.transloco.translate('settings.saveFailed'));
    }
  }

  private async upload(id: number, zone: ProfileImageZone, blob: Blob): Promise<void> {
    try {
      const name = zone === 'picture' ? 'picture' : 'background';
      const options = {
        path: { id },
        body: { file: new File([blob], `${name}.png`, { type: blob.type }) },
      };
      unwrap(
        await (zone === 'picture'
          ? userControllerUploadProfilePicture(options)
          : userControllerUploadProfileBackground(options)),
      );
      await this.refresh();
    } catch {
      this.toasts.show(this.transloco.translate('settings.saveFailed'));
    }
  }

  /** Read the profile back rather than patching it here — the server owns what it stored. */
  private async refresh(): Promise<void> {
    await this.auth.refreshProfile();
    await Promise.all([
      this.queries.invalidateQueries({ queryKey: qk.profileAll() }),
      this.queries.invalidateQueries({ queryKey: qk.userAvatar(this.userId()) }),
    ]);
  }
  private readonly published = injectQuery(() => ({
    queryKey: ['profile', this.userId(), 'games'],
    enabled: this.userId() > 0,
    queryFn: async () =>
      unwrap(
        await userPublicControllerGetPublishedGames({
          path: { id: this.userId() },
          query: { page: 1, limit: 100, ownedOnly: 'true' },
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
   * Fallback for the COLLABS and REMIXES shelves when their dedicated endpoints do not answer:
   * derived from the first page of releases.
   */
  private readonly all = injectReleasesPage(() => 1, 48);
  private readonly collabsQuery = injectQuery(() => ({
    queryKey: ['profile', this.userId(), 'collabs'],
    enabled: this.userId() > 0,
    retry: false,
    queryFn: async () =>
      unwrap(await userPublicControllerGetCollaborations({ path: { id: this.userId() } })),
  }));
  private readonly remixesQuery = injectQuery(() => ({
    queryKey: ['profile', this.userId(), 'remixes'],
    enabled: this.userId() > 0,
    retry: false,
    queryFn: async () =>
      unwrap(await userPublicControllerGetRemixes({ path: { id: this.userId() } })),
  }));
  private readonly friendshipQuery = injectQuery(() => ({
    queryKey: ['friendship', this.userId()],
    enabled: this.userId() > 0 && this.auth.isAuthenticated() && !this.isSelf(),
    retry: false,
    queryFn: async () =>
      unwrap(await userFriendshipControllerFriendship({ path: { id: this.userId() } })),
  }));
  protected readonly adding = injectMutation(() => ({
    mutationFn: async (userId: number) => {
      unwrap(await friendsControllerSend({ body: { userId } }));
    },
    onSuccess: (_: unknown, userId: number) =>
      this.queries.invalidateQueries({ queryKey: ['friendship', userId] }),
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
  protected readonly counts = computed(() => {
    const p = this.profile.data();
    return {
      games: p?.gameCount ?? this.games().length,
      plays: p?.totalPlays ?? this.games().reduce((n, g) => n + g.viewCount, 0),
      likes: p?.totalLikes ?? this.games().reduce((n, g) => n + g.likes, 0),
    };
  });
  protected readonly joined = computed(() => {
    const at = this.profile.data()?.createdAt;
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
    {
      value: 'games' as const,
      label: `${this.transloco.translate('profile.games')} ${formatCompact(this.counts().games)}`,
    },
    {
      value: 'liked' as const,
      label: `${this.transloco.translate('profile.liked')} ${formatCompact(this.likedGames().length)}`,
    },
    {
      value: 'collabs' as const,
      label: `${this.transloco.translate('profile.collabs')} ${formatCompact(this.collabs().length)}`,
    },
    {
      value: 'remixes' as const,
      label: `${this.transloco.translate('profile.remixes')} ${formatCompact(this.remixes().length)}`,
    },
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
