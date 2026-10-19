import { type ErrorHandler, inject, Injectable, Injector } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { ToastService } from '@naucto/ui';

import { FeedbackLauncher } from '../../shared/feedback/feedback-launcher.service';
import { ApiError } from '../api/api-errors';
import { FeaturesService } from '../config/features.service';
import { CrashReporter, describeError } from '../crash/crash-reporter.service';

/** How long a crash toast stays, long enough to reach its Report button. */
const CRASH_TOAST_MS = 8000;

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly toasts = inject(ToastService);
  private readonly crashes = inject(CrashReporter);
  private readonly features = inject(FeaturesService);
  // Resolved on first use: the handler is built before most of the app it would open.
  private readonly injector = inject(Injector);

  handleError(error: unknown): void {
    if (error instanceof ApiError) {
      if (error.status !== 401) {
        this.toasts.show(error.message, 'error');
      }
      return;
    }
    console.error(error);
    this.crashes.report('web', error);
    const text = error instanceof Error ? error.message : 'Something went wrong';
    if (!this.features.feedback()) {
      this.toasts.show(text, 'error');
      return;
    }
    const { name, message, stack } = describeError(error);
    this.toasts.show(text, 'error', CRASH_TOAST_MS, {
      label: this.injector.get(TranslocoService).translate('feedback.bug.reportShort'),
      run: () => {
        this.injector.get(FeedbackLauncher).reportBug({
          appError: `${name}: ${message}\n${stack}`.trim(),
        });
      },
    });
  }
}
