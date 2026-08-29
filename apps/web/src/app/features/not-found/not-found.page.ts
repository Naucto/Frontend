import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, EmptyStateComponent } from '@naucto/ui';

@Component({
  selector: 'nc-not-found-page',
  imports: [RouterLink, TranslocoDirective, ButtonDirective, EmptyStateComponent],
  template: `
    <nc-empty-state
      *transloco="let t"
      icon="folder-x"
      [title]="t('notFound.title')"
      [hint]="t('notFound.body')"
    >
      <a ncButton variant="primary" routerLink="/hub">{{ t('notFound.back') }}</a>
    </nc-empty-state>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPage {}
