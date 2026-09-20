/**
 * Bubblegum 16 by PineTreePizza (via Lospec) — the console palette, and the source of the colours
 * people are drawn in. The design's rule: "an avatar draws from all sixteen, because a person's
 * colour is a label rather than a semantic, and there are more people than there are accents."
 *
 * Kept in sync with `BUBBLEGUM_16` in @naucto/engine by a test in the app, which is the only
 * workspace that depends on both.
 */
export const IDENTITY_COLOURS = [
  '#16171a',
  '#7f0622',
  '#d62411',
  '#ff8426',
  '#ffd100',
  '#fafdff',
  '#ff80a4',
  '#ff2674',
  '#94216a',
  '#430067',
  '#234975',
  '#68aed4',
  '#bfff3c',
  '#10d275',
  '#007899',
  '#002859',
] as const;

/** The seven palette colours dark enough to need light ink drawn on them. */
const DARK_FILLS = new Set([
  '#16171a',
  '#7f0622',
  '#94216a',
  '#430067',
  '#234975',
  '#002859',
  '#007899',
]);

/**
 * Ink to draw on a palette fill. The design states it once and applies it everywhere:
 * dark ink on the bright colours, `#FAFDFF` on the dark ones — "avatars, keycaps and badges
 * all obey it".
 */
export function inkFor(fill: string): string {
  return DARK_FILLS.has(fill.toLowerCase())
    ? 'var(--color-on-accent-dark)'
    : 'var(--color-on-accent)';
}

/**
 * A person's colour, stable for a given key (user id, or username when no id is to hand) so the
 * same person is the same colour in a byline, a comment thread and a presence stack.
 *
 * Three colours are held back. Near-white reads as "no colour" against the light theme's raised
 * surface; gold and hot are the primary-action and danger fills, so an avatar wearing one looks
 * like a button or a warning rather than a person.
 */
const RESERVED = new Set<string>(['#fafdff', '#ffd100', '#ff2674']);

export function colourOf(key: string | number): string {
  const text = String(key);
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  const candidates = IDENTITY_COLOURS.filter((c) => !RESERVED.has(c));
  return candidates[Math.abs(hash) % candidates.length] as string;
}
