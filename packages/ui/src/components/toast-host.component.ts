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
          class="nc-toast flex items-start gap-1 rounded-md border-l-2 border border-line bg-raised px-2 py-1.5 text-body shadow-[0_2px_0_var(--nc-inset)]"
          [class]="tone(t.tone)"
          animate.enter="nc-toast-enter"
          animate.leave="nc-toast-leave"
        >
          <span class="flex-1">{{ t.text }}</span>
          <button
            type="button"
            class="cursor-pointer text-ink-3 transition-colors duration-100 hover:text-ink"
            aria-label="Dismiss"
            (click)="toasts.dismiss(t.id)"
          >
            <nc-icon name="close" [size]="12" />
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    @keyframes nc-toast-in {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    @keyframes nc-toast-out {
      from {
        opacity: 1;
        transform: translateY(0);
      }
      to {
        opacity: 0;
        transform: translateY(8px);
      }
    }
    .nc-toast-enter {
      animation: nc-toast-in 150ms ease-out;
    }
    .nc-toast-leave {
      animation: nc-toast-out 150ms ease-in forwards;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastHostComponent {
  protected readonly toasts = inject(ToastService);
  protected tone(t: ToastTone): string {
    return TONE[t];
  }
}
