import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { AuthStore } from '@app/core/auth/auth.store';
import { TranslocoService } from '@jsverse/transloco';
import { ConfirmDialogComponent, DialogService } from '@naucto/ui';

/** Opens a blocking dialog whenever the session lapses; mounted once in the root. */
@Component({
  selector: 'nc-session-expired-dialog',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionExpiredDialogComponent {
  private readonly auth = inject(AuthStore);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);
  private readonly i18n = inject(TranslocoService);

  constructor() {
    effect(() => {
      if (!this.auth.sessionExpired()) return;
      untracked(() => {
        this.dialogs
          .open<ConfirmDialogComponent, unknown, boolean>(ConfirmDialogComponent, {
            data: {
              title: this.i18n.translate('auth.sessionExpired'),
              message: this.i18n.translate('auth.sessionExpiredBody'),
              confirmLabel: this.i18n.translate('auth.signIn'),
              cancelLabel: this.i18n.translate('auth.ok'),
            },
          })
          .closed.subscribe((signIn) => {
            this.auth.dismissSessionExpired();
            if (signIn)
              void this.router.navigate(['/sign-in'], { queryParams: { next: this.router.url } });
          });
      });
    });
  }
}
