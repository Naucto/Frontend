import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { DialogService, ToastService } from '@naucto/ui';

import { SignedInAction } from '../auth/signed-in-action';
import { type FlagContentData, FlagContentDialog } from './flag-content.dialog';

/**
 * Opens the report of a game, a comment or a profile from anywhere, asking a signed-out reader to
 * sign in first: a report names the account it comes from.
 */
@Injectable({ providedIn: 'root' })
export class ContentFlagLauncher {
  private readonly dialogs = inject(DialogService);
  private readonly signedIn = inject(SignedInAction);
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  report(target: FlagContentData): void {
    this.signedIn.run(() => {
      this.dialogs
        .open<FlagContentDialog, FlagContentData, boolean>(FlagContentDialog, {
          data: target,
          width: '480px',
          ariaLabel: this.transloco.translate(`moderation.report.title.${target.targetType}`),
        })
        .closed.subscribe((sent) => {
          if (sent === true) {
            this.toasts.show(this.transloco.translate('moderation.report.sent'), 'success');
          }
        });
    });
  }
}
