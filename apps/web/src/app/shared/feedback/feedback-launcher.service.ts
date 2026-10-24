import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import type { ReportRole } from '@naucto/api-client';
import { DialogService } from '@naucto/ui';

import { SignedInAction } from '../auth/signed-in-action';
import { type BugReportData, BugReportDialog, type BugReportSent } from './bug-report.dialog';
import { RatingDialog, type RatingDialogData } from './rating.dialog';
import type { RatingSent } from './rating-form.component';
import { type ThanksData, ThanksDialog } from './thanks.dialog';

/** What someone asking to rate from this page is most likely doing on Naucto. */
export function roleFor(path: string): ReportRole {
  return path.startsWith('/edit/') || path.startsWith('/games') ? 'CREATOR' : 'PLAYER';
}

/**
 * Opens the bug report and the rating from anywhere, asking a signed-out reader to sign in first:
 * both name the account they come from.
 */
@Injectable({ providedIn: 'root' })
export class FeedbackLauncher {
  private readonly dialogs = inject(DialogService);
  private readonly signedIn = inject(SignedInAction);
  private readonly transloco = inject(TranslocoService);

  reportBug(data: BugReportData = {}): void {
    this.signedIn.run(() => {
      this.dialogs
        .open<BugReportDialog, BugReportData, BugReportSent>(BugReportDialog, {
          data,
          width: '560px',
          ariaLabel: this.transloco.translate('feedback.bug.title'),
        })
        .closed.subscribe((sent) => {
          if (sent) {
            this.thank({ kind: 'bug', ...sent });
          }
        });
    });
  }

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
            this.afterRating(sent);
          }
        });
    });
  }

  /** Thanks for a rating, or goes on to the bug report it asked for. */
  afterRating(sent: RatingSent): void {
    if (sent.reportBug) {
      this.reportBug({ ratingId: sent.id, description: sent.improve });
      return;
    }
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
