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

import { coverHues, threeColours } from '../cover-palette';
import { blobLayout, CELL, type FieldBlob, paintField, rampOf, type Rgb } from '../dither-field';
import { prefersStill } from '../motion';
import { channels, pageGround } from '../page-ground';

/** The size a picture is read at: its colours, not its detail. */
const SAMPLE = { width: 32, height: 18 };
/** How long a colour or a blob takes to cover most of the way to where it is going. */
const EASE = 420;
/** The least time between two frames. */
const FRAME = 33;
/** How far the blobs rise at most as the page scrolls, in shares of the field's height. */
const DRIFT = 0.25;
/** How many pixels of page scrolled raise the blobs by one. */
const DRIFT_RATE = 12;

interface Moving extends FieldBlob {
  ramp: Rgb[];
  to: FieldBlob & { ramp: Rgb[] };
}

const palettes = new Map<string, Promise<Rgb[]>>();

/** The colours of a picture, or none when it cannot be loaded or its pixels cannot be read. */
function readCover(src: string): Promise<Rgb[]> {
  let reading = palettes.get(src);
  if (!reading) {
    reading = new Promise((resolve) => {
      const image = new Image();
      // Asked for with CORS, or a picture from another origin could be drawn but never read.
      image.crossOrigin = 'anonymous';
      image.onerror = (): void => {
        resolve([]);
      };
      image.onload = (): void => {
        try {
          const canvas = Object.assign(document.createElement('canvas'), SAMPLE);
          const context = canvas.getContext('2d');
          context?.drawImage(image, 0, 0, SAMPLE.width, SAMPLE.height);
          resolve(
            coverHues(
              context?.getImageData(0, 0, SAMPLE.width, SAMPLE.height).data ??
                new Uint8ClampedArray(),
            ),
          );
        } catch {
          resolve([]);
        }
      };
      image.src = src;
    });
    palettes.set(src, reading);
  }
  return reading;
}

/**
 * A ground of three soft blobs drawn in an ordered dither, in the colours of a picture: what lies
 * behind a page whose mood is one game's. The page's own colour is the ground, and the blobs leave
 * it only by a few steps, so text over them reads as it does on the bare page.
 *
 * It takes the box its caller gives it — `fixed inset-0` behind a page — and draws only when
 * something changes: a new picture, the colours easing toward it, a resize, the theme. At rest it
 * costs nothing. As the page scrolls the blobs rise a little, slid by the browser on the scroll's
 * own timeline rather than drawn again, so they never trail it; a browser without scroll
 * timelines holds them still. Where motion is reduced the colours land at once and nothing rises.
 *
 * A page that opens on a picture of its own lays an `nc-dither-banner` over it.
 */
@Component({
  selector: 'nc-dither-backdrop',
  template: '<canvas #canvas class="pixelated block"></canvas>',
  styles: `
    @keyframes rise {
      to {
        translate: 0 var(--nc-drift);
      }
    }
    @supports (animation-timeline: scroll()) {
      @media (prefers-reduced-motion: no-preference) {
        canvas {
          animation: rise linear both;
          animation-timeline: scroll(root);
          animation-range: 0 var(--nc-drift-over);
        }
      }
    }
    :host-context([data-reduce-motion]) canvas {
      animation: none;
    }
  `,
  host: { class: 'pointer-events-none block overflow-hidden', 'aria-hidden': 'true' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DitherBackdropComponent {
  /** The picture the colours are taken from. */
  readonly image = input<string | null>(null);
  /**
   * The colour that stands in for a picture that gives none, or cannot be read; any CSS colour.
   * With neither, the ground is left bare.
   */
  readonly tint = input<string | null>(null);
  /** What the blobs are placed from: one seed, one sky. */
  readonly seed = input('');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private blobs: Moving[] = [];
  private pixels: ImageData | null = null;
  private frame = 0;
  private wait: ReturnType<typeof setTimeout> | undefined;
  private drawn = 0;
  private eased = 0;

  /** Draws one frame and says whether anything is still on its way. */
  private draw(now: number): boolean {
    const canvas = this.canvas().nativeElement;
    const context = canvas.getContext('2d', { alpha: false });
    const width = Math.ceil(this.host.clientWidth / CELL);
    const height = Math.ceil(this.host.clientHeight / CELL);
    // The field runs on below its box by as far as it rises, so it never shows its end.
    const rows = height + Math.ceil(height * DRIFT);
    if (!context || !this.blobs.length || !width || !height) {
      return false;
    }
    if (this.pixels?.width !== width || this.pixels.height !== rows) {
      canvas.width = width;
      canvas.height = rows;
      // Whole cells past the box rather than cells stretched to fit it.
      canvas.style.width = `${String(width * CELL)}px`;
      canvas.style.height = `${String(rows * CELL)}px`;
      const rise = (rows - height) * CELL;
      canvas.style.setProperty('--nc-drift', `${String(-rise)}px`);
      canvas.style.setProperty('--nc-drift-over', `${String(rise * DRIFT_RATE)}px`);
      this.pixels = context.createImageData(width, rows);
      this.pixels.data.fill(255);
    }
    const elapsed = this.eased && now - this.eased < 200 ? now - this.eased : FRAME;
    this.eased = now;
    const share = prefersStill(this.host) ? 1 : 1 - Math.exp(-elapsed / EASE);
    const approach = (from: number, to: number): number => from + (to - from) * share;
    let moving = false;
    for (const blob of this.blobs) {
      blob.ramp = blob.ramp.map((colour, step): Rgb => {
        const to = blob.to.ramp[step] ?? colour;
        moving ||= colour.some((channel, i) => Math.abs((to[i] ?? channel) - channel) > 0.4);
        return [approach(colour[0], to[0]), approach(colour[1], to[1]), approach(colour[2], to[2])];
      });
      for (const key of ['cx', 'cy', 'rx', 'ry'] as const) {
        moving ||= Math.abs(blob.to[key] - blob[key]) > 0.002;
        blob[key] = approach(blob[key], blob.to[key]);
      }
    }
    paintField(
      this.pixels.data,
      width,
      height,
      this.blobs.map((blob) => ({
        ...blob,
        ramp: blob.ramp.map(([red, green, blue]): Rgb => [
          Math.round(red),
          Math.round(green),
          Math.round(blue),
        ]),
      })),
      rows,
    );
    context.putImageData(this.pixels, 0, 0);
    return moving;
  }

  /** Asks for a frame, unless one is already on its way; a frame that leaves things moving asks again. */
  private kick(): void {
    if (this.frame || this.wait) {
      return;
    }
    this.wait = setTimeout(
      () => {
        this.wait = undefined;
        this.frame = requestAnimationFrame((now) => {
          this.frame = 0;
          this.drawn = now;
          if (!document.hidden && this.draw(now)) {
            this.kick();
          }
        });
      },
      Math.max(0, this.drawn + FRAME - performance.now()),
    );
  }

  constructor() {
    const kick = (): void => {
      this.kick();
    };
    let aim = 0;
    const retarget = async (): Promise<void> => {
      const mine = ++aim;
      const { ground, dark } = pageGround(this.host);
      const image = this.image();
      const tint = this.tint();
      const found = image ? await readCover(image) : [];
      if (mine !== aim) {
        return;
      }
      const colours =
        found.length || tint
          ? threeColours(found, tint ? channels(tint) : ground)
          : [ground, ground, ground];
      const layout = blobLayout(this.seed());
      this.blobs = layout.map((place, i) => {
        const to = { ...place, ramp: rampOf(ground, colours[i] ?? ground, dark) };
        return { ...(this.blobs[i] ?? to), to };
      });
      this.kick();
    };

    effect(() => {
      this.image();
      this.tint();
      this.seed();
      void retarget();
    });

    const resized = new ResizeObserver(kick);
    resized.observe(this.host);
    // The ground is the page's colour, which is the theme's.
    const themed = new MutationObserver(() => void retarget());
    themed.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    document.addEventListener('visibilitychange', kick);
    inject(DestroyRef).onDestroy(() => {
      resized.disconnect();
      themed.disconnect();
      document.removeEventListener('visibilitychange', kick);
      cancelAnimationFrame(this.frame);
      clearTimeout(this.wait);
    });
  }
}
