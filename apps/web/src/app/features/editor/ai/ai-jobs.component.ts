import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { unwrap } from '@app/core/api/api-errors';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  aiControllerCancelJob,
  aiControllerListJobs,
  type AiJobResponseDto,
} from '@naucto/api-client';
import { ButtonDirective, NoticeComponent } from '@naucto/ui';

/**
 * Specialist generation jobs the assistant started for this project. A result is a draft: it
 * reaches the game only through a proposal someone reviews.
 */
@Component({
  selector: 'nc-ai-jobs',
  imports: [TranslocoDirective, ButtonDirective, NoticeComponent],
  template: `
    <div *transloco="let t">
      <p class="text-meta text-ink-2">{{ t('ai.jobsHelp') }}</p>
      @if (error()) {
        <nc-notice tone="danger" role="alert">{{ error() }}</nc-notice>
      }
      <ul class="mt-1">
        @for (job of jobs(); track job.id) {
          <li
            class="flex items-center gap-1 border-t border-line py-0.5 text-meta"
            [attr.data-job]="job.id"
          >
            <span class="flex-1">
              {{ t('ai.jobKind.' + job.kind) }} · {{ prompt(job) }}
              @if (job.model) {
                · {{ job.model }}
              }
            </span>
            <span class="label">{{ t('ai.jobState.' + job.state) }}</span>
            @if ((job.state === 'QUEUED' || job.state === 'RUNNING') && !job.cancelRequested) {
              <button ncButton variant="ghost" size="sm" [disabled]="busy()" (click)="cancel(job)">
                {{ t('ai.cancelJob') }}
              </button>
            }
            @if (job.state === 'RUNNING' && job.cancelRequested) {
              <span class="text-ink-3">{{ t('ai.cancelRunning') }}</span>
            }
          </li>
        } @empty {
          <li class="text-meta text-ink-3">{{ t('ai.jobsEmpty') }}</li>
        }
      </ul>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiJobsComponent {
  readonly projectId = input.required<number>();
  protected readonly jobs = signal<AiJobResponseDto[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  constructor() {
    const interval = setInterval(() => void this.refresh(), 5000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(interval);
    });
    queueMicrotask(() => void this.refresh());
  }

  protected prompt(job: AiJobResponseDto): string {
    const request = job.request as { prompt?: unknown };

    return typeof request.prompt === 'string' ? request.prompt.slice(0, 80) : '';
  }

  private async refresh(): Promise<void> {
    try {
      this.jobs.set(unwrap(await aiControllerListJobs({ path: { projectId: this.projectId() } })));
      this.error.set('');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    }
  }

  protected async cancel(job: AiJobResponseDto): Promise<void> {
    this.busy.set(true);
    try {
      unwrap(await aiControllerCancelJob({ path: { projectId: this.projectId(), jobId: job.id } }));
      await this.refresh();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.busy.set(false);
    }
  }
}
