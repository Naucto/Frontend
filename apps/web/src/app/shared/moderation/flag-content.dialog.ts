import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ModerationReason, type ModerationTargetType } from '@naucto/api-client';
import {
  ButtonDirective,
  DialogShellComponent,
  FieldComponent,
  InputDirective,
  NoticeComponent,
  SelectComponent,
} from '@naucto/ui';

import { ApiError } from '../../core/api/api-errors';
import { CommentBubbleComponent } from '../comments/comment-bubble.component';
import { injectFlagContent } from '../queries/moderation.queries';

const FLAG_DETAILS_MAX = 1000;

const FLAG_REASONS = Object.values(ModerationReason);

/**
 * What is being reported. `label` is how the dialog names it back to the person; with an `author`
 * the label is a comment's text, shown as the comment it is, cut to a few lines.
 */
export interface FlagContentData {
  targetType: ModerationTargetType;
  targetId: string;
  label: string;
  author?: { id: string; name: string };
}

/** Refusals the dialog answers in its own words. Any other failure gets the general sentence. */
const REFUSALS: Record<string, string> = {
  ALREADY_FLAGGED: 'already',
  CANNOT_FLAG_OWN_CONTENT: 'own',
  FLAG_TARGET_NOT_FOUND: 'gone',
  ACCOUNT_SUSPENDED: 'suspended',
};

/**
 * Reports a game, a comment or a profile to the moderators: why, and anything they should know.
 * The code calls a report a flag, since "report" already names bug reports. Closes with true once
 * the report is sent.
 */
@Component({
  selector: 'nc-flag-content-dialog',
  imports: [
    CommentBubbleComponent,
    TranslocoDirective,
    ButtonDirective,
    DialogShellComponent,
    FieldComponent,
    InputDirective,
    NoticeComponent,
    SelectComponent,
  ],
  templateUrl: './flag-content.dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlagContentDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<FlagContentData>(DIALOG_DATA);
  private readonly transloco = inject(TranslocoService);
  private readonly submit = injectFlagContent();

  protected readonly detailsMax = FLAG_DETAILS_MAX;
  private readonly reasonLabels = toSignal(
    this.transloco.selectTranslateObject<Record<ModerationReason, string>>('moderation.reasons'),
  );
  protected readonly reasons = computed<{ value: ModerationReason; label: string }[]>(() =>
    FLAG_REASONS.map((value) => ({ value, label: this.reasonLabels()?.[value] ?? value })),
  );
  protected readonly reason = signal<ModerationReason | null>(null);
  protected readonly details = signal('');
  protected readonly pending = this.submit.isPending;
  protected readonly failed = signal<string | null>(null);

  protected async send(): Promise<void> {
    const reason = this.reason();
    if (reason === null || this.pending()) {
      return;
    }
    this.failed.set(null);
    const details = this.details().trim();
    try {
      await this.submit.mutateAsync({
        targetType: this.data.targetType,
        targetId: this.data.targetId,
        reason,
        ...(details ? { details } : {}),
      });
    } catch (error) {
      const refusal = error instanceof ApiError && error.code ? REFUSALS[error.code] : undefined;
      this.failed.set(this.transloco.translate(`moderation.report.errors.${refusal ?? 'failed'}`));
      return;
    }
    this.ref.close(true);
  }
}
