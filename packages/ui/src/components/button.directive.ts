import { booleanAttribute, computed, Directive, input } from '@angular/core';

export type ButtonVariant =
  'primary' | 'run' | 'secondary' | 'ghost' | 'ghost-danger' | 'danger' | 'jade' | 'sky';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'bar' | 'hero';
/** Sizes the ladder no longer has. Each still resolves, to the step nearest what it was. */
export type RetiredButtonSize = 'tool' | 'strip';

const BASE =
  'inline-flex cursor-pointer items-center justify-center select-none whitespace-nowrap font-ui uppercase active:bevel-down';

/**
 * Unavailable is one shape whatever the variant: the frame drawn flat, no fill, the faintest ink.
 * Only the frame's colour is the variant's to say, because a button that had no frame must not gain
 * one in the state where it can do nothing.
 */
const DISABLED_SHAPE =
  'disabled:cursor-not-allowed disabled:bevel-level disabled:bevel-fill-transparent disabled:text-ink-4';
const DISABLED = `${DISABLED_SHAPE} disabled:bevel-edge-line`;
const DISABLED_BARE = `${DISABLED_SHAPE} disabled:bevel-edge-transparent`;

const LIT = 'hover:bevel-lit hover:text-active-ink';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: `glare bevel-primary text-on-primary hover:bevel-fill-primary-hover ${DISABLED}`,
  run: `glare bevel-hot text-on-hot hover:bevel-fill-hot-hover ${DISABLED}`,
  secondary: `text-ink-body ${LIT} ${DISABLED}`,
  ghost: `bevel-bare text-ink-2 ${LIT} hover:bevel-fill-raised ${DISABLED_BARE}`,
  'ghost-danger': `bevel-bare text-hot-ink hover:bevel-edge-hot hover:bevel-skirt-hot hover:bevel-fill-hot-wash ${DISABLED_BARE}`,
  danger: `bevel-level bevel-edge-hot bevel-fill-transparent text-hot-ink hover:bevel-lift hover:bevel-hot hover:text-on-hot ${DISABLED}`,
  jade: `glare bevel-jade text-on-accent ${DISABLED}`,
  sky: `glare bevel-sky text-on-accent ${DISABLED}`,
};

/** Held down: a neutral button lights, a coloured one keeps its colour, and neither sweeps. */
const PRESSED: Record<ButtonVariant, string> = {
  primary: `bevel-down bevel-primary text-on-primary ${DISABLED}`,
  run: `bevel-down bevel-hot text-on-hot ${DISABLED}`,
  secondary: `bevel-down bevel-lit text-active-ink ${DISABLED}`,
  ghost: `bevel-down bevel-lit text-active-ink ${DISABLED_BARE}`,
  'ghost-danger': `bevel-down bevel-hot text-on-hot ${DISABLED_BARE}`,
  danger: `bevel-down bevel-hot text-on-hot ${DISABLED}`,
  jade: `bevel-down bevel-jade text-on-accent ${DISABLED}`,
  sky: `bevel-down bevel-sky text-on-accent ${DISABLED}`,
};

/** The answer a copy button gives: it stands flat in jade until the caller clears it. */
const COPIED = `bevel-level bevel-edge-jade bevel-fill-jade-wash text-jade-ink ${DISABLED}`;

// Padding is kept apart so an icon-only button can drop it outright: two padding utilities on one
// element are settled by stylesheet order, not by which was added last.
interface SizeClasses {
  box: string;
  px: string;
}
const SM: SizeClasses = {
  box: 'raised-sm h-(--nc-h-sm) gap-1 text-meta tracking-button',
  px: 'px-1.5',
};
const MD: SizeClasses = {
  box: 'raised-sm h-(--nc-h-md) gap-1 text-small tracking-button',
  px: 'px-[14px]',
};
const SIZES: Record<ButtonSize | RetiredButtonSize, SizeClasses> = {
  xs: { box: 'raised-sm h-(--nc-h-xs) gap-[6px] text-label tracking-button', px: 'px-[10px]' },
  sm: SM,
  md: MD,
  lg: { box: 'raised-sm h-(--nc-h-lg) gap-[10px] text-body tracking-button', px: 'px-[18px]' },
  xl: { box: 'raised-sm h-(--nc-h-xl) gap-[10px] text-body tracking-button', px: 'px-[18px]' },
  bar: { box: 'raised-lg h-(--nc-h-bar) gap-[10px] text-body tracking-strip', px: 'px-2.5' },
  hero: { box: 'raised-lg h-(--nc-h-hero) gap-1.5 text-ui tracking-strip', px: 'px-3' },
  tool: SM,
  strip: MD,
};

/** Applies Naucto button styling to the native element it sits on. */
@Directive({
  selector: 'button[ncButton], a[ncButton], label[ncButton]',
  host: {
    '[class]': 'classes()',
    '[attr.data-variant]': 'variant()',
    '[attr.data-pressed]': 'pressed() ? "" : null',
    '[attr.data-copied]': 'copied() ? "" : null',
  },
})
export class ButtonDirective {
  readonly variant = input<ButtonVariant>('secondary');
  readonly size = input<ButtonSize | RetiredButtonSize>('md');
  readonly iconOnly = input(false, { transform: booleanAttribute });
  /** Latched: an open trigger, a held tool. The caller owns the ARIA state that says which. */
  readonly pressed = input(false, { transform: booleanAttribute });
  readonly copied = input(false, { transform: booleanAttribute });

  protected readonly classes = computed(() => {
    const size = SIZES[this.size()];
    const state = this.copied() ? COPIED : (this.pressed() ? PRESSED : VARIANTS)[this.variant()];
    return `${BASE} ${state} ${size.box} ${this.iconOnly() ? 'aspect-square' : size.px}`;
  });
}
