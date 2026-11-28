import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  ButtonDirective,
  ChipComponent,
  DialogService,
  MarkComponent,
  ToastService,
} from '@naucto/ui';

import { DiffStore } from './diff.store';

/**
 * The right half of the bar while diff mode is on, in the place of Share and Publish: how far the
 * review has gone, a step to the previous and the next change in whatever editor holds it, and the
 * decision about everything left. Comparing two versions decides nothing, and says so instead.
 */
@Component({
  selector: 'nc-diff-review',
  imports: [TranslocoDirective, ButtonDirective, ChipComponent, MarkComponent],
  templateUrl: './diff-review.component.html',
  host: { class: 'flex items-center gap-1' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiffReviewComponent {
  protected readonly diff = inject(DiffStore);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  /** Every change decided: what is left is writing the kept ones. */
  protected readonly settled = computed(() => this.diff.total() > 0 && !this.diff.pending().length);

  /** Accepts what is left, then writes every kept change: the review's last step. */
  protected async acceptAll(): Promise<void> {
    this.diff.decideAll('ok');
    await this.apply();
  }

  protected async apply(): Promise<void> {
    const kept = [...this.diff.decisions().values()].filter((decision) => decision === 'ok').length;
    const confirmed = await this.dialogs.confirm({
      title: this.transloco.translate('editor.diff.applyTitle'),
      message: this.transloco.translate('editor.diff.applyMessage', { n: kept }),
      confirmLabel: this.transloco.translate('editor.diff.apply'),
    });
    if (!confirmed) {
      return;
    }
    try {
      if (await this.diff.apply()) {
        this.toasts.show(this.transloco.translate('editor.diff.applied', { n: kept }), 'success');
      }
    } catch {
      // The project holds the kept changes already; only the assistant's copy did not move on, and
      // it offers them again until the next review.
      this.toasts.show(this.transloco.translate('editor.diff.reviewNotSent'), 'error');
    }
  }
}
