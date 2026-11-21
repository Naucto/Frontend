import { inject, Injectable } from '@angular/core';
import { DialogService } from '@naucto/ui';

import { AuthStore } from '../../core/auth/auth.store';
import type { SignInDialogComponent } from './sign-in.dialog';

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

  constructor() {
    // A reader with no account is the one who will be asked: the dialog is fetched once the page
    // is quiet, so it opens at once. Safari has no idle callback and fetches it on the first ask.
    if (!this.auth.isAuthenticated() && 'requestIdleCallback' in window) {
      requestIdleCallback(() => {
        void import('./sign-in.dialog');
      });
    }
  }

  /** `onDeclined` runs when the dialog closes any way other than by signing in. */
  run(action: () => void, onDeclined?: () => void): void {
    if (this.auth.isAuthenticated()) {
      action();
      return;
    }
    void import('./sign-in.dialog').then(
      (loaded) => {
        this.dialogs
          .open<SignInDialogComponent, undefined, boolean>(loaded.SignInDialogComponent, {
            width: '436px',
          })
          .closed.subscribe((signedIn) => {
            if (signedIn === true) {
              action();
            } else {
              onDeclined?.();
            }
          });
      },
      (error: unknown) => {
        // A dialog that could not be fetched is a refusal too: whoever asked must not wait on it.
        onDeclined?.();
        throw error;
      },
    );
  }
}
