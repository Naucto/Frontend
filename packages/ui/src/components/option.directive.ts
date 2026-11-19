import { booleanAttribute, computed, Directive, input } from '@angular/core';

/** `row` is as tall as what it holds; `menu` is one line of fixed height, set in caps. */
export type OptionShape = 'menu' | 'row';
export type OptionWash = 'gold' | 'jade' | 'sky' | 'orange';

const BASE =
  'raised-sm bevel-bare relative isolate flex w-full cursor-pointer text-left font-ui select-none ' +
  'hover:bevel-lit hover:text-active-ink active:bevel-down';

const SHAPES: Record<OptionShape, string> = {
  menu: 'h-(--nc-h-lg) items-center gap-1.5 px-[10px] text-body tracking-button whitespace-nowrap uppercase',
  row: 'gap-1.5 px-[11px] pt-1 pb-[5px] text-body',
};

/**
 * The tint under something not read yet: half a dither along the bottom two cells of the row, a
 * quarter above, an eighth above that. Painted on `::before`, beneath what the row holds.
 */
const WASH_SHAPE =
  'before:pointer-events-none before:absolute before:inset-0 before:-z-1 before:content-[""] ' +
  'before:[mask-image:var(--nc-dither-50),var(--nc-dither-50),var(--nc-dither-25),var(--nc-dither-12)] ' +
  'before:[mask-size:12px_12px] before:[mask-repeat:repeat-x] ' +
  'before:[mask-position:0_100%,0_calc(100%-12px),0_calc(100%-24px),0_calc(100%-36px)]';

const WASHES: Record<OptionWash, string> = {
  gold: 'before:bg-wash-gold',
  jade: 'before:bg-wash-jade',
  sky: 'before:bg-wash-sky',
  orange: 'before:bg-wash-orange',
};

/**
 * A row that is chosen from a list: a menu item, a suggestion, a notification. It has no frame
 * until the pointer or the keyboard is on it, then it lights and can be pressed like any button.
 * The role and what a press does stay with the element it sits on.
 */
@Directive({
  selector: '[ncOption]',
  host: { '[class]': 'classes()' },
})
export class OptionDirective {
  readonly shape = input<OptionShape>('row');
  /** Where the keyboard is in the list, or the entry that is current. */
  readonly selected = input(false, { transform: booleanAttribute });
  readonly wash = input<OptionWash>();

  protected readonly classes = computed(() => {
    const wash = this.wash();
    const ink = this.shape() === 'menu' ? 'text-ink-2' : 'text-ink';
    return [
      BASE,
      SHAPES[this.shape()],
      this.selected() ? 'bevel-lit text-active-ink' : ink,
      wash ? `${WASH_SHAPE} ${WASHES[wash]}` : '',
    ].join(' ');
  });
}
