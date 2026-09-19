import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastHostComponent } from '@naucto/ui';

import { ThemeService } from './core/theme/theme.service';
import { SessionExpiredDialogComponent } from './features/auth/session-expired.dialog';

@Component({
  selector: 'nc-root',
  imports: [RouterOutlet, ToastHostComponent, SessionExpiredDialogComponent],
  template: '<router-outlet /><nc-toast-host /><nc-session-expired-dialog />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  // Instantiated eagerly so the theme attribute is applied before the first route renders.
  protected readonly theme = inject(ThemeService);
}
