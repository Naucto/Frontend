import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { type FeedbackContext, type FeedbackSource, RatingReason } from '@naucto/api-client';
import {
  ButtonDirective,
  FieldComponent,
  InputDirective,
  LOW_RATING_MAX,
  NoticeComponent,
  RatingComponent,
  ToggleButtonComponent,
} from '@naucto/ui';

import { AppConfigService } from '../../core/config/app-config';
import { injectSubmitRating } from '../queries/feedback.queries';

export const COMMENT_MAX = 1000;
/** From this score the comment asking what was liked comes first. */
const PRAISE_FROM = 8;

export const RATING_REASONS = Object.values(RatingReason);

/** What was sent, and whether the person went on to report a bug from it. */
export interface RatingSent {
  id: number;
  reportBug: boolean;
  improve: string;
}

/**
 * The platform rating: a score out of ten, then two optional comments, and for a low score the
 * reasons. Sending with only the score is as welcome as sending everything.
 */
@Component({
  selector: 'nc-rating-form',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    FieldComponent,
    InputDirective,
    NoticeComponent,
    RatingComponent,
    ToggleButtonComponent,
  ],
  templateUrl: './rating-form.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RatingFormComponent {
  readonly context = input.required<FeedbackContext>();
  readonly source = input.required<FeedbackSource>();
  readonly releaseId = input<number | null>(null);
  readonly sent = output<RatingSent>();

  private readonly config = inject(AppConfigService);
  private readonly submit = injectSubmitRating();

  protected readonly commentMax = COMMENT_MAX;
  protected readonly reasons = RATING_REASONS;
  protected readonly score = signal<number | null>(null);
  protected readonly chosenReasons = signal<ReadonlySet<RatingReason>>(new Set());
  protected readonly liked = signal('');
  protected readonly improve = signal('');
  protected readonly failed = signal(false);
  protected readonly pending = this.submit.isPending;

  protected readonly low = computed(() => {
    const score = this.score();
    return score !== null && score <= LOW_RATING_MAX;
  });
  protected readonly praiseFirst = computed(() => (this.score() ?? 0) >= PRAISE_FROM);

  protected toggleReason(reason: RatingReason, on: boolean): void {
    this.chosenReasons.update((current) => {
      const next = new Set(current);
      if (on) {
        next.add(reason);
      } else {
        next.delete(reason);
      }
      return next;
    });
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void this.send(false);
    }
  }

  protected async send(reportBug: boolean): Promise<void> {
    const score = this.score();
    if (score === null || this.pending()) {
      return;
    }
    this.failed.set(false);
    const release = this.config.config().release;
    const releaseId = this.releaseId();
    const liked = this.liked().trim();
    const improve = this.improve().trim();
    try {
      const { id } = await this.submit.mutateAsync({
        score,
        context: this.context(),
        source: this.source(),
        ...(this.low() && this.chosenReasons().size > 0
          ? { reasons: [...this.chosenReasons()] }
          : {}),
        ...(liked ? { liked } : {}),
        ...(improve ? { improve } : {}),
        ...(releaseId === null ? {} : { releaseId }),
        ...(release ? { appRelease: release } : {}),
      });
      this.sent.emit({ id, reportBug, improve });
    } catch {
      this.failed.set(true);
    }
  }
}
