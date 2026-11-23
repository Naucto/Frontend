import { CdkDrag, type CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import type { CollectionDto } from '@naucto/api-client';
import {
  ButtonDirective,
  CheckboxComponent,
  ChipComponent,
  DialogService,
  EmptyStateComponent,
  ErrorStateComponent,
  FitTextDirective,
  HelpDotComponent,
  IconComponent,
  MarkComponent,
  ReadoutComponent,
  RelativeTimePipe,
  SkeletonComponent,
  StatComponent,
  ToastService,
  ToggleButtonComponent,
} from '@naucto/ui';

import { ApiError } from '../../core/api/api-errors';
import { AuthStore } from '../../core/auth/auth.store';
import {
  CollectionDialogComponent,
  type CollectionDialogData,
} from '../../shared/collections/collection.dialog';
import { VisibilityChipComponent } from '../../shared/collections/visibility-chip.component';
import { diskStyleFor } from '../../shared/game-card/disk-style';
import { DISK_RATIO, FloppyComponent } from '../../shared/game-card/floppy.component';
import { ShelfDiskComponent } from '../../shared/hub/shelf-disk.component';
import { GoodStandingAction } from '../../shared/moderation/good-standing-action';
import {
  injectCollection,
  injectDeleteCollection,
  injectReorderCollection,
  injectSetInCollection,
} from '../../shared/queries/collections.queries';
import { UserAvatarComponent } from '../../shared/user-avatar.component';
import NotFoundPage from '../not-found/not-found.page';

/** How many disks stand in the hero's box before the rest are one tile. */
const HERO_DISKS = 6;
/** How far apart they stand while the box has room to spare, in pixels. */
const HERO_STEP = 56;
/** How long the copy button stands as its own answer. */
const COPIED_MS = 1600;

/**
 * One collection: the box it is, opened over a tray of its disks in order. Its owner edits and
 * deletes it here, and in the organize mode moves its disks, by drag or by each disk's two
 * arrows, and takes out the ones ticked.
 */
@Component({
  selector: 'nc-collection-page',
  imports: [
    CdkDrag,
    CdkDropList,
    RouterLink,
    TranslocoDirective,
    ButtonDirective,
    CheckboxComponent,
    ChipComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    FitTextDirective,
    FloppyComponent,
    HelpDotComponent,
    IconComponent,
    MarkComponent,
    NotFoundPage,
    ReadoutComponent,
    RelativeTimePipe,
    ShelfDiskComponent,
    SkeletonComponent,
    StatComponent,
    ToggleButtonComponent,
    UserAvatarComponent,
    VisibilityChipComponent,
  ],
  templateUrl: './collection.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class CollectionPage {
  readonly id = input.required<string>();

  private readonly auth = inject(AuthStore);
  private readonly standing = inject(GoodStandingAction);
  private readonly router = inject(Router);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  private readonly i18n = inject(TranslocoService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly query = injectCollection(() => this.id());
  private readonly reorder = injectReorderCollection();
  private readonly membership = injectSetInCollection();
  private readonly deletion = injectDeleteCollection();

  protected readonly DISK_RATIO = DISK_RATIO;

  /** Nothing to show for this address: no such collection, a private one, or no id at all. */
  protected readonly missing = computed(() => {
    const error = this.query.error();
    return error instanceof ApiError && (error.status === 404 || error.status === 400);
  });
  protected readonly owned = computed(() => {
    const viewer = this.auth.userId();
    return viewer !== null && viewer === this.query.data()?.owner.id;
  });
  protected readonly link = computed(() => `${location.origin}/collections/${this.id()}`);
  protected readonly copied = signal(false);

  /** Leaving the mode, or the collection, forgets what was ticked. */
  protected readonly organizing = linkedSignal({
    source: () => this.id(),
    computation: () => false,
  });
  protected readonly picked = linkedSignal<boolean, ReadonlySet<number>>({
    source: () => this.organizing(),
    computation: () => new Set(),
  });
  /** What the last move did, for whoever cannot see the tray. */
  protected readonly moved = signal('');
  /** The disk an arrow just moved and where it goes: its arrow is focused again once it is there. */
  private readonly following = signal<{ game: number; by: -1 | 1; to: number } | null>(null);

  /**
   * The order its owner gave the games on this page. It holds over what the server answers: an
   * answer to an earlier move arrives after later ones were made, and would undo them on screen.
   */
  private readonly order = linkedSignal<string, readonly number[] | null>({
    source: () => this.id(),
    computation: () => null,
  });
  protected readonly games = computed(() => {
    const games = this.query.data()?.games ?? [];
    const order = this.order();
    if (!order) {
      return games;
    }
    const place = (id: number): number => {
      const at = order.indexOf(id);
      return at < 0 ? order.length : at;
    };
    return [...games].sort((a, b) => place(a.id) - place(b.id));
  });

  protected readonly hero = computed(() => {
    const games = this.games();
    const shown = games.slice(0, games.length > HERO_DISKS + 1 ? HERO_DISKS : games.length);
    const more = games.length - shown.length;
    const last = shown.length + (more ? 1 : 0) - 1;
    const left = (place: number): string =>
      `min(${String(place * HERO_STEP)}px, calc((100% - 140px) * ${(last ? place / last : 0).toFixed(4)}))`;
    return {
      disks: shown.map((game, place) => ({ game, disk: diskStyleFor(game), left: left(place) })),
      more,
      moreLeft: left(shown.length),
    };
  });

  protected copy(): void {
    void navigator.clipboard.writeText(this.link()).then(() => {
      this.copied.set(true);
      setTimeout(() => {
        this.copied.set(false);
      }, COPIED_MS);
    });
  }

  protected edit(collection: CollectionDto): void {
    this.standing.run(() => {
      this.dialogs.open<CollectionDialogComponent, CollectionDialogData>(
        CollectionDialogComponent,
        { width: '520px', data: { collection } },
      );
    });
  }

  protected delete(collection: CollectionDto): void {
    this.standing.run(() => {
      void this.dialogs
        .confirmDanger({
          kicker: this.i18n.translate('collections.deleteConfirm'),
          title: this.i18n.translate('collections.deleteTitle', { title: collection.title }),
          message: this.i18n.translate('collections.deleteMessage'),
          confirmLabel: this.i18n.translate('collections.deleteConfirm'),
        })
        .then((confirmed) => {
          if (!confirmed) {
            return;
          }
          this.deletion.mutate(collection.id, {
            onSuccess: () => {
              this.toasts.show(
                this.i18n.translate('collections.deleted', { title: collection.title }),
                'success',
              );
              void this.router.navigate(['/games']);
            },
            onError: () => {
              this.toasts.show(this.i18n.translate('collections.deleteFailed'), 'error');
            },
          });
        });
    });
  }

  protected pick(game: number, on: boolean): void {
    this.picked.update((picked) => {
      const next = new Set(picked);
      if (on) {
        next.add(game);
      } else {
        next.delete(game);
      }
      return next;
    });
  }

  protected remove(games: Iterable<number>): void {
    this.standing.run(() => {
      const id = this.id();
      void Promise.allSettled(
        Array.from(games, (projectId) =>
          this.membership.mutateAsync({ id, projectId, holds: false }),
        ),
      ).then((results) => {
        this.picked.set(new Set());
        if (results.some((result) => result.status === 'rejected')) {
          this.toasts.show(this.i18n.translate('collections.removeFailed'), 'error');
        }
      });
    });
  }

  private place(from: number, to: number): void {
    const games = this.games();
    const game = games[from];
    if (!game || !games[to] || to === from) {
      return;
    }
    this.standing.run(
      () => {
        const projectIds = games.map((other) => other.id);
        projectIds.splice(to, 0, ...projectIds.splice(from, 1));
        this.order.set(projectIds);
        this.moved.set(
          this.i18n.translate('collections.moved', {
            name: game.name,
            position: to + 1,
            count: games.length,
          }),
        );
        this.reorder.mutate(
          { id: this.id(), projectIds },
          {
            onError: () => {
              this.following.set(null);
              this.order.set(null);
              this.toasts.show(this.i18n.translate('collections.reorderFailed'), 'error');
            },
          },
        );
      },
      () => {
        this.following.set(null);
      },
    );
  }

  protected drop(event: CdkDragDrop<unknown>): void {
    this.place(event.previousIndex, event.currentIndex);
  }

  /**
   * The keyboard's way to move a disk: the focus follows it to where it lands. The disk is named,
   * not counted: a second press comes before the tray is drawn again, when its place is out of date.
   */
  protected step(game: number, by: -1 | 1): void {
    const from = this.games().findIndex((other) => other.id === game);
    if (this.games()[from + by]) {
      this.following.set({ game, by, to: from + by });
      this.place(from, from + by);
    }
  }

  constructor() {
    afterRenderEffect(() => {
      const follow = this.following();
      if (!follow || this.games()[follow.to]?.id !== follow.game) {
        return;
      }
      const arrows = this.host.querySelectorAll<HTMLButtonElement>(
        `[data-move="${String(follow.game)}"]`,
      );
      // The arrow that was pressed is out of use once the disk reaches that end.
      const pressed = arrows[follow.by < 0 ? 0 : 1];
      (pressed?.disabled ? arrows[follow.by < 0 ? 1 : 0] : pressed)?.focus();
      this.following.set(null);
    });
  }
}
