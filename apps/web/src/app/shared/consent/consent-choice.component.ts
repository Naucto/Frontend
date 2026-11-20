import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { SettingRowComponent, ToggleComponent } from '@naucto/ui';

import { ConsentStore } from '../../core/analytics/consent.store';

/** The usage-analytics choice as a settings row: on once allowed, off while refused or unanswered. */
@Component({
  selector: 'nc-consent-choice',
  imports: [TranslocoDirective, SettingRowComponent, ToggleComponent],
  templateUrl: './consent-choice.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsentChoiceComponent {
  protected readonly consent = inject(ConsentStore);
}
