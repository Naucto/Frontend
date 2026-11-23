import { Directive } from '@angular/core';

/**
 * What every well answers with, whatever it holds: the lip under it lightens on hover, takes the
 * active ink while the caret is inside, and is hot for as long as what it holds is refused. The lip
 * is what says where focus is, so the text typed in a well draws no ring of its own.
 */
export const WELL =
  'well not-focus-within:hover:bevel-lo-ink-4 focus-within:bevel-lo-active-ink ' +
  'aria-invalid:bevel-lo-hot aria-invalid:not-focus-within:hover:bevel-lo-hot-hover ' +
  'has-aria-invalid:bevel-lo-hot has-aria-invalid:not-focus-within:hover:bevel-lo-hot-hover';

/** A well that takes nothing: drawn flat, with no fill, in the faintest ink. */
export const WELL_DISABLED =
  'disabled:cursor-not-allowed disabled:bevel-edge-line disabled:bevel-lo-line disabled:bevel-fill-transparent disabled:text-ink-4';

/** Styles native text inputs and textareas as a well. */
@Directive({
  selector: 'input[ncInput], textarea[ncInput]',
  host: {
    class:
      `${WELL} block h-(--nc-h-lg) w-full px-1.5 font-ui text-body text-ink outline-none placeholder:text-ink-4 ` +
      `[&:is(textarea)]:h-auto [&:is(textarea)]:py-[10px] ${WELL_DISABLED}`,
  },
})
export class InputDirective {}
