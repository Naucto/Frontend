import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { DialogService, ToastService } from '@naucto/ui';

import type { FlagContentData, FlagContentDialog } from './flag-content.dialog';
import { GoodStandingAction } from './good-standing-action';

/**
 * Opens the report of a game, a comment, a collection or a profile from anywhere, asking a
 * signed-out reader to sign in first: a report names the account it comes from.
 */
@Injectable({ providedIn: 'root' })
export class ContentFlagLauncher {
  private readonly dialogs = inject(DialogService);
  private readonly standing = inject(GoodStandingAction);
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  report(target: FlagContentData): void {
    this.standing.run(() => {
      void import('./flag-content.dialog').then((loaded) => {
        this.dialogs
          .open<FlagContentDialog, FlagContentData, boolean>(loaded.FlagContentDialog, {
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
    });
  }
}
