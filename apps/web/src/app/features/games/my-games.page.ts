import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  type CollectionDto,
  projectControllerFindAll,
  type ProjectExResponseDto,
} from '@naucto/api-client';
import {
  ButtonDirective,
  ChipComponent,
  DialogService,
  ErrorStateComponent,
  IconComponent,
  MarkComponent,
  ShelfComponent,
  ShelfFlyoutDirective,
  ShelfItemDirective,
  SkeletonComponent,
} from '@naucto/ui';
import { injectQuery } from '@tanstack/angular-query-experimental';

import { unwrap } from '../../core/api/api-errors';
import {
  CollectionDialogComponent,
  type CollectionDialogData,
} from '../../shared/collections/collection.dialog';
import { FloppyComponent } from '../../shared/game-card/floppy.component';
import { CollectionBoxComponent } from '../../shared/hub/collection-box.component';
import { GameFlyoutComponent } from '../../shared/hub/game-flyout.component';
import type { HubGame } from '../../shared/hub/hub-game';
import { ShelfDiskComponent } from '../../shared/hub/shelf-disk.component';
import { injectMyCollections } from '../../shared/queries/collections.queries';
import { qk } from '../../shared/queries/query-keys';

type Shelf = 'drafts' | 'published' | 'collections';

const hubGame = (project: ProjectExResponseDto): HubGame => ({
  ...project,
  coverUrl: project.coverUrl ?? null,
});

/**
 * The signed-in person's own shelves: drafts, published games, collections. Each is a carousel;
 * `?all=` opens one of them out into everything it holds.
 */
@Component({
  selector: 'nc-my-games-page',
  imports: [
    NgTemplateOutlet,
    TranslocoDirective,
    RouterLink,
    ButtonDirective,
    ChipComponent,
    CollectionBoxComponent,
    ErrorStateComponent,
    FloppyComponent,
    GameFlyoutComponent,
    IconComponent,
    MarkComponent,
    ShelfComponent,
    ShelfDiskComponent,
    ShelfFlyoutDirective,
    ShelfItemDirective,
    SkeletonComponent,
  ],
  templateUrl: './my-games.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class MyGamesPage {
  readonly all = input<string>();

  protected readonly router = inject(Router);
  private readonly dialogs = inject(DialogService);

  protected readonly query = injectQuery(() => ({
    queryKey: qk.myProjects({ page: 1, limit: 100 }),
    queryFn: async () => unwrap(await projectControllerFindAll({ query: { page: 1, limit: 100 } })),
  }));
  protected readonly collections = injectMyCollections();

  private readonly projects = computed(() => this.query.data()?.projects ?? []);
  protected readonly drafts = computed(() =>
    this.projects()
      .filter((project) => !project.publishedAt)
      .map(hubGame),
  );
  protected readonly published = computed(() =>
    this.projects()
      .filter((project) => !!project.publishedAt)
      .map(hubGame),
  );
  /** A shelf leads with what does not exist yet: the game, or the collection, to make. */
  protected readonly draftItems = computed<(HubGame | null)[]>(() => [null, ...this.drafts()]);
  protected readonly collectionItems = computed(() => [null, ...(this.collections.data() ?? [])]);

  protected readonly opened = computed<Shelf | null>(() => {
    const shelf = this.all();
    return shelf === 'drafts' || shelf === 'published' || shelf === 'collections' ? shelf : null;
  });

  protected readonly isGame = (game: HubGame | null): boolean => game !== null;

  protected newCollection(): void {
    this.dialogs
      .open<CollectionDialogComponent, CollectionDialogData, CollectionDto>(
        CollectionDialogComponent,
        { width: '520px', data: {} },
      )
      .closed.subscribe((created) => {
        if (created) {
          void this.router.navigate(['/collections', created.id]);
        }
      });
  }
}
