import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, NoticeComponent } from '@naucto/ui';

import { AuthStore } from '../../core/auth/auth.store';
import { FeaturesService } from '../../core/config/features.service';

/**
 * Tells a suspended account, on every page, that it is suspended and until when. Draws nothing
 * for anyone else.
 */
@Component({
  selector: 'nc-suspension-band',
  imports: [DatePipe, RouterLink, TranslocoDirective, ButtonDirective, NoticeComponent],
  templateUrl: './suspension-band.component.html',
  // Stacked over the page: the hub paints a backdrop across the whole window, which covers a band
  // left in the flow.
  host: { class: 'relative z-10 block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuspensionBandComponent {
  protected readonly auth = inject(AuthStore);
  protected readonly features = inject(FeaturesService);
}
