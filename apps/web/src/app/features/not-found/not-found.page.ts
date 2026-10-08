import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, EmptyStateComponent } from '@naucto/ui';

@Component({
  selector: 'nc-not-found-page',
  imports: [RouterLink, TranslocoDirective, ButtonDirective, EmptyStateComponent],
  templateUrl: './not-found.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class NotFoundPage {}
