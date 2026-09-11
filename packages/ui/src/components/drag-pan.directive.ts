import { Directive, ElementRef, inject } from '@angular/core';

/**
 * Drag a scrolling element around with the middle mouse button.
 *
 * The middle button, because the left one is the tool in hand on the surfaces that want this.
 *
 * It moves the element's own scroll offsets rather than a transform, so it composes with the
 * scrollbars and the keyboard instead of competing with them.
 */
@Directive({
  selector: '[ncDragPan]',
  host: {
    '[class.cursor-grabbing]': 'from !== null',
    '(pointerdown)': 'onDown($event)',
    '(pointermove)': 'onMove($event)',
    '(pointerup)': 'onUp($event)',
    '(pointercancel)': 'onUp($event)',
  },
})
export class DragPanDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected from: { x: number; y: number; left: number; top: number } | null = null;

  protected onDown(e: PointerEvent): void {
    if (e.button !== 1) return;
    // Also what stops the browser opening its autoscroll ring over the element.
    e.preventDefault();
    const el = this.host.nativeElement;
    this.from = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
    el.setPointerCapture(e.pointerId);
  }

  protected onMove(e: PointerEvent): void {
    const from = this.from;
    if (!from) return;
    const el = this.host.nativeElement;
    el.scrollLeft = from.left - (e.clientX - from.x);
    el.scrollTop = from.top - (e.clientY - from.y);
  }

  protected onUp(e: PointerEvent): void {
    if (!this.from) return;
    this.from = null;
    const el = this.host.nativeElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  }
}
