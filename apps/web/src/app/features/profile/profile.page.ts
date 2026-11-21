import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
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
  MarkComponent,
  PERSONAL_COLOURS,
  SegmentedComponent,
  StatComponent,
  ToastService,
} from '@naucto/ui';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';

import { unwrap } from '../../core/api/api-errors';
import { AuthStore } from '../../core/auth/auth.store';
import { FeaturesService } from '../../core/config/features.service';
import { PresenceStore } from '../../core/presence/presence.store';
import { presenceLine } from '../../core/presence/presence-line';
import { CollectionBoxComponent } from '../../shared/hub/collection-box.component';
import { ContentFlagLauncher } from '../../shared/moderation/content-flag-launcher.service';
import { injectUserCollections } from '../../shared/queries/collections.queries';
import { qk } from '../../shared/queries/query-keys';
import { injectRelatedWindow } from '../../shared/queries/releases.queries';
import { HubRowComponent } from '../hub/hub-row.component';
import { EditChipComponent } from './edit-chip.component';
import {
  ProfileImageDialogComponent,
  type ProfileImageResult,
  type ProfileImageZone,
} from './profile-image.dialog';

type Shelf = 'games' | 'liked' | 'collabs' | 'remixes' | 'collections';

type Zone = 'nickname' | 'description' | 'colour';

/** The six a person may wear, as the API stores them. */
type PersonalColour = NonNullable<UpdateUserProfileDto['colour']>;

/**
 * The stored name is the kit's, upper-cased. Both conversions are typed, so a colour added on one
 * side and not the other fails to compile.
 */
const toAccent = (colour: PersonalColour): IdentityAccent =>
  colour.toLowerCase() as Lowercase<PersonalColour>;
const COLOURS: PersonalColour[] = (Object.keys(PERSONAL_COLOURS) as IdentityAccent[]).map(
  (accent) => accent.toUpperCase() as Uppercase<IdentityAccent>,
);

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
    MarkComponent,
    InputDirective,
    SegmentedComponent,
    StatComponent,
    HubRowComponent,
    EditChipComponent,
    CollectionBoxComponent,
  ],
  templateUrl: './profile.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ProfilePage {
  readonly username = input.required<string>();
  protected readonly auth = inject(AuthStore);
  protected readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly presence = inject(PresenceStore);
  private readonly transloco = inject(TranslocoService);
  /** Another person's profile opens on their games: they may not have the shelf this one was on. */
  protected readonly shelf = linkedSignal<string, Shelf>({
    source: () => this.username(),
    computation: () => 'games',
  });
  /** The one zone currently open. There is no edit mode, so at most one is. */
  protected readonly editing = signal<Zone | null>(null);
  protected readonly COLOURS = COLOURS;
  private readonly dialogs = inject(DialogService);
  private readonly queries = inject(QueryClient);
  private readonly features = inject(FeaturesService);
  private readonly flags = inject(ContentFlagLauncher);
  private readonly zoneInput = viewChild<ElementRef<HTMLInputElement>>('zoneInput');

  constructor() {
    afterRenderEffect(() => {
      if (!this.editing()) {
        return;
      }
      const el = this.zoneInput()?.nativeElement;
      el?.focus();
      el?.select();
    });
  }

  protected readonly profile = injectQuery(() => ({
    queryKey: qk.profile(this.username()),
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
    return chosen ? toAccent(chosen) : undefined;
  });

  protected swatch(colour: PersonalColour): string {
    return PERSONAL_COLOURS[toAccent(colour)].swatch;
  }

  /** One zone at a time, each committing on its own — there is no save bar to abandon. */
  protected async commit(zone: Zone, value: string): Promise<void> {
    // Removing the focused input fires a blur, which must not commit a zone already closed.
    if (this.editing() !== zone) {
      return;
    }
    this.editing.set(null);
    const profile = this.profile.data();
    if (!profile) {
      return;
    }
    const patch =
      zone === 'colour'
        ? { colour: value as PersonalColour }
        : zone === 'nickname'
          ? { nickname: value.trim() }
          : { description: value.trim() };
    if (
      zone === 'nickname' &&
      (profile.nickname?.length ? profile.nickname : profile.username) === patch.nickname
    ) {
      return;
    }
    if (zone === 'description' && (profile.description ?? '') === patch.description) {
      return;
    }

    try {
      unwrap(await userControllerUpdateMyProfile({ body: patch }));
      await this.refresh();
    } catch {
      this.toasts.show(this.transloco.translate('settings.saveFailed'));
    }
  }

  protected editImage(zone: ProfileImageZone): void {
    const id = this.userId();
    if (!id) {
      return;
    }
    this.dialogs
      .open<ProfileImageDialogComponent, unknown, ProfileImageResult | undefined>(
        ProfileImageDialogComponent,
        { width: '520px', data: { zone } },
      )
      .closed.subscribe((result) => {
        if (result?.kind !== 'save') {
          return;
        }
        void this.upload(id, zone, result.blob);
      });
  }

  protected async clearImage(zone: ProfileImageZone): Promise<void> {
    const id = this.userId();
    if (!id) {
      return;
    }
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
    queryKey: qk.profileGames(this.userId()),
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
    queryKey: qk.profileLiked(this.userId()),
    enabled: this.userId() > 0,
    queryFn: async () =>
      unwrap(await userPublicControllerGetLikedGames({ path: { id: this.userId() } })),
  }));
  /** Fallback for the COLLABS and REMIXES shelves when their dedicated endpoints do not answer. */
  private readonly all = injectRelatedWindow();
  private readonly collabsQuery = injectQuery(() => ({
    queryKey: qk.profileCollabs(this.userId()),
    enabled: this.userId() > 0,
    retry: false,
    queryFn: async () =>
      unwrap(await userPublicControllerGetCollaborations({ path: { id: this.userId() } })),
  }));
  private readonly remixesQuery = injectQuery(() => ({
    queryKey: qk.profileRemixes(this.userId()),
    enabled: this.userId() > 0,
    retry: false,
    queryFn: async () =>
      unwrap(await userPublicControllerGetRemixes({ path: { id: this.userId() } })),
  }));
  /** The public ones only: what the API lists of anyone, the viewer's own profile included. */
  protected readonly collections = injectUserCollections(() => this.userId());
  private readonly friendshipQuery = injectQuery(() => ({
    queryKey: qk.friendship(this.userId()),
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
      this.queries.invalidateQueries({ queryKey: qk.friendship(userId) }),
    onError: (error: Error) => {
      this.toasts.show(error.message, 'error');
    },
  }));

  protected readonly isSelf = computed(() => this.auth.user()?.username === this.username());
  protected readonly canReport = computed(() => this.features.moderation() && !this.isSelf());
  protected readonly games = computed<ProjectExResponseDto[]>(() => this.published.data() ?? []);
  protected readonly likedGames = computed<ProjectExResponseDto[]>(() => this.liked.data() ?? []);
  protected readonly collabs = computed<ProjectExResponseDto[]>(
    () =>
      this.collabsQuery.data() ??
      (this.all.data()?.items ?? []).filter((release) =>
        release.collaborators.some((collaborator) => collaborator.id === this.userId()),
      ),
  );
  protected readonly remixes = computed<ProjectExResponseDto[]>(() => {
    const served = this.remixesQuery.data();
    if (served) {
      return served;
    }
    const mine = new Set(this.games().map((game) => game.id));
    return (this.all.data()?.items ?? []).filter(
      (release) => release.forkedFromId && mine.has(release.forkedFromId),
    );
  });
  /** Totals come from the profile when it carries them; otherwise they are summed here. */
  protected readonly counts = computed(() => {
    const profile = this.profile.data();
    return {
      games: profile?.gameCount ?? this.games().length,
      plays: profile?.totalPlays ?? this.games().reduce((sum, game) => sum + game.viewCount, 0),
      likes: profile?.totalLikes ?? this.games().reduce((sum, game) => sum + game.likes, 0),
    };
  });
  protected readonly joined = computed(() => {
    const at = this.profile.data()?.createdAt;
    return at ? new Date(at).getFullYear() : null;
  });
  protected readonly friendship = computed(() => this.friendshipQuery.data()?.status ?? 'NONE');
  protected readonly presenceLine = computed(() => {
    const line = presenceLine(this.presence.of(this.userId()));
    return line?.name ? `${this.transloco.translate(line.verbKey)} ${line.name}` : '';
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
    ...(this.collections.data()?.length
      ? [
          {
            value: 'collections' as const,
            label: `${this.transloco.translate('profile.collections')} ${formatCompact(this.collections.data()?.length ?? 0)}`,
          },
        ]
      : []),
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

  protected setShelf(value: Shelf | undefined): void {
    if (value) {
      this.shelf.set(value);
    }
  }

  protected addFriend(userId: number): void {
    this.adding.mutate(userId);
  }

  protected report(profile: { id: number; username: string }): void {
    this.flags.report({ targetType: 'USER', targetId: profile.id, label: `@${profile.username}` });
  }
}
