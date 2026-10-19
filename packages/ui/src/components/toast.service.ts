import { Injectable, signal } from '@angular/core';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';
/** One button the toast offers, which dismisses it once run. */
export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
  action?: ToastAction;
}

/** Queue of transient messages rendered by <nc-toast-host>. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  readonly toasts = signal<Toast[]>([]);

  show(text: string, tone: ToastTone = 'info', ttlMs = 4000, action?: ToastAction): void {
    const id = ++this.seq;
    this.toasts.update((toasts) => [...toasts, { id, text, tone, ...(action ? { action } : {}) }]);
    setTimeout(() => {
      this.dismiss(id);
    }, ttlMs);
  }

  run(toast: Toast): void {
    this.dismiss(toast.id);
    toast.action?.run();
  }

  dismiss(id: number): void {
    this.toasts.update((toasts) => toasts.filter((x) => x.id !== id));
  }
}
