import { Injectable, isDevMode, signal } from '@angular/core';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';
export interface ToastAction {
  label: string;
  run: () => void;
}
export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
  /** The line above the text, in the tone's ink. */
  title?: string;
  action?: ToastAction;
}
/** What a toast may carry beside its text. */
type ToastExtras = Pick<Toast, 'title' | 'action'>;

/** Queue of transient messages rendered by <nc-toast-host>. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  readonly toasts = signal<Toast[]>([]);

  show(text: string, tone: ToastTone = 'info', ttlMs = 4000, extras: ToastExtras = {}): number {
    const id = ++this.seq;
    this.toasts.update((toasts) => [...toasts, { id, text, tone, ...extras }]);
    setTimeout(() => {
      this.dismiss(id);
    }, ttlMs);
    return id;
  }

  act(id: number): void {
    const toast = this.toasts().find((each) => each.id === id);
    this.dismiss(id);
    toast?.action?.run();
  }

  /** A message for whoever is developing the app: a production build drops it. */
  debug(text: string, tone: ToastTone = 'error', ttlMs = 8000): void {
    if (isDevMode()) {
      this.show(text, tone, ttlMs);
    }
  }

  dismiss(id: number): void {
    this.toasts.update((toasts) => toasts.filter((x) => x.id !== id));
  }
}
