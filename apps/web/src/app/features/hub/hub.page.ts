import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { EmptyStateComponent } from '@naucto/ui';

/** Placeholder until the hub ships in the next stack layer. */
@Component({
  selector: 'nc-hub-page',
  imports: [TranslocoDirective, EmptyStateComponent],
  template: `
    <nc-empty-state
      *transloco="let t"
      icon="home"
      [title]="t('hub.title')"
      [hint]="t('hub.soon')"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HubPage {}
