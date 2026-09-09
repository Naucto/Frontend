import { OverlayContainer } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject } from '@angular/core';

import type { IconName } from '../icons/paths';
import { IconComponent } from './icon.component';
import { ToastService, type ToastTone } from './toast.service';

/**
 * How loud the toast is, said twice.
 *
 * The edge alone carried it, and an edge is two pixels of colour at the far left of a 320px box:
 * it is the last thing read and the first thing a colour-blind reader loses. The mark leads,
 * the way every notice in the kit leads with one.
 */
const TONE: Record<ToastTone, { shell: string; mark: string; icon: IconName }> = {
  info: { shell: 'border-sky text-ink', mark: 'text-sky-ink', icon: 'info-box' },
  success: { shell: 'border-jade text-ink', mark: 'text-jade-ink', icon: 'check' },
  warning: { shell: 'border-orange text-ink', mark: 'text-orange-ink', icon: 'warning-box' },
  error: { shell: 'border-hot text-ink', mark: 'text-hot-ink', icon: 'alert' },
};

/**
 * Mount once in the app shell. Announces politely.
 *
 * It relocates itself into the overlay container, which is the only part of the page that follows
 * an element into fullscreen — and something the product needs to say does not stop being true
 * because a game is filling the screen. That container takes no pointer events, so the row that
 * carries the dismiss button asks for them back.
 */
@Component({
  selector: 'nc-toast-host',
  imports: [IconComponent],
  template: `
    <div
      class="pointer-events-auto fixed right-2 bottom-2 z-50 flex w-[320px] flex-col gap-1"
      aria-live="polite"
    >
      @for (t of toasts.toasts(); track t.id) {
        <div
          class="nc-toast flex items-start gap-1 rounded-md border-l-2 border border-line bg-raised px-2 py-1.5 text-body shadow-[0_2px_0_var(--nc-inset)]"
          [class]="TONE[t.tone].shell"
          animate.enter="nc-toast-enter"
          animate.leave="nc-toast-leave"
        >
          <nc-icon
            [name]="TONE[t.tone].icon"
            [size]="12"
            class="mt-[1px] shrink-0"
            [class]="TONE[t.tone].mark"
          />
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
  protected readonly TONE = TONE;

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const container = inject(OverlayContainer);
    container.getContainerElement().appendChild(host);
    inject(DestroyRef).onDestroy(() => {
      host.remove();
    });
  }
}
