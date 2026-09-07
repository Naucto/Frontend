/**
 * Number and time formatting shared by every surface that shows counts or "n minutes ago".
 * Three pages were slicing ISO strings by hand before this existed.
 */

const GROUPED = new Intl.NumberFormat('en-GB', { useGrouping: true });
const COMPACT = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });

/** `1008` → `1 008`. The design groups thousands with a thin space. */
export function formatCount(value: number): string {
  return GROUPED.format(value).replace(/,/g, ' ');
}

/** `1247` → `1.2k`, for the tighter profile and card stat rows. */
export function formatCompact(value: number): string {
  return COMPACT.format(value).toLowerCase();
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * `2 minutes ago`, `yesterday`, `3 weeks ago`. Uppercasing is left to the caller, because the
 * design shows both `2 MIN AGO` (meta rows) and `2 minutes ago` (version list).
 */
export function formatRelative(value: Date | string | number, now: number = Date.now()): string {
  const then = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const delta = now - then;
  if (delta < MINUTE) return 'just now';
  if (delta < HOUR) return plural(Math.floor(delta / MINUTE), 'minute');
  if (delta < DAY) return plural(Math.floor(delta / HOUR), 'hour');
  if (delta < 2 * DAY) return 'yesterday';
  if (delta < WEEK) return plural(Math.floor(delta / DAY), 'day');
  if (delta < 5 * WEEK) return plural(Math.floor(delta / WEEK), 'week');
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(then);
}

function plural(n: number, unit: string): string {
  return `${String(n)} ${unit}${n === 1 ? '' : 's'} ago`;
}

/**
 * How long something has been going on, in the design's compact form: "12 min", "2 h", "3 d".
 * Distinct from {@link formatRelative}, which points at a moment in the past ("12 minutes ago").
 */
export function formatElapsed(value: Date | string | number, now: number = Date.now()): string {
  const then = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const delta = Math.max(0, now - then);
  if (delta < MINUTE) return 'just now';
  if (delta < HOUR) return `${String(Math.floor(delta / MINUTE))} min`;
  if (delta < DAY) return `${String(Math.floor(delta / HOUR))} h`;
  return `${String(Math.floor(delta / DAY))} d`;
}
