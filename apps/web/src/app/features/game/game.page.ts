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
import { AuthStore } from '@app/core/auth/auth.store';
import { PresenceStore } from '@app/core/presence/presence.store';
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
  template: `
    <div
      *transloco="let t"
      class="flex flex-1 flex-col items-stretch lg:-mx-3 lg:-my-3 lg:flex-row"
    >
      <div class="min-w-0 flex-1 lg:px-3 lg:pt-2.75 lg:pb-3.25">
        <!-- A game that did not load gets a state that says so, not the transport of a dead black
             rectangle with the raw Error.message underneath it. -->
        @if (failure(); as reason) {
          <div class="rounded-sm border border-line bg-panel">
            <nc-error-state
              [title]="t('game.loadFailedTitle')"
              [hint]="t(reason)"
              [retryLabel]="t('game.retry')"
              (retry)="retry()"
            >
              <a ncButton variant="ghost" routerLink="/hub">{{ t('notFound.back') }}</a>
            </nc-error-state>
          </div>
        } @else if (loading()) {
          <nc-skeleton height="60vh" radius="rounded-sm" />
        } @else {
          <nc-game-screen
            #screen
            [game]="game()"
            [projectId]="id()"
            fit="width"
            [autoPlay]="false"
          />
        }
        @if (release.data(); as r) {
          <nc-comments class="mt-4 block" [projectId]="r.id" [authorId]="r.creator.id" />
        }
      </div>

      <!-- Two guards against the same thing, and both are needed. The zero minimum stops the
           panel's own automatic minimum — its min-content width — from widening the flex track;
           the explicit minmax column stops the rows inside it from doing the same to the column,
           which is what actually pushed the buttons off screen: the panel measured 380 and the
           title inside it measured 689. -->
      <aside
        class="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-2 lg:w-[380px] lg:shrink-0 lg:border-l lg:border-b lg:border-line lg:bg-panel lg:px-2.5 lg:pt-2.75 lg:pb-2.5"
      >
        @if (release.data(); as r) {
          <div>
            <h1 class="truncate text-display text-ink">{{ r.name }}</h1>
            <div class="mt-1 flex items-center gap-1 text-meta text-ink-2">
              <nc-user-avatar [name]="r.creator.username" [userId]="r.creator.id" [size]="24" />
              <a [routerLink]="['/u', r.creator.username]" class="hover:text-ink">
                {{ t('hub.by', { name: r.creator.username }) }}
              </a>
              @if (r.publishedAt) {
                <span class="label">
                  {{ t('game.published') }} {{ r.publishedAt | date: 'MMM y' }}
                </span>
              }
            </div>
            <div class="mt-1 flex gap-2">
              <nc-stat icon="eye" [value]="r.viewCount" [label]="t('game.views')" />
              <nc-stat icon="users" [value]="r.uniquePlayers" [label]="t('game.players')" />
              <nc-stat icon="git-branch" [value]="r.forkCount ?? 0" [label]="t('game.remixes')" />
            </div>
            @if (r.forkedFromId) {
              <a
                [routerLink]="['/play', r.forkedFromId]"
                class="mt-1 inline-flex items-center gap-0.5 text-label text-ink-3 hover:text-ink"
              >
                <nc-icon name="git-branch" [size]="12" />
                @if (parent.data(); as p) {
                  {{ t('game.forkedFromNamed') }}
                  <span class="text-gold-ink">{{ p.name }}</span>
                } @else {
                  {{ t('game.forkedFrom') }}
                }
              </a>
            }
            <!-- Bound, not interpolated: see the comment body in comments.component.ts — under
                 whitespace-pre-wrap a template newline renders as a leading space.
                 wrap-anywhere on top of the clamp: a clamp counts lines, and a 300-character word
                 with nowhere to break is one line as wide as it is long. -->
            <p
              #desc
              class="mt-2 text-body text-ink-body whitespace-pre-wrap wrap-anywhere"
              [class.line-clamp-6]="!descOpen()"
              [textContent]="r.longDesc || r.shortDesc"
            ></p>
            @if (descClamped()) {
              <button
                ncButton
                variant="ghost"
                size="sm"
                class="mt-0.5"
                [attr.aria-expanded]="descOpen()"
                (click)="descOpen.set(!descOpen())"
              >
                {{ descOpen() ? t('game.showLess') : t('game.showMore') }}
              </button>
            }
            <div class="mt-2 grid grid-cols-2 gap-1">
              <button
                ncButton
                size="bar"
                [variant]="likes.data()?.liked ? 'run' : 'secondary'"
                (click)="toggleLike()"
                [disabled]="!auth.isAuthenticated()"
              >
                <nc-icon name="heart" [size]="12" />
                {{ count(likes.data()?.likes ?? r.likes) }} {{ t('game.likes') }}
              </button>
              <button
                ncButton
                size="bar"
                variant="secondary"
                (click)="remix(r.id)"
                [disabled]="!auth.isAuthenticated() || fork.isPending()"
              >
                <nc-icon name="git-branch" [size]="12" />
                {{ t('game.remix') }}
              </button>
              <!-- Publishing used to be a one-way door: your own game's only route back into the
                   editor was REMIX, which forks it. Owners get the door back. -->
              @if (canEdit()) {
                <a ncButton variant="secondary" class="col-span-2" [routerLink]="['/edit', r.id]">
                  <nc-icon name="edit" [size]="12" />
                  {{ t('game.edit') }}
                </a>
              }
            </div>
            @if (r.tags.length) {
              <div class="mt-2 flex flex-wrap gap-0.5">
                @for (tag of r.tags; track tag) {
                  <nc-chip kind="tag">{{ tag }}</nc-chip>
                }
              </div>
            }
          </div>
          <nc-how-to-play
            class="mt-0.25 border-t border-line pt-2.25 lg:-mx-2.5 lg:px-2.5"
            [declared]="declaredActions()"
          />
          @if (remixes().length) {
            <div class="mt-0.25 border-t border-line pt-2.25 lg:-mx-2.5 lg:px-2.5">
              <nc-label class="mb-1">{{ t('game.remixesOf') }}</nc-label>
              <div class="grid gap-2">
                @for (g of remixes(); track g.id) {
                  <nc-game-card [game]="g" dense />
                }
              </div>
              @if ((r.forkCount ?? 0) > remixes().length) {
                <span class="label mt-1 inline-block text-ink-4">
                  {{ t('game.seeAllRemixes', { n: r.forkCount }) }}
                </span>
              }
            </div>
          }
          @if (moreFrom().length) {
            <div class="mt-0.25 border-t border-line pt-2.25 lg:-mx-2.5 lg:px-2.5">
              <nc-label class="mb-1">
                {{ t('game.moreFrom', { name: r.creator.username }) }}
              </nc-label>
              <div class="grid gap-2">
                @for (g of moreFrom(); track g.id) {
                  <nc-game-card [game]="g" />
                }
              </div>
            </div>
          }
          @if (similar().length) {
            <div class="mt-0.25 border-t border-line pt-2.25 lg:-mx-2.5 lg:px-2.5">
              <nc-label class="mb-1">
                {{ r.tags[0] ? t('game.similarTag', { tag: r.tags[0] }) : t('game.similar') }}
              </nc-label>
              <div class="grid gap-2">
                @for (g of similar(); track g.id) {
                  <nc-game-card [game]="g" />
                }
              </div>
            </div>
          }
        }
      </aside>
    </div>
  `,
  // A column that fills what the shell left it, so the panel's own surface reaches the footer
  // instead of stopping at the height of whatever the sidebar happens to hold.
  host: { class: 'flex flex-1 flex-col' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GamePage {
  readonly id = input.required({ transform: numberAttribute });
  protected readonly auth = inject(AuthStore);
  private readonly screen = viewChild(GameScreenComponent);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly loader = inject(ReleaseGameService);
  private readonly presence = inject(PresenceStore);

  protected readonly release = injectRelease(() => this.id());
  protected readonly contentUrl = injectReleaseContentUrl(() => this.id());
  protected readonly likes = injectLikeStatus(() => this.id());
  private readonly toggle = injectToggleLike(() => this.id());
  protected readonly fork = injectFork();
  private readonly all = injectReleasesPage(() => 1, 48);

  /** Whether the description is shown in full, rather than clamped to its first lines. */
  protected readonly descOpen = signal(false);
  /**
   * Whether the clamp is actually hiding something — measured, because the alternative is a
   * character count, and how many characters fit in six lines depends on the width and the text.
   */
  protected readonly descClamped = signal(false);
  private readonly descEl = viewChild<ElementRef<HTMLElement>>('desc');

  protected readonly game = signal<Game | null>(null);
  /** Set when the content blob itself fails; the queries carry their own failures. */
  private readonly contentFailed = signal(false);

  /**
   * Why the game is not on screen, as a translation key — or null when it is.
   *
   * Three things have to go right and only one of them used to be watched: the release metadata,
   * the signed content URL, and the blob behind it. When either query failed the effect below
   * simply never ran, so the page sat on a black rectangle indefinitely, saying nothing.
   */
  protected readonly failure = computed<string | null>(() => {
    if (this.release.isError()) return 'game.loadFailedRelease';
    if (this.contentUrl.isError()) return 'game.loadFailedContent';
    if (this.contentFailed()) return 'game.loadFailedContent';
    return null;
  });
  protected readonly loading = computed(
    () => !this.failure() && !this.game() && (this.release.isPending() || !this.game()),
  );

  protected retry(): void {
    this.contentFailed.set(false);
    void this.release.refetch();
    void this.contentUrl.refetch();
  }

  protected readonly parent = injectRelease(() => this.release.data()?.forkedFromId ?? 0);

  /**
   * Who may go straight back into the editor; everyone else only gets REMIX.
   *
   * Being a collaborator is what the work-session endpoint checks, so it is what this has to
   * check. Reading the creator alone left an invited collaborator with no way in but typing
   * /edit/:id by hand — a right the backend grants and the page hid.
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
    // Tell our friends what we are playing — this is the only place PLAYING is ever announced,
    // and without it the friends page can never show anyone as in a game.
    effect((onCleanup) => {
      const id = this.id();
      if (!this.auth.isAuthenticated()) return;
      this.presence.announce({ kind: 'PLAYING', releaseId: id });
      onCleanup(() => {
        this.presence.announce({ kind: 'IDLE' });
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
            this.game.set(g);
            registerView(id);
          })
          .catch(() => {
            // The raw Error.message ("content 403", "Failed to fetch") is for the console, not
            // for the reader standing in front of a game that will not start.
            this.contentFailed.set(true);
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

  /** What the running game called its actions, once it has declared them. */
  protected readonly declaredActions = computed(
    () => this.screen()?.runtime.declaredActions() ?? [],
  );

  protected count(n: number): string {
    return formatCount(n);
  }

  protected toggleLike(): void {
    this.toggle.mutate(this.likes.data()?.liked ?? false);
  }

  protected remix(id: number): void {
    this.fork.mutate(id, {
      onSuccess: (p) => {
        this.toasts.show('Remixed into your games', 'success');
        void this.router.navigate(['/edit', p.id]);
      },
    });
  }
}
