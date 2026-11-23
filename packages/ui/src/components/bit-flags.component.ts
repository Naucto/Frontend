import { booleanAttribute, ChangeDetectionStrategy, Component, input, model } from '@angular/core';

import { closedBy } from './disabled-scope.directive';
import { CELL, CELL_ON, joined } from './selection-styles';

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
  jade: CELL_ON.jade,
  sky: CELL_ON.sky,
  orange: CELL_ON.orange,
  blush:
    'enabled:data-on:bevel-edge-blush enabled:data-on:bevel-fill-blush enabled:data-on:text-on-accent',
  hot: CELL_ON.hot,
  gold: 'enabled:data-on:bevel-edge-gold enabled:data-on:bevel-fill-gold enabled:data-on:text-on-accent',
  lime: 'enabled:data-on:bevel-edge-lime enabled:data-on:bevel-fill-lime enabled:data-on:text-on-accent',
  magenta:
    'enabled:data-on:bevel-edge-magenta enabled:data-on:bevel-fill-magenta enabled:data-on:text-on-accent-dark',
};

const BIT = `${CELL} h-[34px] w-[28px] flex-none font-mono text-label text-ink-4`;

/** Eight toggleable bits (sprite flags 0–7), as one row of joined cells. Value is the byte. */
@Component({
  selector: 'nc-bit-flags',
  templateUrl: './bit-flags.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BitFlagsComponent {
  readonly value = model(0);
  readonly label = input('Flags');
  readonly disabled = input(false, { transform: booleanAttribute });
  protected readonly closed = closedBy(() => this.disabled());
  /**
   * Each bit latches in a colour of its own, the one whatever draws that flag elsewhere uses, so
   * the row is also the legend. Turned off, every bit takes the primary fill.
   */
  readonly accents = input(true, { transform: booleanAttribute });
  protected readonly bits = [0, 1, 2, 3, 4, 5, 6, 7];
  protected bitClass(bit: number, first: boolean, last: boolean): string {
    const fill = this.accents() ? SET[FLAG_ACCENTS[bit] ?? 'jade'] : CELL_ON.primary;
    return `${BIT} ${fill} ${joined(first, last)}`;
  }
  protected isSet(bit: number): boolean {
    return (this.value() & (1 << bit)) !== 0;
  }
  protected toggle(bit: number): void {
    this.value.set(this.value() ^ (1 << bit));
  }
}
