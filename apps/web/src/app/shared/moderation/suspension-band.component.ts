import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { NoticeComponent } from '@naucto/ui';

import { AuthStore } from '../../core/auth/auth.store';
import { FeaturesService } from '../../core/config/features.service';

const UNTIL = new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short' });

/**
 * Tells a suspended account, on every page, that it is suspended and until when. Draws nothing
 * for anyone else.
 */
@Component({
  selector: 'nc-suspension-band',
  imports: [RouterLink, TranslocoDirective, NoticeComponent],
  templateUrl: './suspension-band.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuspensionBandComponent {
  protected readonly auth = inject(AuthStore);
  protected readonly features = inject(FeaturesService);

  /** When the suspension ends by itself, as the reader's own clock says it. Null when it has no end. */
  protected readonly until = computed(() => {
    const end = this.auth.suspension()?.until;
    return end ? UNTIL.format(new Date(end)) : null;
  });
}
