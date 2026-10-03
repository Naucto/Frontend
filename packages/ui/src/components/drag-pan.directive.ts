import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';

/**
 * Drag a scrolling element around with the middle mouse button.
 *
 * The middle button, because the left one is the tool in hand on the surfaces that want this.
 *
 * It moves the element's own scroll offsets rather than a transform, so it composes with the
 * scrollbars and the keyboard instead of competing with them. The offsets are written once a
 * frame, from wherever the pointer last was: a mouse reports several times a frame, and every
 * write but the last of them was a scroll the screen never showed.
 */
@Directive({
  selector: '[ncDragPan]',
  host: {
    '[class.nc-panning]': 'from !== null',
    '(pointerdown)': 'onDown($event)',
    '(pointermove)': 'onMove($event)',
    '(pointerup)': 'onUp($event)',
    '(pointercancel)': 'onUp($event)',
    '(lostpointercapture)': 'onUp($event)',
  },
})
export class DragPanDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected from: { x: number; y: number; left: number; top: number } | null = null;
  private at: { x: number; y: number } | null = null;
  private raf = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(this.raf);
    });
  }

  protected onDown(e: PointerEvent): void {
    if (e.button !== 1) return;
    // Also what stops the browser opening its autoscroll ring over the element.
    e.preventDefault();
    const el = this.host.nativeElement;
    this.from = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
    el.setPointerCapture(e.pointerId);
  }

  protected onMove(e: PointerEvent): void {
    if (!this.from) return;
    this.at = { x: e.clientX, y: e.clientY };
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.apply();
    });
  }

  protected onUp(e: PointerEvent): void {
    if (!this.from) return;
    // The last of the moves, if it had not landed yet, lands before the hand lets go.
    this.apply();
    this.from = null;
    this.at = null;
    const el = this.host.nativeElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  }

  private apply(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    const from = this.from;
    const at = this.at;
    if (!from || !at) return;
    const el = this.host.nativeElement;
    el.scrollLeft = from.left - (at.x - from.x);
    el.scrollTop = from.top - (at.y - from.y);
  }
}
