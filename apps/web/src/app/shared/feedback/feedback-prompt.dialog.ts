import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, DialogShellComponent } from '@naucto/ui';

import type { ArmedPrompt } from './feedback.store';
import { RatingFormComponent, type RatingSent } from './rating-form.component';

/** How the prompt was left: answered, put off, or refused for good. */
export type PromptOutcome =
  { kind: 'sent'; sent: RatingSent } | { kind: 'snooze' } | { kind: 'decline' };

/**
 * The rating prompt as a modal the person answers through its own buttons: a rating, "not now",
 * or "don't ask again". Neither Escape nor the backdrop closes it, so it is never lost unread.
 */
@Component({
  selector: 'nc-feedback-prompt-dialog',
  imports: [TranslocoDirective, ButtonDirective, DialogShellComponent, RatingFormComponent],
  templateUrl: './feedback-prompt.dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackPromptDialog {
  protected readonly ref = inject<DialogRef<PromptOutcome>>(DialogRef);
  protected readonly prompt = inject<ArmedPrompt>(DIALOG_DATA);
}
