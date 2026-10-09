import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHostComponent } from '@naucto/ui';

import { AnalyticsService } from './core/analytics/analytics.service';
import { HeartbeatService } from './core/analytics/heartbeat.service';
import { ThemeService } from './core/theme/theme.service';
import { SessionExpiredDialogComponent } from './features/auth/session-expired.dialog';
import { ConsentBannerComponent } from './shared/consent/consent-banner.component';

@Component({
  selector: 'nc-root',
  imports: [
    RouterOutlet,
    ToastHostComponent,
    SessionExpiredDialogComponent,
    ConsentBannerComponent,
  ],
  // The banner comes first so a keyboard reaches it first.
  template: '<nc-consent-banner /><router-outlet /><nc-toast-host /><nc-session-expired-dialog />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  // Instantiated eagerly so the theme attribute is applied before the first route renders.
  protected readonly themeService = inject(ThemeService);
  // Instantiated eagerly so the landing page and its referrer are counted, and the tab beats, from boot.
  protected readonly analytics = inject(AnalyticsService);
  protected readonly heartbeat = inject(HeartbeatService);
}
