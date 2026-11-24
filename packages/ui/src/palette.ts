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

/** Below this relative luminance a colour outside the palette takes the light ink. */
const DARK_LUMINANCE = 0.16;

/** Relative luminance of a `#rrggbb` colour, from 0 (black) to 1 (white); null for anything else. */
function luminanceOf(fill: string): number | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(fill)?.[1];
  if (hex === undefined) {
    return null;
  }
  const [red, green, blue] = [0, 2, 4].map((at) => {
    const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.040_45 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/**
 * Ink to draw on a fill. The design states it once for the palette and applies it everywhere:
 * dark ink on the bright colours, `#FAFDFF` on the dark ones — "avatars, keycaps and badges
 * all obey it". A colour the palette does not hold, as a game's own, goes by its luminance.
 */
export function inkFor(fill: string): string {
  const colour = fill.toLowerCase();
  const known = (IDENTITY_COLOURS as readonly string[]).includes(colour);
  const dark = known ? DARK_FILLS.has(colour) : (luminanceOf(colour) ?? 1) < DARK_LUMINANCE;
  return dark ? 'var(--color-on-accent-dark)' : 'var(--color-on-accent)';
}

/**
 * Held back: near-white reads as "no colour" on the light theme's raised surface; gold and hot are
 * the primary-action and danger fills, so an avatar wearing one looks like a button or a warning.
 */
const RESERVED = new Set<string>(['#fafdff', '#ffd100', '#ff2674']);

/**
 * A whole number that is the same for a given text on every load and in every browser, to pick
 * one look out of a few by: an id says nothing of what it names, so a look drawn from one is
 * drawn from its hash.
 */
export function hashOf(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * A person's colour, stable for a given key (user id, or username when no id is to hand) so the
 * same person is the same colour in a byline, a comment thread and a presence stack.
 */
export function colourOf(key: string): string {
  const candidates = IDENTITY_COLOURS.filter((colour) => !RESERVED.has(colour));
  return candidates[hashOf(key) % candidates.length] as string;
}
