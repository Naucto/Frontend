import { inject, Injectable } from '@angular/core';
import { AuthStore } from '@app/core/auth/auth.store';
import { DialogService } from '@naucto/ui';

import { SignInDialogComponent } from './sign-in.dialog';

/**
 * Runs something the server only does for an account, asking the reader to sign in first when
 * they have none.
 *
 * A button greyed out for want of an account reads as broken to anyone who does not know the
 * rule, and the rule was never on screen. Asking over the page rather than routing to /sign-in
 * keeps whatever the page holds alive: a running game, a document, a netplay request half-way
 * through.
 */
@Injectable({ providedIn: 'root' })
export class SignedInAction {
  private readonly auth = inject(AuthStore);
  private readonly dialogs = inject(DialogService);

  /** `onDeclined` runs when the dialog closes any way other than by signing in. */
  run(action: () => void, onDeclined?: () => void): void {
    if (this.auth.isAuthenticated()) {
      action();
      return;
    }
    this.dialogs
      .open<SignInDialogComponent, undefined, boolean>(SignInDialogComponent, { width: '436px' })
      .closed.subscribe((signedIn) => {
        if (signedIn === true) action();
        else onDeclined?.();
      });
  }
}
