import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  input,
  model,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import type { GameSessionResponseDto, HubResponseDto } from '@naucto/api-client';
import {
  ArrowLinkDirective,
  ErrorStateComponent,
  ShelfComponent,
  ShelfFlyoutDirective,
  ShelfItemDirective,
  SkeletonComponent,
} from '@naucto/ui';
import type { CreateQueryResult } from '@tanstack/angular-query-experimental';

import { AuthStore } from '../../core/auth/auth.store';
import { FloppyComponent } from '../../shared/game-card/floppy.component';
import { CollectionBoxComponent } from '../../shared/hub/collection-box.component';
import { GameFlyoutComponent } from '../../shared/hub/game-flyout.component';
import { type HeroEntry, HeroPileComponent } from '../../shared/hub/hero-pile.component';
import type { HubGame } from '../../shared/hub/hub-game';
import { SessionDiskComponent } from '../../shared/hub/session-disk.component';
import { SessionFlyoutComponent } from '../../shared/hub/session-flyout.component';
import { ShelfDiskComponent } from '../../shared/hub/shelf-disk.component';
import { injectLeaveSession, injectOpenSessions } from '../../shared/queries/hub.queries';
import { injectMyProjects } from '../../shared/queries/projects.queries';
import { HubShelfComponent } from './hub-shelf.component';
import { ShelfSkeletonComponent } from './shelf-skeleton.component';
import { TagShelvesComponent } from './tag-shelves.component';

/** How many of the reader's own games their shelf shows, and how many shelves are asked for at once. */
const MINE_SHOWN = 24;
const BATCH = 3;

/**
 * The hub itself: the hero, the reader's own shelves when they are signed in, the shelves of the
 * day, then the tag shelves, asked for a few at a time as the reader nears the end of the page.
 */
@Component({
  selector: 'nc-hub-feed',
  imports: [
    RouterLink,
    TranslocoDirective,
    ArrowLinkDirective,
    CollectionBoxComponent,
    ErrorStateComponent,
    FloppyComponent,
    GameFlyoutComponent,
    HeroPileComponent,
    HubShelfComponent,
    SessionDiskComponent,
    SessionFlyoutComponent,
    ShelfComponent,
    ShelfDiskComponent,
    ShelfFlyoutDirective,
    ShelfItemDirective,
    ShelfSkeletonComponent,
    SkeletonComponent,
    TagShelvesComponent,
  ],
  templateUrl: './hub-feed.component.html',
  host: { class: 'relative grid min-w-0 content-start gap-[56px]' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HubFeedComponent {
  readonly feed = input.required<CreateQueryResult<HubResponseDto>>();
  /** The hero's disk in front, from 0. */
  readonly front = model(0);

  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  protected readonly viewer = computed(() => this.auth.user()?.username ?? null);
  protected readonly hero = computed<HeroEntry[]>(() =>
    (this.feed().data()?.hero ?? []).map(({ reason, reasonGame, game }) => ({
      reason: this.transloco.translate(`hub.reason.${reason}`, { name: reasonGame?.name ?? '' }),
      game,
      mine: game.creator.id === this.auth.user()?.id,
    })),
  );

  private readonly projects = injectMyProjects(MINE_SHOWN);
  /** The reader's shelf opens on the game that does not exist yet; null until their games answer. */
  protected readonly mine = computed<readonly (HubGame | null)[] | null>(() => {
    const projects = this.projects.data()?.projects;
    return this.auth.isAuthenticated() && projects ? [null, ...projects] : null;
  });
  protected readonly mineTotal = computed(() => this.projects.data()?.total ?? 0);
  protected readonly isGame = (game: HubGame | null): boolean => game !== null;

  private readonly openSessions = injectOpenSessions();
  protected readonly sessions = computed(() =>
    this.auth.isAuthenticated() ? (this.openSessions.data() ?? []) : [],
  );
  protected readonly leave = injectLeaveSession();

  protected readonly batches = computed(() => {
    const keys = this.feed().data()?.more ?? [];
    return Array.from({ length: Math.ceil(keys.length / BATCH) }, (_, i) =>
      keys.slice(i * BATCH, (i + 1) * BATCH),
    );
  });
  /** How many batches have been asked for. */
  protected readonly asked = signal(0);
  private readonly batchViews = viewChildren(TagShelvesComponent);
  private readonly sentinel = viewChild<ElementRef<HTMLElement>>('sentinel');

  protected play(game: HubGame): void {
    void this.router.navigate(['/play', game.id]);
  }

  protected join(session: GameSessionResponseDto): void {
    void this.router.navigate(['/play', session.projectId], {
      queryParams: { session: session.sessionUuid },
    });
  }

  constructor() {
    const observer = new IntersectionObserver(
      ([entry]) => {
        const views = this.batchViews();
        // One batch at a time, and none before the last one asked for is on the page.
        if (
          entry?.isIntersecting &&
          views.length === this.asked() &&
          !views.at(-1)?.shelves.isPending()
        ) {
          this.asked.update((asked) => asked + 1);
        }
      },
      { rootMargin: '600px 0px' },
    );
    inject(DestroyRef).onDestroy(() => {
      observer.disconnect();
    });

    // The observer speaks only when the end of the page crosses its margin. A batch that answers
    // or fails moves that end, or leaves it where it was: either way it is looked at afresh, so a
    // failed batch holds nothing back.
    effect(() => {
      const sentinel = this.sentinel()?.nativeElement;
      observer.disconnect();
      if (sentinel && !this.batchViews().at(-1)?.shelves.isPending()) {
        observer.observe(sentinel);
      }
    });
  }
}
