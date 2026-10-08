import { type ErrorHandler, inject, Injectable } from '@angular/core';
import { ToastService } from '@naucto/ui';

import { ApiError } from '../api/api-errors';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly toasts = inject(ToastService);

  handleError(error: unknown): void {
    if (error instanceof ApiError) {
      if (error.status !== 401) {
        this.toasts.show(error.message, 'error');
      }
      return;
    }
    console.error(error);
    this.toasts.show(error instanceof Error ? error.message : 'Something went wrong', 'error');
  }
}
