import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { ThemeService } from '@app/core/theme/theme.service';
import { cssVar } from '@app/shared/pixel/pixel-tools';

/**
 * What is actually coming out of the synth, as a peak trace on an LCD surface.
 *
 * It reads a buffer the worklet fills rather than tapping an AnalyserNode: the audio already
 * lives on the worklet thread, and a second graph node just to look at it would be a copy of
 * something we can hand over for free.
 */
@Component({
  selector: 'nc-oscilloscope',
  template: `
    <canvas
      #canvas
      class="pixelated block h-full w-full"
      [width]="200"
      [height]="48"
      role="img"
      [attr.aria-label]="label()"
    ></canvas>
  `,
  host: { class: 'block overflow-hidden rounded-xs bg-lcd' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OscilloscopeComponent {
  /** Pulled every frame rather than pushed: the trace is only worth drawing at screen rate. */
  readonly peaks = input.required<() => Float32Array>();
  readonly label = input('Output');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly theme = inject(ThemeService);

  constructor() {
    let raf = 0;
    const draw = (): void => {
      raf = requestAnimationFrame(draw);
      const el = this.canvas().nativeElement;
      const ctx = el.getContext('2d');
      if (!ctx) return;
      // Read the theme signal every frame: the tokens are resolved at paint time, so a theme
      // flip has to be picked up without anything else invalidating.
      this.theme.effective();
      const data = this.peaks()();
      const w = el.width;
      const h = el.height;
      const mid = h / 2;

      ctx.fillStyle = cssVar(el, '--nc-lcd');
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = cssVar(el, '--nc-lcd-dim');
      ctx.beginPath();
      ctx.moveTo(0, mid + 0.5);
      ctx.lineTo(w, mid + 0.5);
      ctx.stroke();

      if (!data.length) return;
      ctx.strokeStyle = cssVar(el, '--nc-lcd-ink');
      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const v = data[Math.floor((x / w) * data.length)] ?? 0;
        const y = mid - v * (mid - 2);
        if (x === 0) ctx.moveTo(x + 0.5, y);
        else ctx.lineTo(x + 0.5, y);
      }
      ctx.stroke();
    };
    raf = requestAnimationFrame(draw);
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(raf);
    });
  }
}
