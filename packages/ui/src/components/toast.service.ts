import { Injectable, signal } from '@angular/core';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';
export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

/** Queue of transient messages rendered by <nc-toast-host>. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  readonly toasts = signal<Toast[]>([]);

  show(text: string, tone: ToastTone = 'info', ttlMs = 4000): void {
    const id = ++this.seq;
    this.toasts.update((t) => [...t, { id, text, tone }]);
    setTimeout(() => {
      this.dismiss(id);
    }, ttlMs);
  }

  dismiss(id: number): void {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }
}
