import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** `boxed` is the framed module (status readouts, scopes); `flush` fills its column (the console). */
export type LcdVariant = 'boxed' | 'flush';

const VARIANT: Record<LcdVariant, string> = {
  boxed: 'rounded-sm border border-line-strong px-[15px] py-[13px]',
  flush: 'px-[14px] py-[12px]',
};

/**
 * Phosphor LCD surface: what the machine says back.
 *
 * The design rules *every* LCD with a veil of its own ink, down to the smallest swatch on the
 * foundations board. That is a different thing from the black scanline laid over the game canvas —
 * a different colour and a different owner — so it lives here rather than in that utility, and both
 * answer to the same preference for anyone who would rather have neither. There is no glow:
 * `text-shadow` appears zero times in the design file.
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
    :host-context([data-no-veil]) {
      background-image: none;
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
