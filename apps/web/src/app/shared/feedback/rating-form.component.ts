import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type RatingOrigin, RatingReason, ReportRole } from '@naucto/api-client';
import {
  ButtonDirective,
  FieldComponent,
  InputDirective,
  LOW_RATING_MAX,
  NoticeComponent,
  RatingComponent,
  SegmentedComponent,
  type SegmentOption,
  ToggleButtonComponent,
} from '@naucto/ui';

import { injectSubmitRating } from '../queries/reports.queries';

export const COMMENT_MAX = 1000;
/** From this score the comment asking what was liked comes first. */
const PRAISE_FROM = 8;

export const RATING_REASONS = Object.values(RatingReason);

/** What was sent. */
export interface RatingSent {
  id: number;
}

/**
 * The platform rating: whether the person mostly plays or creates, a score out of ten, then two
 * optional comments, and for a low score the reasons. Sending with only the score is as welcome as
 * sending everything.
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
    SegmentedComponent,
    ToggleButtonComponent,
  ],
  templateUrl: './rating-form.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RatingFormComponent {
  /** The answer offered to "mostly play or create", from what the person was just doing. */
  readonly role = input.required<ReportRole>();
  readonly origin = input.required<RatingOrigin>();
  readonly releaseId = input<number | null>(null);
  readonly sent = output<RatingSent>();

  private readonly submit = injectSubmitRating();
  private readonly roleLabels = toSignal(
    inject(TranslocoService).selectTranslateObject<Record<ReportRole, string>>('feedback.roles'),
  );

  protected readonly commentMax = COMMENT_MAX;
  protected readonly reasons = RATING_REASONS;
  protected readonly roles = computed<SegmentOption<ReportRole>[]>(() =>
    Object.values(ReportRole).map((value) => ({
      value,
      label: this.roleLabels()?.[value] ?? value,
    })),
  );
  protected readonly chosenRole = linkedSignal(() => this.role());
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
      void this.send();
    }
  }

  protected async send(): Promise<void> {
    const score = this.score();
    if (score === null || this.pending()) {
      return;
    }
    this.failed.set(false);
    const releaseId = this.releaseId();
    const liked = this.liked().trim();
    const improve = this.improve().trim();
    try {
      const { id } = await this.submit.mutateAsync({
        score,
        role: this.chosenRole(),
        origin: this.origin(),
        ...(this.low() && this.chosenReasons().size > 0
          ? { reasons: [...this.chosenReasons()] }
          : {}),
        ...(liked ? { liked } : {}),
        ...(improve ? { improve } : {}),
        ...(releaseId === null ? {} : { releaseId }),
      });
      this.sent.emit({ id });
    } catch {
      this.failed.set(true);
    }
  }
}
