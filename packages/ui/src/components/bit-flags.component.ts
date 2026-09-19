import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/**
 * One accent per flag bit, in bit order.
 *
 * A flag has no meaning of its own — a game decides what bit 3 stands for — so the only thing the
 * interface can offer is that the same bit looks the same everywhere. The map paints tiles with
 * these, and the chips below set them, which is why the list is here rather than beside either.
 */
export const FLAG_ACCENTS = [
  'jade',
  'sky',
  'orange',
  'blush',
  'hot',
  'gold',
  'lime',
  'magenta',
] as const;

export type FlagAccent = (typeof FLAG_ACCENTS)[number];

/** Written out one by one: Tailwind reads the text of the sources, not what they compute to. */
const SET: Record<FlagAccent, string> = {
  jade: 'aria-checked:border-jade aria-checked:bg-jade',
  sky: 'aria-checked:border-sky aria-checked:bg-sky',
  orange: 'aria-checked:border-orange aria-checked:bg-orange',
  blush: 'aria-checked:border-blush aria-checked:bg-blush',
  hot: 'aria-checked:border-hot aria-checked:bg-hot',
  gold: 'aria-checked:border-gold aria-checked:bg-gold',
  lime: 'aria-checked:border-lime aria-checked:bg-lime',
  magenta: 'aria-checked:border-magenta aria-checked:bg-magenta',
};

/** Eight toggleable bits (sprite flags 0–7). Value is the byte. Cells are 30×26 per the design. */
@Component({
  selector: 'nc-bit-flags',
  template: `
    <div role="group" [attr.aria-label]="label()" class="flex gap-0.5">
      @for (bit of bits; track bit) {
        <button
          type="button"
          role="checkbox"
          [attr.aria-checked]="isSet(bit)"
          [attr.aria-label]="'Flag ' + bit"
          (click)="toggle(bit)"
          class="h-[26px] w-[30px] flex-none rounded-xs border border-line bg-raised font-mono text-label text-ink-3 hover:border-line-strong aria-checked:text-on-accent"
          [class]="set(bit)"
        >
          {{ bit }}
        </button>
      }
    </div>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BitFlagsComponent {
  readonly value = model(0);
  readonly label = input('Flags');
  protected readonly bits = [0, 1, 2, 3, 4, 5, 6, 7];
  protected set(bit: number): string {
    return SET[FLAG_ACCENTS[bit] ?? 'jade'];
  }
  protected isSet(bit: number): boolean {
    return (this.value() & (1 << bit)) !== 0;
  }
  protected toggle(bit: number): void {
    this.value.set(this.value() ^ (1 << bit));
  }
}
