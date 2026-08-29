import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** `boxed` is the framed module (status readouts, scopes); `flush` fills its column (the console). */
export type LcdVariant = 'boxed' | 'flush';

const VARIANT: Record<LcdVariant, string> = {
  boxed: 'rounded-sm border border-line-strong px-[15px] py-[13px]',
  flush: 'px-[14px] py-[12px]',
};

/**
 * Phosphor LCD surface: what the machine says back (console, netplay status, scopes).
 *
 * The design rules *every* LCD with a veil of its own ink — `rgb(16 210 117 / .05)` on the dark
 * module, `rgb(18 48 15 / .07)` on the daylight one — down to the 58×32 swatch on the foundations
 * board. That is a different thing from the black scanline laid over the game canvas, so it lives
 * here and is not optional. There is no glow: `text-shadow` appears zero times in the design file.
 */
@Component({
  selector: 'nc-lcd',
  template: '<ng-content />',
  host: {
    class: 'nc-lcd block overflow-auto bg-lcd font-mono text-body text-lcd-ink whitespace-pre-wrap',
    '[class]': 'frame()',
    '[style.min-height.px]': 'minHeight()',
  },
  styles: `
    :host {
      background-image: repeating-linear-gradient(
        0deg,
        var(--nc-lcd-veil) 0 1px,
        transparent 1px 3px
      );
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LcdComponent {
  readonly minHeight = input<number>();
  /** The console is full-bleed in its column; every other readout is a framed module. */
  readonly variant = input<LcdVariant>('boxed');
  protected readonly frame = computed(() => VARIANT[this.variant()]);
}
