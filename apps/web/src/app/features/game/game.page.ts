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
  numberAttribute,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiError } from '@app/core/api/api-errors';
import { AuthStore } from '@app/core/auth/auth.store';
import { PresenceStore } from '@app/core/presence/presence.store';
import { SignedInAction } from '@app/shared/auth/signed-in-action';
import { GameCardComponent } from '@app/shared/game-card/game-card.component';
import { GameScreenComponent } from '@app/shared/game-screen/game-screen.component';
import {
  injectFork,
  injectLikeStatus,
  injectRelease,
  injectReleaseContentUrl,
  injectReleasesPage,
  injectToggleLike,
  registerView,
  SORTERS,
} from '@app/shared/queries/releases.queries';
import { UserAvatarComponent } from '@app/shared/user-avatar.component';
import { TranslocoDirective } from '@jsverse/transloco';
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

import { CommentsComponent } from './comments/comments.component';
import { HowToPlayComponent } from './how-to-play.component';
import { ReleaseGameService } from './release-game.service';

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
    GameCardComponent,
    GameScreenComponent,
    CommentsComponent,
    HowToPlayComponent,
    UserAvatarComponent,
  ],
  templateUrl: './game.page.html',
  // A column that fills what the shell left it, so the panel's own surface reaches the footer
  // instead of stopping at the height of whatever the sidebar happens to hold.
  host: { class: 'flex flex-1 flex-col' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GamePage {
  readonly id = input.required({ transform: numberAttribute });
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly loader = inject(ReleaseGameService);
  private readonly presence = inject(PresenceStore);
  private readonly signedIn = inject(SignedInAction);

  protected readonly release = injectRelease(() => this.id());
  protected readonly contentUrl = injectReleaseContentUrl(() => this.id());
  protected readonly likes = injectLikeStatus(() => this.id());
  private readonly toggle = injectToggleLike(() => this.id());
  protected readonly fork = injectFork();
  private readonly all = injectReleasesPage(() => 1, 48);

  /** Whether the description is shown in full, rather than clamped to its first lines. */
  protected readonly descOpen = signal(false);
  /**
   * Whether the clamp is actually hiding something — measured, because how much text fits depends
   * on the width and the text.
   */
  protected readonly descClamped = signal(false);
  private readonly descEl = viewChild<ElementRef<HTMLElement>>('desc');

  protected readonly game = signal<Game | null>(null);
  /** Set when the content blob itself fails; the queries carry their own failures. */
  private readonly contentFailed = signal(false);

  /**
   * Why the game is not on screen, as a translation key — or null when it is. Three things can
   * fail: the release metadata, the signed content URL, and the blob behind it.
   */
  protected readonly failure = computed<string | null>(() => {
    const e = this.release.error() ?? this.contentUrl.error();
    if (!(this.id() > 0) || (e instanceof ApiError && e.status === 404)) return 'notFound.body';
    if (this.release.isError()) return 'game.loadFailedRelease';
    if (this.contentUrl.isError()) return 'game.loadFailedContent';
    if (this.contentFailed()) return 'game.loadFailedContent';
    return null;
  });
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
    const r = this.release.data();
    if (!me || !r) return false;
    return r.creator.id === me || r.collaborators.some((c) => c.id === me);
  });
  protected readonly remixes = computed(() => {
    const r = this.release.data();
    return r
      ? (this.all.data()?.items ?? [])
          .filter((g) => g.forkedFromId === r.id)
          .sort(SORTERS.viewCount)
          .slice(0, 2)
      : [];
  });
  protected readonly moreFrom = computed(() => {
    const r = this.release.data();
    return r
      ? (this.all.data()?.items ?? [])
          .filter((g) => g.creator.id === r.creator.id && g.id !== r.id)
          .sort(SORTERS.viewCount)
          .slice(0, 2)
      : [];
  });
  protected readonly similar = computed(() => {
    const r = this.release.data();
    if (!r) return [];
    const tags = new Set(r.tags.map((x) => x.toLowerCase()));
    return (this.all.data()?.items ?? [])
      .filter(
        (g) =>
          g.id !== r.id &&
          g.creator.id !== r.creator.id &&
          g.tags.some((x) => tags.has(x.toLowerCase())),
      )
      .sort(SORTERS.viewCount)
      .slice(0, 2);
  });

  constructor() {
    effect((onCleanup) => {
      const id = this.id();
      if (!this.auth.isAuthenticated()) return;
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
      if (!url) return;
      untracked(() => {
        void this.loader
          .load(url)
          .then((g) => {
            if (this.id() !== id) return;
            this.game.set(g);
            registerView(id);
          })
          .catch(() => {
            // The reason is dropped on purpose: the page states the failure in its own words.
            if (this.id() === id) this.contentFailed.set(true);
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
        if (observed) ro.unobserve(observed);
        if (el) ro.observe(el);
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
    if (!el || untracked(this.descOpen)) return;
    this.descClamped.set(el.scrollHeight > el.clientHeight + 1);
  }

  /** What the game calls its actions, read from the document so the panel is right before a run. */
  protected readonly declaredActions = computed(() => this.game()?.declaredActions ?? []);

  protected count(n: number): string {
    return formatCount(n);
  }

  /**
   * Straight after signing in the like status is still on its way, so the reader is taken not to
   * have liked yet; a game they had already liked settles on the refetch the toggle triggers.
   */
  protected toggleLike(): void {
    this.signedIn.run(() => {
      this.toggle.mutate(this.likes.data()?.liked ?? false);
    });
  }

  protected remix(id: number): void {
    this.signedIn.run(() => {
      this.fork.mutate(id, {
        onSuccess: (p) => {
          this.toasts.show('Remixed into your games', 'success');
          void this.router.navigate(['/edit', p.id]);
        },
      });
    });
  }
}
