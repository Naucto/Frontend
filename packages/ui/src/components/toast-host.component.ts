import { OverlayContainer } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject } from '@angular/core';

import type { IconName } from '../icons/paths';
import { IconComponent } from './icon.component';
import { ToastService, type ToastTone } from './toast.service';

/**
 * How loud the toast is, said twice — by the edge colour and by a leading mark — because colour
 * alone is the first thing a colour-blind reader loses.
 */
const TONE: Record<ToastTone, { shell: string; mark: string; icon: IconName }> = {
  info: { shell: 'border-l-sky text-ink', mark: 'text-sky-ink', icon: 'info-box' },
  success: { shell: 'border-l-jade text-ink', mark: 'text-jade-ink', icon: 'check' },
  warning: { shell: 'border-l-orange text-ink', mark: 'text-orange-ink', icon: 'warning-box' },
  error: { shell: 'border-l-hot text-ink', mark: 'text-hot-ink', icon: 'alert' },
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
  templateUrl: './toast-host.component.html',
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
