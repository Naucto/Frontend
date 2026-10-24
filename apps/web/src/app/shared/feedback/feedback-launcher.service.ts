import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import type { ReportRole } from '@naucto/api-client';
import { DialogService } from '@naucto/ui';

import { SignedInAction } from '../auth/signed-in-action';
import { RatingDialog, type RatingDialogData } from './rating.dialog';
import type { RatingSent } from './rating-form.component';
import { type ThanksData, ThanksDialog } from './thanks.dialog';

/** What someone asking to rate from this page is most likely doing on Naucto. */
export function roleFor(path: string): ReportRole {
  return path.startsWith('/edit/') || path.startsWith('/games') ? 'CREATOR' : 'PLAYER';
}

/**
 * Opens the rating from anywhere, asking a signed-out reader to sign in first: a rating names the
 * account it comes from.
 */
@Injectable({ providedIn: 'root' })
export class FeedbackLauncher {
  private readonly dialogs = inject(DialogService);
  private readonly signedIn = inject(SignedInAction);
  private readonly transloco = inject(TranslocoService);

  rate(role: ReportRole = roleFor(location.pathname)): void {
    this.signedIn.run(() => {
      this.dialogs
        .open<RatingDialog, RatingDialogData, RatingSent>(RatingDialog, {
          data: { role },
          width: '440px',
          ariaLabel: this.transloco.translate('feedback.rating.dialogTitle'),
        })
        .closed.subscribe((sent) => {
          if (sent) {
            this.afterRating();
          }
        });
    });
  }

  afterRating(): void {
    this.thank({ kind: 'rating' });
  }

  private thank(data: ThanksData): void {
    this.dialogs.open<ThanksDialog, ThanksData>(ThanksDialog, {
      data,
      width: '440px',
      ariaLabel: this.transloco.translate('feedback.thanks.title'),
    });
  }
}
