import { computed, Directive, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'run' | 'secondary' | 'sky' | 'ghost' | 'danger';
export type ButtonSize = 'xs' | 'tool' | 'sm' | 'md' | 'strip' | 'bar' | 'hero' | 'lg';

/**
 * Unavailable is a different shape, not the same one faded: the fill is stripped, as the design
 * draws a blocked button, and the ink stays legible because the button carries the reason in its
 * title.
 */
const DISABLED =
  'disabled:cursor-not-allowed disabled:bg-transparent disabled:text-ink-4 ' +
  'disabled:hover:bg-transparent disabled:hover:text-ink-4 disabled:hover:brightness-100';

const BASE =
  'inline-flex cursor-pointer items-center justify-center gap-1 select-none whitespace-nowrap rounded-sm border font-ui uppercase tracking-button ' +
  `focus-visible:outline-2 ${DISABLED}`;

/**
 * A filled variant keeps a line when unavailable; a borderless one keeps none, or a ghost button
 * would gain a visible shape in the one state where it can do nothing.
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

// Height and padding are kept apart so an icon-only button can drop the padding outright: two
// padding utilities on one element are settled by stylesheet order, not by which was added last.
const SIZES: Record<ButtonSize, { box: string; px: string }> = {
  // The editors' tool strips: the height the design draws most.
  tool: { box: 'h-(--nc-control-h) control-type', px: 'px-1.25' },
  // An inline affordance that sits inside another control rather than beside it.
  xs: { box: 'h-(--nc-control-h-xs) text-micro', px: 'px-1' },
  sm: { box: 'h-(--nc-control-h-sm) control-type', px: 'px-1.25' },
  md: { box: 'h-[32px] text-body', px: 'px-2' },
  // An editor strip beside a framed group, the transport or a tool group: every control on that
  // line stands as tall as the frame, or the line reads as three heights.
  strip: { box: 'h-(--nc-transport-h) control-type', px: 'px-1.25' },
  // The header bars only: every control there shares this height.
  bar: { box: 'h-[38px] text-body', px: 'px-[16px]' },
  // The hub hero's pair, the only buttons sitting over artwork rather than over a surface. Then
  // settle the disagreement in the code: either `h-[34px]` as the comment measured, or keep 40.
  hero: { box: 'h-[40px] text-body', px: 'px-[20px]' },
  // The sign-in submit: a button you are meant to land on without aiming.
  lg: { box: 'h-[39px] text-ui tracking-[0.08em]', px: 'px-2' },
};

/** Applies Naucto button styling to the native element it sits on. */
@Directive({
  selector: 'button[ncButton], a[ncButton], label[ncButton]',
  host: { '[class]': 'classes()', '[attr.data-variant]': 'variant()' },
})
export class ButtonDirective {
  readonly variant = input<ButtonVariant>('secondary');
  readonly size = input<ButtonSize>('md');
  readonly iconOnly = input(false, {
    transform: (value: boolean | string) => value !== false && value !== 'false',
  });

  protected readonly classes = computed(
    () =>
      `${BASE} ${VARIANTS[this.variant()]} ${SIZES[this.size()].box} ${this.iconOnly() ? 'aspect-square' : SIZES[this.size()].px}`,
  );
}
