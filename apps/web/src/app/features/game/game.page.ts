import { DatePipe } from '@angular/common';
import type { ElementRef } from '@angular/core';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  linkedSignal,
  numberAttribute,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { multiplayerControllerGet, type ProjectExResponseDto } from '@naucto/api-client';
import type { Game } from '@naucto/engine';
import {
  ButtonDirective,
  ChipComponent,
  ErrorStateComponent,
  formatCount,
  IconComponent,
  LabelComponent,
  SkeletonComponent,
  StatComponent,
  ToastService,
} from '@naucto/ui';
import { injectQuery } from '@tanstack/angular-query-experimental';

import { ApiError, unwrap } from '../../core/api/api-errors';
import { AuthStore } from '../../core/auth/auth.store';
import { FeaturesService } from '../../core/config/features.service';
import type { SessionInvite } from '../../core/net/net-bridge.service';
import { PresenceStore } from '../../core/presence/presence.store';
import { GameDiskComponent } from '../../shared/game-card/game-disk.component';
import { GameScreenComponent } from '../../shared/game-screen/game-screen.component';
import { ContentFlagLauncher } from '../../shared/moderation/content-flag-launcher.service';
import { GoodStandingAction } from '../../shared/moderation/good-standing-action';
import { qk } from '../../shared/queries/query-keys';
import {
  injectFork,
  injectLikeStatus,
  injectRelatedWindow,
  injectRelease,
  injectReleaseContentUrl,
  injectToggleLike,
} from '../../shared/queries/releases.queries';
import { UserAvatarComponent } from '../../shared/user-avatar.component';
import { AddToCollectionComponent } from './add-to-collection.component';
import { CommentsComponent } from './comments/comments.component';
import { HowToPlayComponent } from './how-to-play.component';
import { PlayTrackingDirective } from './play-tracking.directive';
import { ReleaseGameService } from './release-game.service';
import { type CameFor, SessionStripComponent } from './session-strip.component';

/** How many games each related shelf shows. */
const RELATED_SHOWN = 2;

/** The failures that have a title of their own. Any other is a game that would not start. */
const FAILURE_TITLES: Record<string, string> = {
  'notFound.body': 'notFound.title',
  'game.unavailable': 'game.unavailableTitle',
};

/** The most played of the releases that pass, as many as a related shelf shows. */
function topRelated(
  items: readonly ProjectExResponseDto[] | undefined,
  keep: (candidate: ProjectExResponseDto) => boolean,
  count = RELATED_SHOWN,
): ProjectExResponseDto[] {
  return (items ?? [])
    .filter(keep)
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, count);
}

@Component({
  selector: 'nc-game-page',
  imports: [
    DatePipe,
    RouterLink,
    TranslocoDirective,
    ButtonDirective,
    ChipComponent,
    ErrorStateComponent,
    IconComponent,
    LabelComponent,
    SkeletonComponent,
    StatComponent,
    GameDiskComponent,
    GameScreenComponent,
    CommentsComponent,
    HowToPlayComponent,
    UserAvatarComponent,
    PlayTrackingDirective,
    AddToCollectionComponent,
    SessionStripComponent,
  ],
  templateUrl: './game.page.html',
  styles: `
    .like-pop {
      animation: like-pop 200ms steps(2, end);
    }
    @keyframes like-pop {
      50% {
        transform: scale(1.3);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .like-pop {
        animation: none;
      }
    }
    :host-context([data-reduce-motion]) .like-pop {
      animation: none;
    }
  `,
  // A column that fills what the shell left it, so the panel's own surface reaches the footer
  // instead of stopping at the height of whatever the sidebar happens to hold.
  host: { class: 'flex flex-1 flex-col' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class GamePage {
  readonly id = input.required({ transform: numberAttribute });
  /** What a link to a session of this game carries: the session, and its code when it takes one. */
  readonly session = input<string>();
  readonly code = input<string>();
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly loader = inject(ReleaseGameService);
  private readonly presence = inject(PresenceStore);
  private readonly standing = inject(GoodStandingAction);
  private readonly features = inject(FeaturesService);
  private readonly flags = inject(ContentFlagLauncher);

  protected readonly release = injectRelease(() => this.id());
  protected readonly contentUrl = injectReleaseContentUrl(() => this.id());
  protected readonly likes = injectLikeStatus(() => this.id());
  private readonly toggle = injectToggleLike(() => this.id());
  protected readonly fork = injectFork();
  private readonly all = injectRelatedWindow();

  /** Set by the press that likes, so the heart pops for it and not for a like already there. */
  protected readonly justLiked = signal(false);
  /** Whether the description is shown in full, rather than clamped to its first lines. */
  protected readonly descOpen = signal(false);
  /**
   * Whether the clamp is actually hiding something — measured, because how much text fits depends
   * on the width and the text.
   */
  protected readonly descClamped = signal(false);
  private readonly descEl = viewChild<ElementRef<HTMLElement>>('desc');

  protected readonly game = signal<Game | null>(null);
  private readonly screen = viewChild(GameScreenComponent);

  /**
   * The session the visitor came for. It outlives its params, which leave the address once it is
   * joined, so that a restart goes back in. It ends with the game, when the visitor chooses to
   * play alone, and when the session was left or would not let them in.
   */
  private readonly cameFor = linkedSignal<
    { id: number; uuid: string | undefined; code: string | undefined },
    Pick<SessionInvite, 'uuid' | 'code'> | null
  >({
    source: () => ({ id: this.id(), uuid: this.session(), code: this.code() }),
    computation: ({ id, uuid, code }, previous) => {
      if (uuid) {
        return { uuid, code: code ?? null };
      }
      return previous?.source.id === id ? previous.value : null;
    },
  });
  private readonly beforePlay = computed(
    () => (this.screen()?.runtime.state() ?? 'idle') === 'idle',
  );
  private readonly invited = injectQuery(() => {
    const target = this.cameFor();
    return {
      queryKey: qk.session(target?.uuid ?? null, target?.code ?? null),
      queryFn: async () =>
        unwrap(
          await multiplayerControllerGet({
            path: { sessionId: target?.uuid ?? '' },
            query: { code: target?.code ?? undefined },
          }),
        ),
      enabled: target !== null && this.auth.isAuthenticated(),
      refetchInterval: this.beforePlay() ? 5_000 : false,
      retry: false,
    };
  });
  /** What the session the visitor came for is known to be. Only a 404 says it has closed. */
  private readonly known = computed<CameFor>(() => {
    const session = this.invited.data();
    if (session && !this.invited.isError()) {
      return { state: 'open', session };
    }
    const error = this.invited.error();
    return error instanceof ApiError && error.status === 404
      ? { state: 'ended' }
      : { state: 'unknown', signedOut: !this.auth.isAuthenticated() };
  });
  /** The strip over the screen, shown until the game starts. */
  protected readonly strip = computed(() =>
    this.cameFor() && this.beforePlay() ? this.known() : null,
  );
  protected readonly invite = computed<SessionInvite | null>(() => {
    const target = this.cameFor();
    if (!target) {
      return null;
    }
    const known = this.known();
    if (known.state !== 'open') {
      return { ...target, session: this.invited.isPending() ? undefined : null };
    }
    return {
      ...target,
      session: {
        title: known.session.title,
        host: known.session.hostNickname ?? known.session.hostUsername,
        players: known.session.playerCount,
        maxPlayers: known.session.maxPlayers,
      },
    };
  });
  /** Set when the content blob itself fails; the queries carry their own failures. */
  private readonly contentFailed = signal(false);

  /**
   * Why the game is not on screen, as a translation key — or null when it is. Three things can
   * fail: the release metadata, the signed content URL, and the blob behind it.
   */
  protected readonly failure = computed<string | null>(() => {
    const error = this.release.error() ?? this.contentUrl.error();
    if (!(this.id() > 0) || (error instanceof ApiError && error.status === 404)) {
      return 'notFound.body';
    }
    if (error instanceof ApiError && error.code === 'PROJECT_HIDDEN') {
      return 'game.unavailable';
    }
    if (this.release.isError()) {
      return 'game.loadFailedRelease';
    }
    if (this.contentUrl.isError()) {
      return 'game.loadFailedContent';
    }
    if (this.contentFailed()) {
      return 'game.loadFailedContent';
    }
    return null;
  });
  /** A game that is gone or withheld will not come back on a second try. */
  protected readonly failureTitle = computed(() => FAILURE_TITLES[this.failure() ?? ''] ?? null);
  protected readonly loading = computed(() => !this.failure() && !this.game());

  protected retry(): void {
    this.contentFailed.set(false);
    void this.release.refetch();
    void this.contentUrl.refetch();
  }

  protected readonly parent = injectRelease(() => this.release.data()?.forkedFromId ?? 0);

  /**
   * Who may go straight back into the editor; everyone else only gets REMIX. Collaborators count,
   * because that is what the work-session endpoint checks.
   */
  protected readonly canEdit = computed(() => {
    const me = this.auth.userId();
    const release = this.release.data();
    if (!me || !release) {
      return false;
    }
    return (
      release.creator.id === me ||
      release.collaborators.some((collaborator) => collaborator.id === me)
    );
  });
  /** Whoever works on a game has nothing to report about it. */
  protected readonly canReport = computed(
    () => this.features.moderation() && !!this.release.data() && !this.canEdit(),
  );
  protected readonly remixes = computed(() => {
    const release = this.release.data();
    return release
      ? topRelated(this.all.data()?.items, (candidate) => candidate.forkedFromId === release.id)
      : [];
  });
  protected readonly moreFrom = computed(() => {
    const release = this.release.data();
    return release
      ? topRelated(
          this.all.data()?.items,
          (candidate) => candidate.creator.id === release.creator.id && candidate.id !== release.id,
        )
      : [];
  });
  protected readonly similar = computed(() => {
    const release = this.release.data();
    if (!release) {
      return [];
    }
    const tags = new Set(release.tags.map((tag) => tag.toLowerCase()));
    return topRelated(
      this.all.data()?.items,
      (candidate) =>
        candidate.id !== release.id &&
        candidate.creator.id !== release.creator.id &&
        candidate.tags.some((tag) => tags.has(tag.toLowerCase())),
    );
  });

  constructor() {
    effect((onCleanup) => {
      const id = this.id();
      if (!this.auth.isAuthenticated()) {
        return;
      }
      this.presence.announce({ kind: 'PLAYING', releaseId: id });
      onCleanup(() => {
        this.presence.announce({ kind: 'IDLE' });
      });
    });
    // The router reuses this page across ids, so nothing loaded for one game may outlive it.
    effect(() => {
      this.id();
      untracked(() => {
        this.game.set(null);
        this.contentFailed.set(false);
      });
    });
    effect(() => {
      const url = this.contentUrl.data();
      const id = this.id();
      if (!url) {
        return;
      }
      untracked(() => {
        void this.loader
          .load(url)
          .then((game) => {
            if (this.id() !== id) {
              return;
            }
            this.game.set(game);
          })
          .catch(() => {
            // The reason is dropped on purpose: the page states the failure in its own words.
            if (this.id() === id) {
              this.contentFailed.set(true);
            }
          });
      });
    });
    // Measured after render, and again whenever the paragraph's own width changes: the clamp is a
    // line count, and how many lines the text takes is a property of the box it landed in.
    let observed: HTMLElement | undefined;
    const ro = new ResizeObserver(() => {
      this.measureClamp();
    });
    inject(DestroyRef).onDestroy(() => {
      ro.disconnect();
    });
    afterRenderEffect(() => {
      const el = this.descEl()?.nativeElement;
      this.descOpen();
      if (el !== observed) {
        if (observed) {
          ro.unobserve(observed);
        }
        if (el) {
          ro.observe(el);
        }
        observed = el;
      }
      this.measureClamp();
    });
  }

  /**
   * Whether the clamped paragraph is taller than the box showing it. Only meaningful while it is
   * clamped — unfolded, the box is the text, so the answer would always be no and the control
   * that folds it back would disappear under the reader.
   */
  private measureClamp(): void {
    const el = this.descEl()?.nativeElement;
    if (!el || untracked(this.descOpen)) {
      return;
    }
    this.descClamped.set(el.scrollHeight > el.clientHeight + 1);
  }

  /** A reload must not go back into a session that was joined, left or turned down. */
  protected dropSessionParams(): void {
    void this.router.navigate([], {
      queryParams: { session: null, code: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected closeInvite(): void {
    this.cameFor.set(null);
    this.dropSessionParams();
  }

  protected signInToJoin(): void {
    this.standing.run(() => undefined);
  }

  protected count(count: number): string {
    return formatCount(count);
  }

  /**
   * Straight after signing in the like status is still on its way, so the reader is taken not to
   * have liked yet; a game they had already liked settles on the refetch the toggle triggers.
   */
  protected toggleLike(): void {
    this.standing.run(() => {
      const liked = this.likes.data()?.liked ?? false;
      this.justLiked.set(!liked);
      this.toggle.mutate(liked);
    });
  }

  protected report(release: { id: number; name: string }): void {
    this.flags.report({ targetType: 'PROJECT', targetId: release.id, label: release.name });
  }

  protected remix(id: number): void {
    this.standing.run(() => {
      this.fork.mutate(id, {
        onSuccess: (project) => {
          this.toasts.show(this.transloco.translate('game.remixed'), 'success');
          void this.router.navigate(['/edit', project.id]);
        },
      });
    });
  }
}
