import { type ErrorHandler, inject, Injectable } from '@angular/core';
import { ToastService } from '@naucto/ui';

import { ApiError } from '../api/api-errors';
import { CrashReporter } from '../reports/crash-reporter.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly toasts = inject(ToastService);
  private readonly crashes = inject(CrashReporter);

  handleError(error: unknown): void {
    if (error instanceof ApiError) {
      if (error.status !== 401) {
        this.toasts.show(error.message, 'error');
      }
      return;
    }
    console.error(error);
    this.crashes.report('web', error);
    // Reported already, so a player has nothing to do about it: only a developer is told.
    this.toasts.debug(error instanceof Error ? error.message : 'Something went wrong');
  }
}
