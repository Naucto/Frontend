import { afterNextRender, DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';

/** How far a line of that width is narrowed to fit that box: no further than `tightest`. */
export function fitScale(box: number, text: number, tightest: number): number {
  return text > box ? Math.max(tightest, box / text) : 1;
}

/**
 * Keeps one line whole in its box by narrowing it, and only cuts it once it would be narrowed past
 * `tightest`. On the box, around a single element that holds the line: that element is squeezed
 * from its start edge, and given the width that makes its own ellipsis fall at the box's edge.
 */
@Directive({ selector: '[ncFitText]' })
export class FitTextDirective {
  readonly tightest = input(0.62);

  constructor() {
    const box = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const fit = (): void => {
      const line = box.firstElementChild;
      if (!(line instanceof HTMLElement)) {
        return;
      }
      line.style.transform = 'none';
      line.style.width = 'auto';
      const room = box.clientWidth;
      const length = line.scrollWidth;
      if (!room || !length) {
        return;
      }
      const scale = fitScale(room, length, this.tightest());
      line.style.transform = scale < 1 ? `scaleX(${scale.toFixed(3)})` : 'none';
      if (length * scale > room + 1) {
        line.style.width = `${String(room / scale)}px`;
      }
    };
    const resized = new ResizeObserver(fit);
    const rewritten = new MutationObserver(fit);
    afterNextRender(() => {
      resized.observe(box);
      rewritten.observe(box, { characterData: true, childList: true, subtree: true });
      fit();
      // The line is measured in a face that may still be on its way.
      void document.fonts.ready.then(fit);
    });
    inject(DestroyRef).onDestroy(() => {
      resized.disconnect();
      rewritten.disconnect();
    });
  }
}
