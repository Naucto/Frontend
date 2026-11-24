import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  viewChild,
} from '@angular/core';

import { BANNER_REACH, type BannerSample, CELL, coverRect, paintBanner } from '../dither-field';
import { pageGround } from '../page-ground';

/** A picture, loaded to be read; none when it cannot be loaded. */
function loadPicture(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    // Asked for with CORS, or a picture from another origin could be drawn but never read.
    image.crossOrigin = 'anonymous';
    image.onload = (): void => {
      resolve(image);
    };
    image.onerror = (): void => {
      resolve(null);
    };
    image.src = src;
  });
}

/** A picture read one sample a cell, `width` cells by the reach; none when it cannot be read. */
function sampleBanner(image: HTMLImageElement, width: number): BannerSample | null {
  const canvas = Object.assign(document.createElement('canvas'), { width, height: BANNER_REACH });
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return null;
  }
  const drawn = coverRect(image, width, BANNER_REACH);
  context.drawImage(image, drawn.x, drawn.y, drawn.width, drawn.height);
  try {
    return {
      data: context.getImageData(0, 0, width, BANNER_REACH).data,
      width,
      rows: BANNER_REACH,
    };
  } catch {
    return null;
  }
}

/**
 * A picture laid across the top of a page in the kit's pixels: whole at first, then let go in a
 * dither over about a screen, its dropped cells left clear so the ground behind the page shows
 * through and the page ends on the same ground as the hub.
 *
 * It stands in the page, where its caller places it (`absolute inset-x-0 top-0` at the top of the
 * page's content), so it scrolls with the page natively and never has to follow it. It paints once
 * the picture is loaded, and again only when its width or the theme changes. With no picture, or
 * one that cannot be read, it takes no room.
 */
@Component({
  selector: 'nc-dither-banner',
  template: '<canvas #canvas class="pixelated block"></canvas>',
  host: { class: 'pointer-events-none block overflow-hidden', 'aria-hidden': 'true' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DitherBannerComponent {
  /** The picture laid across the top. */
  readonly src = input<string | null>(null);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private picture: HTMLImageElement | null = null;
  private paintedWidth = 0;

  private paint(): void {
    const canvas = this.canvas().nativeElement;
    const width = Math.ceil(this.host.clientWidth / CELL);
    const context = canvas.getContext('2d');
    const sample = this.picture && width ? sampleBanner(this.picture, width) : null;
    this.paintedWidth = width;
    if (!context || !sample) {
      canvas.width = 0;
      canvas.height = 0;
      canvas.style.width = '0';
      canvas.style.height = '0';
      return;
    }
    canvas.width = width;
    canvas.height = BANNER_REACH;
    // Whole cells past the box rather than cells stretched to fit it.
    canvas.style.width = `${String(width * CELL)}px`;
    canvas.style.height = `${String(BANNER_REACH * CELL)}px`;
    const pixels = context.createImageData(width, BANNER_REACH);
    const { ground, dark } = pageGround(this.host);
    paintBanner(pixels.data, width, sample, ground, dark);
    context.putImageData(pixels, 0, 0);
  }

  constructor() {
    let asked = 0;
    effect(() => {
      const src = this.src();
      const mine = ++asked;
      void (src ? loadPicture(src) : Promise.resolve(null)).then((picture) => {
        if (mine !== asked) {
          return;
        }
        this.picture = picture;
        this.paint();
      });
    });

    const resized = new ResizeObserver(() => {
      if (Math.ceil(this.host.clientWidth / CELL) !== this.paintedWidth) {
        this.paint();
      }
    });
    resized.observe(this.host);
    // Its colours are pulled toward the page's, which is the theme's.
    const themed = new MutationObserver(() => {
      this.paint();
    });
    themed.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    inject(DestroyRef).onDestroy(() => {
      resized.disconnect();
      themed.disconnect();
    });
  }
}
