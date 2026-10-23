import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { PanelComponent } from '@naucto/ui';

import { FeaturesService } from '../../core/config/features.service';
import { ConsentChoiceComponent } from '../../shared/consent/consent-choice.component';

/**
 * What usage analytics measures, under which choice, for how long; what feedback and crash reports
 * carry; and the choice itself.
 */
@Component({
  selector: 'nc-privacy-page',
  imports: [TranslocoDirective, RouterLink, PanelComponent, ConsentChoiceComponent],
  templateUrl: './privacy.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class PrivacyPage {
  protected readonly accepted = ['pages', 'plays', 'context', 'account'] as const;
  protected readonly refused = ['nothingStored', 'ping', 'plays', 'views'] as const;
  protected readonly retention = ['raw', 'aggregate', 'history', 'choice'] as const;
  protected readonly feedbackItems = ['crashes', 'reports', 'screenshots', 'ratings'] as const;
  protected readonly features = inject(FeaturesService);
}
