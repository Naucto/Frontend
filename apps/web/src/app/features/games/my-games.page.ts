import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { projectControllerFindAll, type ProjectExResponseDto } from '@naucto/api-client';
import {
  ButtonDirective,
  EmptyStateComponent,
  ErrorStateComponent,
  SkeletonComponent,
} from '@naucto/ui';
import { injectQuery } from '@tanstack/angular-query-experimental';

import { unwrap } from '../../core/api/api-errors';
import { qk } from '../../shared/queries/query-keys';
import { HubRowComponent } from '../hub/hub-row.component';

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
export default class MyGamesPage {
  protected readonly query = injectQuery(() => ({
    queryKey: qk.myProjects({ page: 1, limit: 100 }),
    queryFn: async () => unwrap(await projectControllerFindAll({ query: { page: 1, limit: 100 } })),
  }));
  protected readonly all = computed<ProjectExResponseDto[]>(
    () => this.query.data()?.projects ?? [],
  );
  protected readonly drafts = computed(() => this.all().filter((project) => !project.publishedAt));
  protected readonly published = computed(() =>
    this.all().filter((project) => !!project.publishedAt),
  );
}
