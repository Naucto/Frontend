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
  'disabled:cursor-not-allowed disabled:bg-transparent disabled:border-line disabled:text-ink-4 ' +
  'disabled:hover:bg-transparent disabled:hover:border-line disabled:hover:text-ink-4 ' +
  'disabled:hover:brightness-100';

/**
 * Nothing fades.
 *
 * A class binding is applied one class at a time, so for part of a frame the element holds some of
 * its colours and not the rest. That single frame is imperceptible on its own; a transition stretches
 * whichever colour landed last into a tenth of a second of the wrong one. Narrowing it to the text
 * only moved which colour flickered.
 *
 * Nothing is lost: this design is drawn in whole pixels, and a state that eases into existence was
 * never part of it.
 */
const BASE =
  'inline-flex cursor-pointer items-center justify-center gap-1 select-none whitespace-nowrap rounded-sm border font-ui uppercase tracking-button ' +
  `focus-visible:outline-2 ${DISABLED}`;

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-gold border-gold text-on-accent hover:bg-orange hover:border-orange',
  run: 'bg-hot border-hot text-on-accent-dark hover:brightness-110',
  secondary: 'bg-raised border-line-strong text-ink-body hover:text-ink hover:border-ink-4',
  sky: 'bg-sky border-sky text-on-accent hover:brightness-110',
  ghost: 'bg-transparent border-transparent text-ink-2 hover:text-ink hover:bg-raised',
  danger:
    'bg-transparent border-hot-ink text-hot-ink hover:bg-hot hover:text-on-accent-dark hover:border-hot',
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
  tool: { box: 'h-[26px] text-label', px: 'px-1.25' },
  // The inline affordance that sits inside another control rather than beside it: the copy and
  // regenerate icons in a friend-code field, the viewer's dock button, AUTOTILE.
  xs: { box: 'h-[22px] text-micro', px: 'px-1' },
  sm: { box: 'h-[24px] text-label', px: 'px-1.25' },
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
