import { computed, Directive, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'run' | 'secondary' | 'sky' | 'ghost' | 'danger';
export type ButtonSize = 'xs' | 'tool' | 'sm' | 'md' | 'bar' | 'hero' | 'lg';

/**
 * Unavailable is a different shape, not the same one faded.
 *
 * It used to be the variant at 40% opacity, which on a filled gold button left the brightest thing
 * on the bar: three separate readers called a disabled PUBLISH the screen's only solid button, and
 * so did the two people checking their work. Stripping the fill is what the design does — a blocked
 * PUBLISH is drawn as the ghost twin of SHARE — and it cannot be misread. The ink stays legible
 * because the button carries the reason in its title.
 */
const DISABLED =
  'disabled:cursor-not-allowed disabled:bg-transparent disabled:text-ink-4 ' +
  'disabled:hover:bg-transparent disabled:hover:text-ink-4 disabled:hover:brightness-100';

/**
 * No transition here.
 *
 * A class binding lands one class at a time, so for part of a frame the element holds some of its
 * colours and not the rest. That frame is imperceptible on its own; a transition stretches whichever
 * colour arrived last into a visible flash of the wrong one.
 */
const BASE =
  'inline-flex cursor-pointer items-center justify-center gap-1 select-none whitespace-nowrap rounded-sm border font-ui uppercase tracking-button ' +
  `focus-visible:outline-2 ${DISABLED}`;

/**
 * What an unavailable button's border becomes is the variant's own business, because there is no
 * one answer.
 *
 * A filled button loses its fill and keeps a line, which is the shape the sheet draws a blocked
 * PUBLISH in. A borderless one keeps no border at all: wherever an editor board draws its undo and
 * redo pair with the second unavailable, that border stays fully transparent and only the ink drops
 * a step. Otherwise a ghost button has a visible shape in the one state where it can do nothing.
 */
const DISABLED_BORDER = 'disabled:border-line disabled:hover:border-line';
const NO_DISABLED_BORDER = 'disabled:border-transparent disabled:hover:border-transparent';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: `bg-gold border-gold text-on-accent hover:bg-orange hover:border-orange ${DISABLED_BORDER}`,
  run: `bg-hot border-hot text-on-accent-dark hover:brightness-110 ${DISABLED_BORDER}`,
  secondary: `bg-raised border-line-strong text-ink-body hover:text-ink hover:border-ink-4 ${DISABLED_BORDER}`,
  sky: `bg-sky border-sky text-on-accent hover:brightness-110 ${DISABLED_BORDER}`,
  ghost: `bg-transparent border-transparent text-ink-2 hover:text-ink hover:bg-raised ${NO_DISABLED_BORDER}`,
  danger: `bg-transparent border-hot-ink text-hot-ink hover:bg-hot hover:text-on-accent-dark hover:border-hot ${DISABLED_BORDER}`,
};

// Measured off the artboards: a row action is 24px, the default is 32px, and the one button a
// screen leads with (PUBLISH, RUN, MAKE IT YOURS) is 34px. Height and padding are kept apart so
// an icon-only button can drop the padding: stacking `px-0` on top of `px-2` left both classes on
// the element, and with both present the later rule in the stylesheet wins — which is why every
// icon-only button in the app was as wide as a labelled one.
const SIZES: Record<ButtonSize, { box: string; px: string }> = {
  // Counting every button the design draws puts 26px first by a wide margin — 94 of them, against
  // 27 at `bar` and 11 at `sm` — and they are almost all the editors' tool strips: PEN, GRID,
  // ONION, SPR 001. The kit had nothing between 24 and 32, so those strips were built out of `md`
  // and came out a third taller than the artboards. That, more than any single value, is why the
  // editors read as an approximation of the design rather than the design.
  tool: { box: 'h-(--nc-control-h) control-type', px: 'px-1.25' },
  // The inline affordance that sits inside another control rather than beside it: the copy and
  // regenerate icons in a share-code field, the viewer's dock button, AUTOTILE.
  xs: { box: 'h-(--nc-control-h-xs) text-micro', px: 'px-1' },
  sm: { box: 'h-(--nc-control-h-sm) control-type', px: 'px-1.25' },
  md: { box: 'h-[32px] text-body', px: 'px-2' },
  // The header bars only. Every control up there is 38px tall — button, bell and avatar alike —
  // so the one thing that is not, the 43px search box, reads as deliberate rather than as drift.
  bar: { box: 'h-[38px] text-body', px: 'px-[16px]' },
  // The hub hero's PLAY and REMIX, and nothing else: measured at 92x34 and 80x34 on the artboard,
  // the only pair sitting over artwork rather than over a surface. The height was 40 here for a
  // round — the 20px of padding is right and was read off the same button, but the box is 34.
  hero: { box: 'h-[40px] text-body', px: 'px-[20px]' },
  // The one place the design uses it is the sign-in submit: 39px, the UI face at 13px, and a
  // wider 0.08em — a button you are meant to land on without aiming.
  lg: { box: 'h-[39px] text-ui tracking-[0.08em]', px: 'px-2' },
};

/** Applies Naucto button styling to a native <button> or <a>. */
@Directive({
  selector: 'button[ncButton], a[ncButton], label[ncButton]',
  host: { '[class]': 'classes()', '[attr.data-variant]': 'variant()' },
})
export class ButtonDirective {
  readonly variant = input<ButtonVariant>('secondary');
  readonly size = input<ButtonSize>('md');
  readonly iconOnly = input(false, {
    transform: (v: boolean | string) => v !== false && v !== 'false',
  });

  protected readonly classes = computed(
    () =>
      `${BASE} ${VARIANTS[this.variant()]} ${SIZES[this.size()].box} ${this.iconOnly() ? 'aspect-square' : SIZES[this.size()].px}`,
  );
}
