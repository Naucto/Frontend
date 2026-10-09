import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { SegmentedComponent, type SegmentOption, SettingRowComponent } from '@naucto/ui';

import { ConsentStore } from '../../core/analytics/consent.store';

type Choice = 'allow' | 'refuse';

/** The usage-analytics choice as a settings row; shows no choice until one is made. */
@Component({
  selector: 'nc-consent-choice',
  imports: [TranslocoDirective, SettingRowComponent, SegmentedComponent],
  templateUrl: './consent-choice.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsentChoiceComponent {
  private readonly consent = inject(ConsentStore);
  private readonly i18n = inject(TranslocoService);

  protected readonly options = computed<SegmentOption<Choice>[]>(() => [
    { value: 'allow', label: this.i18n.translate('consent.allow') },
    { value: 'refuse', label: this.i18n.translate('consent.refuse') },
  ]);

  protected readonly value = computed<Choice | undefined>(() => {
    const status = this.consent.status();
    return status === 'granted' ? 'allow' : status === 'denied' ? 'refuse' : undefined;
  });

  protected choose(choice: Choice | undefined): void {
    if (choice === 'allow') {
      this.consent.grant();
    } else if (choice === 'refuse') {
      this.consent.deny();
    }
  }
}
