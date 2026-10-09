import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, PanelComponent } from '@naucto/ui';
import { filter, map } from 'rxjs';

import { ConsentStore } from '../../core/analytics/consent.store';
import { FeaturesService } from '../../core/config/features.service';

/**
 * Asks once whether usage may be measured, with both answers equally easy. Waits for the first
 * navigation, and never shows in an OAuth callback, which is a popup about to close.
 */
@Component({
  selector: 'nc-consent-banner',
  imports: [TranslocoDirective, RouterLink, ButtonDirective, PanelComponent],
  templateUrl: './consent-banner.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsentBannerComponent {
  private readonly consent = inject(ConsentStore);
  private readonly features = inject(FeaturesService);

  private readonly url = toSignal(
    inject(Router).events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: null },
  );

  protected readonly visible = computed(() => {
    const url = this.url();
    return (
      this.features.analytics() &&
      this.consent.status() === 'unknown' &&
      url !== null &&
      !url.startsWith('/oauth')
    );
  });

  protected accept(): void {
    this.consent.grant();
  }

  protected refuse(): void {
    this.consent.deny();
  }
}
