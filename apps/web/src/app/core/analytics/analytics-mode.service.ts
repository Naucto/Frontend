import { computed, inject, Injectable } from '@angular/core';

import { FeaturesService } from '../config/features.service';
import { BrowserAccountService } from './browser-account.service';
import { ConsentStore } from './consent.store';

/**
 * `consented`: reports carry the browser's visitor and session. `anonymous`: reports carry no
 * identifier at all. `off`: nothing is reported.
 */
export type AnalyticsMode = 'off' | 'consented' | 'anonymous';

/** How this tab may report usage right now. */
@Injectable({ providedIn: 'root' })
export class AnalyticsModeService {
  private readonly features = inject(FeaturesService);
  private readonly consent = inject(ConsentStore);
  private readonly account = inject(BrowserAccountService);

  /** The OAuth popup is open for a moment, and only to hand a code back to its opener. */
  private readonly popup = location.pathname.startsWith('/oauth');

  readonly mode = computed<AnalyticsMode>(() => {
    if (!this.features.analytics() || this.popup) {
      return 'off';
    }
    return this.consent.status() === 'granted' && !this.account.suspended()
      ? 'consented'
      : 'anonymous';
  });
}
