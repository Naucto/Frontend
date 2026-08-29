import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { unwrap } from '@app/core/api/api-errors';
import { HubRowComponent } from '@app/features/hub/hub-row.component';
import { GameCardComponent } from '@app/shared/game-card/game-card.component';
import { qk } from '@app/shared/queries/query-keys';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  projectControllerCreate,
  projectControllerFindAll,
  type ProjectExResponseDto,
} from '@naucto/api-client';
import {
  ButtonDirective,
  EmptyStateComponent,
  ErrorStateComponent,
  IconComponent,
  SkeletonComponent,
} from '@naucto/ui';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';

@Component({
  selector: 'nc-my-games-page',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    EmptyStateComponent,
    ErrorStateComponent,
    SkeletonComponent,
    IconComponent,
    HubRowComponent,
    GameCardComponent,
  ],
  template: `
    <div *transloco="let t" class="grid gap-4">
      <div class="flex items-center justify-between">
        <h1 class="text-display text-ink">{{ t('games.title') }}</h1>
        <button ncButton variant="primary" (click)="create()" [disabled]="creating.isPending()">
          <nc-icon name="plus" [size]="12" />
          {{ t('nav.newGame') }}
        </button>
      </div>
      @if (query.isError()) {
        <!-- Never the "you have no games" copy: someone with a shelf full of them would read that
             as having lost the lot. -->
        <nc-error-state
          [title]="t('games.loadFailed')"
          [hint]="t('hub.rowError')"
          [retryLabel]="t('game.retry')"
          (retry)="query.refetch()"
        />
      } @else if (query.isPending()) {
        <div class="grid gap-1">
          <nc-skeleton height="1.25rem" width="30%" />
          <nc-skeleton height="112px" radius="rounded-md" />
          <nc-skeleton height="112px" radius="rounded-md" />
        </div>
      } @else if (!all().length) {
        <nc-empty-state
          icon="file-plus"
          [title]="t('games.emptyTitle')"
          [hint]="t('games.emptyHint')"
        >
          <button ncButton variant="primary" (click)="create()">+ {{ t('nav.newGame') }}</button>
        </nc-empty-state>
      } @else {
        <section>
          <h2 class="mb-1.5 text-title text-ink">
            {{ t('games.drafts') }}
            <span class="label">{{ drafts().length }}</span>
          </h2>
          <div
            class="grid gap-2"
            [style.gridTemplateColumns]="'repeat(auto-fill, minmax(200px, 1fr))'"
          >
            @for (g of drafts(); track g.id) {
              <nc-game-card [game]="g" [draft]="true" />
            } @empty {
              <p class="text-body text-ink-3">{{ t('games.noDrafts') }}</p>
            }
          </div>
        </section>
        <nc-hub-row
          [title]="t('games.published')"
          [games]="published()"
          [empty]="t('games.noPublished')"
        />
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyGamesPage {
  private readonly router = inject(Router);
  private readonly qc = inject(QueryClient);
  protected readonly page = signal(1);
  protected readonly query = injectQuery(() => ({
    queryKey: qk.myProjects({ page: this.page(), limit: 100 }),
    queryFn: async () =>
      unwrap(await projectControllerFindAll({ query: { page: this.page(), limit: 100 } })),
  }));
  protected readonly all = computed<ProjectExResponseDto[]>(
    () => this.query.data()?.projects ?? [],
  );
  protected readonly drafts = computed(() => this.all().filter((g) => !g.publishedAt));
  protected readonly published = computed(() => this.all().filter((g) => !!g.publishedAt));

  protected readonly creating = injectMutation(() => ({
    mutationFn: async () =>
      unwrap(await projectControllerCreate({ body: { name: 'Untitled game', shortDesc: '' } })),
    onSuccess: async (project: { id: number }) => {
      await this.qc.invalidateQueries({ queryKey: ['projects'] });
      await this.router.navigate(['/edit', project.id]);
    },
  }));

  protected create(): void {
    this.creating.mutate();
  }
}
