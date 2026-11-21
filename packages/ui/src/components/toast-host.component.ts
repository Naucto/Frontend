import { OverlayContainer } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject } from '@angular/core';

import { NoticeComponent, type NoticeTone } from './notice.component';
import { ToastService, type ToastTone } from './toast.service';

const TONE: Record<ToastTone, NoticeTone> = {
  info: 'info',
  success: 'success',
  warning: 'warn',
  error: 'danger',
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
  imports: [NoticeComponent],
  templateUrl: './toast-host.component.html',
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
