/**
 * A raised cell that latches. `data-on` on the element is the latched state, whatever ARIA
 * attribute says it to a reader: hovered it lights, held it sinks still lit, and it takes its fill
 * only once latched. Face and resting ink are the caller's.
 */
export const CELL =
  'relative raised-sm select-none focus-visible:z-10 ' +
  'not-data-on:enabled:hover:z-10 not-data-on:enabled:hover:bevel-lit not-data-on:enabled:hover:text-ink ' +
  'enabled:active:bevel-down data-on:bevel-down ' +
  'disabled:cursor-not-allowed disabled:bevel-level disabled:bevel-edge-line disabled:bevel-fill-transparent disabled:text-ink-4 ' +
  'disabled:data-on:bevel-fill-line';

export type CellTone = 'primary' | 'jade' | 'sky' | 'hot' | 'orange';

/** What a latched cell is filled with. */
export const CELL_ON: Record<CellTone, string> = {
  primary: 'enabled:data-on:bevel-primary enabled:data-on:text-on-primary',
  jade: 'enabled:data-on:bevel-jade enabled:data-on:text-on-accent',
  sky: 'enabled:data-on:bevel-sky enabled:data-on:text-on-accent',
  hot: 'enabled:data-on:bevel-hot enabled:data-on:text-on-hot',
  orange:
    'enabled:data-on:bevel-edge-orange enabled:data-on:bevel-fill-orange enabled:data-on:text-on-accent',
};

/** The line between two joined cells, drawn on the face of the second. A latched cell has none. */
const SEPARATOR =
  'bevel-open-l before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-line-strong ' +
  'not-data-on:enabled:hover:before:bg-active-ink data-on:before:hidden disabled:before:bg-line';

/**
 * The right side of a hovered cell's frame. That column belongs to the next cell, so the bar is
 * laid over it: its top line, its separator, its bottom line, and one pixel of skirt.
 */
const CLOSING_BAR =
  'bevel-open-r after:absolute after:-top-[3px] after:-right-[3px] after:-bottom-[3px] after:hidden after:w-[3px] ' +
  'after:bg-active-ink after:shadow-[0_3px_0_var(--color-lit-skirt)] ' +
  'not-data-on:enabled:hover:after:block enabled:active:after:shadow-none';

/** What a cell adds to `CELL` to stand in a joined row: only the row's two ends keep a side. */
export function joined(first: boolean, last: boolean): string {
  return `${first ? '' : SEPARATOR} ${last ? '' : CLOSING_BAR}`;
}

/**
 * The mark of a selection: a 9px square that grows in from one pixel and shrinks back to nothing.
 * It only moves once something was picked, so a page does not open on a row of animations.
 */
export function mark(visible: boolean, animated: boolean): string {
  if (visible) {
    return animated
      ? 'block size-[9px] animate-[nc-check_180ms_steps(1,end)_both]'
      : 'block size-[9px]';
  }
  return animated ? 'block size-[9px] animate-[nc-uncheck_240ms_steps(1,end)_both]' : 'hidden';
}

/** The groove of a range: a flat track its thumb overhangs by six pixels above and below. */
export const RANGE_TRACK = 'group relative flat-sm h-[14px] bevel-fill-inset';

/**
 * The native range, invisible over the groove and the thumb's overhang. Its own thumb is given the
 * drawn one's width, which is what makes the two travel the same distance under the pointer.
 */
export const RANGE_INPUT =
  'absolute -top-[12px] -left-[7px] m-0 h-[38px] w-[calc(100%+14px)] cursor-pointer appearance-none opacity-0 ' +
  'disabled:cursor-not-allowed [&::-webkit-slider-thumb]:h-[38px] [&::-webkit-slider-thumb]:w-[14px] ' +
  '[&::-webkit-slider-thumb]:appearance-none [&::-moz-range-thumb]:w-[14px] [&::-moz-range-thumb]:border-0';

/** Where the thumb stands; its `left` is the value, as a share of the groove. */
export const RANGE_THUMB_SLOT = 'pointer-events-none absolute -top-[9px] -ml-[7px]';

/** The thumb takes its states from the range lying over it, which is what the pointer reaches. */
export const RANGE_THUMB =
  'raised-sm block h-[26px] w-[14px] ' +
  'group-has-[input:enabled:hover]:bevel-lit group-has-[input:focus-visible]:bevel-lit group-has-[input:active]:bevel-down ' +
  'group-has-[input:focus-visible]:outline-3 group-has-[input:focus-visible]:outline-offset-3 group-has-[input:focus-visible]:outline-gold ' +
  'group-has-[input:disabled]:bevel-level group-has-[input:disabled]:bevel-edge-line';
