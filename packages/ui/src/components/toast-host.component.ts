import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { IconComponent } from './icon.component';
import { ToastService, type ToastTone } from './toast.service';

const TONE: Record<ToastTone, string> = {
  info: 'border-sky text-ink',
  success: 'border-jade text-ink',
  warning: 'border-orange text-ink',
  error: 'border-hot text-ink',
};

/** Mount once in the app shell. Announces politely. */
@Component({
  selector: 'nc-toast-host',
  imports: [IconComponent],
  template: `
    <div class="fixed right-2 bottom-2 z-50 flex w-[320px] flex-col gap-1" aria-live="polite">
      @for (t of toasts.toasts(); track t.id) {
        <div
          class="flex items-start gap-1 rounded-md border-l-2 border border-line bg-raised px-2 py-1.5 text-body shadow-[0_2px_0_var(--nc-inset)]"
          [class]="tone(t.tone)"
        >
          <span class="flex-1">{{ t.text }}</span>
          <button
            type="button"
            class="text-ink-3 hover:text-ink"
            aria-label="Dismiss"
            (click)="toasts.dismiss(t.id)"
          >
            <nc-icon name="close" [size]="12" />
          </button>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastHostComponent {
  protected readonly toasts = inject(ToastService);
  protected tone(t: ToastTone): string {
    return TONE[t];
  }
}
