import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { FeedbackContext } from '@naucto/api-client';
import { DialogShellComponent } from '@naucto/ui';

import { RatingFormComponent, type RatingSent } from './rating-form.component';

export interface RatingDialogData {
  context: FeedbackContext;
}

/** The rating asked for by the person themselves, from the footer or the account menu. */
@Component({
  selector: 'nc-rating-dialog',
  imports: [TranslocoDirective, DialogShellComponent, RatingFormComponent],
  templateUrl: './rating.dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RatingDialog {
  protected readonly ref = inject<DialogRef<RatingSent>>(DialogRef);
  protected readonly data = inject<RatingDialogData>(DIALOG_DATA);
}
