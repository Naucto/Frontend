import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  viewChild,
} from '@angular/core';

import { cssVar } from '../../../shared/pixel/pixel-tools';

/**
 * What is actually coming out of the synth, as a peak trace on an LCD surface.
 *
 * It reads a buffer the worklet fills rather than tapping an AnalyserNode: the audio already
 * lives on the worklet thread, and a second graph node just to look at it would be a copy of
 * something we can hand over for free.
 */
@Component({
  selector: 'nc-oscilloscope',
  templateUrl: './oscilloscope.component.html',
  host: { class: 'block overflow-hidden rounded-xs bg-lcd' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OscilloscopeComponent {
  /** Pulled every frame rather than pushed: the trace is only worth drawing at screen rate. */
  readonly peaks = input.required<() => Float32Array>();
  readonly label = input.required<string>();
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  constructor() {
    let raf = 0;
    const draw = (): void => {
      raf = requestAnimationFrame(draw);
      const el = this.canvas().nativeElement;
      const ctx = el.getContext('2d');
      if (!ctx) {
        return;
      }
      const data = this.peaks()();
      const width = el.width;
      const height = el.height;
      const mid = height / 2;

      ctx.fillStyle = cssVar(el, '--nc-lcd');
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = cssVar(el, '--nc-lcd-dim');
      ctx.beginPath();
      ctx.moveTo(0, mid + 0.5);
      ctx.lineTo(width, mid + 0.5);
      ctx.stroke();

      if (!data.length) {
        return;
      }
      ctx.strokeStyle = cssVar(el, '--nc-lcd-ink');
      ctx.beginPath();
      for (let x = 0; x < width; x++) {
        const peak = data[Math.floor((x / width) * data.length)] ?? 0;
        const y = mid - peak * (mid - 2);
        if (x === 0) {
          ctx.moveTo(x + 0.5, y);
        } else {
          ctx.lineTo(x + 0.5, y);
        }
      }
      ctx.stroke();
    };
    raf = requestAnimationFrame(draw);
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(raf);
    });
  }
}
