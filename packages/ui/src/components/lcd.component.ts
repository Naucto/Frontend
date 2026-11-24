import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** `boxed` is the framed module (status readouts, scopes); `flush` fills its column (the console). */
export type LcdVariant = 'boxed' | 'flush';

const VARIANT: Record<LcdVariant, { frame: string; pad: string }> = {
  boxed: { frame: 'flat-sm bevel-edge-line-strong bevel-fill-lcd', pad: 'px-2 py-1.5' },
  flush: { frame: 'bg-lcd', pad: 'px-[14px] py-[12px]' },
};

/**
 * Phosphor LCD surface: what the machine says back.
 *
 * The design rules *every* LCD with a veil of its own ink, down to the smallest swatch on the
 * foundations board. That is a different thing from the black scanline laid over the game canvas —
 * a different colour and a different owner — so it lives here rather than in that utility, and both
 * answer to the same preference for anyone who would rather have neither. There is no glow:
 * `text-shadow` appears zero times in the design file.
 *
 * The veil is the ground of the inner box, which is also the one that scrolls: a bevel owns the
 * host's background, and a ground stays put under the lines that scroll over it.
 */
@Component({
  selector: 'nc-lcd',
  template: `
    <div class="veil min-h-0 flex-1 overflow-auto" [class]="look().pad">
      <ng-content />
    </div>
  `,
  host: {
    class: 'flex flex-col font-mono text-small text-lcd-ink whitespace-pre-wrap',
    '[class]': 'look().frame',
    '[style.min-height.px]': 'minHeight()',
  },
  styles: `
    .veil {
      background-image: repeating-linear-gradient(
        0deg,
        var(--nc-lcd-veil) 0 1px,
        transparent 1px 3px
      );
    }
    :host-context([data-no-veil]) .veil {
      background-image: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LcdComponent {
  readonly minHeight = input<number>();
  readonly variant = input<LcdVariant>('boxed');
  protected readonly look = computed(() => VARIANT[this.variant()]);
}
