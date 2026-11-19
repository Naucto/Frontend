import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { ToastService } from '@naucto/ui';

import { AuthStore } from '../../core/auth/auth.store';
import { SignedInAction } from '../auth/signed-in-action';

/**
 * Runs something the server only does for an account in good standing: it asks a signed-out
 * reader to sign in first, as {@link SignedInAction} does, and tells a suspended account why
 * nothing happens.
 *
 * The server refuses a suspended account's writes whatever the page does. Saying so on the press
 * spares the request and answers in the app's own words, where a control left greyed out would
 * never say what the rule is.
 */
@Injectable({ providedIn: 'root' })
export class GoodStandingAction {
  private readonly auth = inject(AuthStore);
  private readonly signedIn = inject(SignedInAction);
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  /** `onDeclined` runs when the action does not: no sign-in, or a suspended account. */
  run(action: () => void, onDeclined?: () => void): void {
    this.signedIn.run(() => {
      if (this.auth.suspension()) {
        this.toasts.show(this.transloco.translate('moderation.suspended.blocked'), 'warning');
        onDeclined?.();
        return;
      }
      action();
    }, onDeclined);
  }
}
