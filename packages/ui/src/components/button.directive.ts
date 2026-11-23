import { booleanAttribute, computed, Directive, inject, input } from '@angular/core';

import { JoinedDirective } from './joined.directive';

export type ButtonVariant =
  'primary' | 'run' | 'secondary' | 'ghost' | 'ghost-danger' | 'danger' | 'gold' | 'jade' | 'sky';
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
  gold: `glare bevel-gold text-on-accent ${DISABLED}`,
  jade: `glare bevel-jade text-on-accent ${DISABLED}`,
  sky: `glare bevel-sky text-on-accent ${DISABLED}`,
};

/**
 * A ghost cell of an `ncJoined` strip: at rest it keeps the frame a ghost button only shows on
 * hover, drawn in the quiet line and without a fill, so the strip reads as one block; pointed at,
 * it lights as a ghost button does. Unavailable, it keeps the line, or the frame would break.
 */
const JOINED_GHOST =
  `bevel-edge-line bevel-skirt-transparent bevel-fill-transparent text-ink-2 ${LIT} hover:bevel-fill-raised ` +
  'disabled:cursor-not-allowed disabled:bevel-fill-transparent disabled:text-ink-4 disabled:bevel-edge-line';

/**
 * Where a cell meets its neighbours in a strip. Only the strip's two ends keep a side; the line
 * between two cells is drawn on the face of the second, and a pointed-at cell's right side is laid
 * over the next cell's first column, which that line occupies. A latched cell has no line of its
 * own. The cell that is pointed at, focused or latched is drawn over its neighbours.
 */
const JOINED_SIDES =
  'relative hover:z-1 focus-visible:z-1 data-pressed:z-1 ' +
  'not-first:bevel-open-l not-first:before:absolute not-first:before:inset-y-0 not-first:before:left-0 ' +
  'not-first:before:w-[3px] not-first:before:bg-line not-first:not-data-pressed:enabled:hover:before:bg-active-ink ' +
  'not-first:data-pressed:before:hidden ' +
  'not-last:bevel-open-r not-last:after:absolute not-last:after:-top-[3px] not-last:after:-right-[3px] ' +
  'not-last:after:-bottom-[3px] not-last:after:hidden not-last:after:w-[3px] not-last:after:bg-active-ink ' +
  'not-last:after:shadow-[0_3px_0_var(--color-lit-skirt)] not-last:not-data-pressed:enabled:hover:after:block ' +
  'not-last:enabled:active:after:shadow-none';

/** Held down: a neutral button lights, a coloured one keeps its colour, and neither sweeps. */
const PRESSED: Record<ButtonVariant, string> = {
  primary: `bevel-down bevel-primary text-on-primary ${DISABLED}`,
  run: `bevel-down bevel-hot text-on-hot ${DISABLED}`,
  secondary: `bevel-down bevel-lit text-active-ink ${DISABLED}`,
  ghost: `bevel-down bevel-lit text-active-ink ${DISABLED_BARE}`,
  'ghost-danger': `bevel-down bevel-hot text-on-hot ${DISABLED_BARE}`,
  danger: `bevel-down bevel-hot text-on-hot ${DISABLED}`,
  gold: `bevel-down bevel-gold text-on-accent ${DISABLED}`,
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

  private readonly joined = inject(JoinedDirective, { optional: true }) !== null;

  protected readonly classes = computed(() => {
    const size = SIZES[this.size()];
    const ghostCell =
      this.joined && this.variant() === 'ghost' && !this.pressed() && !this.copied();
    const state = ghostCell
      ? JOINED_GHOST
      : this.copied()
        ? COPIED
        : (this.pressed() ? PRESSED : VARIANTS)[this.variant()];
    const sides = this.joined ? JOINED_SIDES : '';
    return `${BASE} ${state} ${sides} ${size.box} ${this.iconOnly() ? 'aspect-square' : size.px}`;
  });
}
