import { type ErrorHandler, inject, Injectable } from '@angular/core';
import { ToastService } from '@naucto/ui';

import { ApiError } from '../api/api-errors';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly toasts = inject(ToastService);

  handleError(error: unknown): void {
    const e =
      error instanceof Error && 'rejection' in error
        ? (error as { rejection: unknown }).rejection
        : error;
    if (e instanceof ApiError) {
      if (e.status !== 401) this.toasts.show(e.message, 'error');
      return;
    }
    console.error(error);
    this.toasts.show(e instanceof Error ? e.message : 'Something went wrong', 'error');
  }
}
