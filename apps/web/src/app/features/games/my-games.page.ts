import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { unwrap } from '@app/core/api/api-errors';
import { HubRowComponent } from '@app/features/hub/hub-row.component';
import { qk } from '@app/shared/queries/query-keys';
import { TranslocoDirective } from '@jsverse/transloco';
import { projectControllerFindAll, type ProjectExResponseDto } from '@naucto/api-client';
import {
  ButtonDirective,
  EmptyStateComponent,
  ErrorStateComponent,
  SkeletonComponent,
} from '@naucto/ui';
import { injectQuery } from '@tanstack/angular-query-experimental';

@Component({
  selector: 'nc-my-games-page',
  imports: [
    TranslocoDirective,
    RouterLink,
    ButtonDirective,
    EmptyStateComponent,
    ErrorStateComponent,
    SkeletonComponent,
    HubRowComponent,
  ],
  templateUrl: './my-games.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyGamesPage {
  protected readonly query = injectQuery(() => ({
    queryKey: qk.myProjects({ page: 1, limit: 100 }),
    queryFn: async () => unwrap(await projectControllerFindAll({ query: { page: 1, limit: 100 } })),
  }));
  protected readonly all = computed<ProjectExResponseDto[]>(
    () => this.query.data()?.projects ?? [],
  );
  protected readonly drafts = computed(() => this.all().filter((g) => !g.publishedAt));
  protected readonly published = computed(() => this.all().filter((g) => !!g.publishedAt));
}
