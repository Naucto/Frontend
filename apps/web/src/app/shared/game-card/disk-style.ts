import { BUBBLEGUM_16, hexToRgb, rgbToHex } from '@naucto/engine';
import { hashOf } from '@naucto/ui';

export type DiskFinish =
  'solid' | 'stripes' | 'checker' | 'dots' | 'gradient' | 'gold' | 'silver' | 'holo';
/** Across, down, the two diagonals, or outward from the middle. */
export type DiskGradDir = 'h' | 'v' | 'd' | 'd2' | 'r';

/** How an author dresses a game's disk. Colours are `#rrggbb`. */
export interface DiskStyle {
  color: string;
  finish: DiskFinish;
  /** What a pattern is printed in, or where a gradient ends. Left out, it is drawn from `color`. */
  color2?: string;
  gradDir?: DiskGradDir;
}

/** What a disk wears when nothing says otherwise: the palette's sky, bare. */
export const PLAIN_DISK: DiskStyle = { color: BUBBLEGUM_16[11], finish: 'solid' };

/** The label's own black is held back: a disk moulded in it has no edge left to show. */
const PLASTICS = BUBBLEGUM_16.filter((colour) => colour !== '#16171a');

/** The author's style, or a plastic that stays the same for a given game. */
export function diskStyleFor(game: { id: number; disk?: DiskStyle | null }): DiskStyle {
  return (
    game.disk ?? {
      color: PLASTICS[hashOf(String(game.id)) % PLASTICS.length] as string,
      finish: 'solid',
    }
  );
}

/** A metal is a plastic of its own, so that the bevel is mixed from the metal and not from under it. */
const METAL_BODY: Partial<Record<DiskFinish, string>> = {
  gold: '#d9a62a',
  silver: '#aeb5c0',
  holo: '#c9cdd5',
};
/** Glint, body, sheen and shade of the bands a metal is rolled in. */
const METAL_BANDS = {
  gold: ['#ffe58a', '#d9a62a', '#f0c34a', '#a8781a'],
  silver: ['#f4f6f9', '#aeb5c0', '#d3d8df', '#7d8592'],
} as const;
const HOLO = ['#a6d3ec', '#bff3d6', '#fff1a6', '#ffd0b0', '#ffc0d6', '#d9c6f2']
  .map(
    (colour, i, all) =>
      `${colour} ${((i * 100) / all.length).toFixed(2)}% ${(((i + 1) * 100) / all.length).toFixed(2)}%`,
  )
  .join(', ');

/** The colour the shell is moulded in. */
export function diskBody(style: DiskStyle): string {
  return METAL_BODY[style.finish] ?? style.color;
}

/** Perceived lightness of a `#rrggbb` colour, 0 to 1. */
export function luminance(colour: string): number {
  const [red, green, blue] = hexToRgb(colour);
  return (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
}

function tile(size: number, path: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" width="${String(size)}" height="${String(size)}">${path}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 0 0 / ${String(size)}px ${String(size)}px`;
}

const SPARKLES = tile(
  36,
  '<path fill="#fff" fill-opacity=".9" d="M9 6h3v9H9zM6 9h9v3H6zM27 24h3v3h-3z"/>',
);

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const ramps = new Map<string, string>();

/**
 * A ramp from nothing to `to` in ordered dither, one canvas pixel per 3px cell and scaled back up:
 * the cells stay whole at any disk size, which a stretched tile cannot promise.
 */
export function ditherRamp(width: number, height: number, to: string, dir: DiskGradDir): string {
  const key = `${String(width)}x${String(height)}${to}${dir}`;
  const known = ramps.get(key);
  if (known) {
    return known;
  }
  const columns = Math.ceil(width / 3);
  const rows = Math.ceil(height / 3);
  const canvas = document.createElement('canvas');
  canvas.width = columns;
  canvas.height = rows;
  const context = canvas.getContext('2d');
  if (!context) {
    return 'none';
  }
  context.fillStyle = to;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const across = (x + 0.5) / columns;
      const down = (y + 0.5) / rows;
      const along = {
        h: across,
        v: down,
        d: (across + down) / 2,
        d2: (1 - across + down) / 2,
        r: Math.min(1, Math.hypot(across - 0.5, ((down - 0.5) * height) / width) / 0.62),
      }[dir];
      // Both ends hold their colour over the first and last 8% before the ramp starts.
      const level = Math.max(0, Math.min(1, (along - 0.08) / 0.84)) * 16;
      if (level > (BAYER[(y % 4) * 4 + (x % 4)] ?? 0) + 0.5) {
        context.fillRect(x, y, 1, 1);
      }
    }
  }
  if (ramps.size > 80) {
    ramps.clear();
  }
  const ramp = `url("${canvas.toDataURL('image/png')}") 0 0 / ${String(columns * 3)}px ${String(rows * 3)}px no-repeat`;
  ramps.set(key, ramp);
  return ramp;
}

/**
 * What is printed over the plastic, as a CSS `background`; `null` for bare plastic. A gradient is
 * drawn to the pixel, so it waits for `width`, the disk's own in CSS pixels.
 */
export function diskFinish(style: DiskStyle, width: number): string | null {
  const body = diskBody(style);
  const [red, green, blue] = hexToRgb(body);
  const toward = luminance(body) > 0.5 ? 0 : 255;
  const print =
    style.color2 ??
    rgbToHex(
      Math.round(red + (toward - red) * 0.22),
      Math.round(green + (toward - green) * 0.22),
      Math.round(blue + (toward - blue) * 0.22),
    );
  switch (style.finish) {
    case 'solid':
      return null;
    case 'stripes':
      return `repeating-linear-gradient(180deg, ${print} 0 6px, transparent 6px 12px)`;
    case 'checker':
      return `repeating-conic-gradient(${print} 0 25%, transparent 0 50%) 0 0 / 12px 12px`;
    case 'dots':
      return tile(12, `<path fill="${print}" d="M3 3h3v3H3z"/>`);
    case 'gradient':
      // The finish stops 6px short of every edge of a disk that is 1.02 times as tall as it is wide.
      return width
        ? ditherRamp(
            Math.max(12, width - 12),
            Math.max(12, Math.round(width * 1.02) - 12),
            style.color2 ?? '#ff2674',
            style.gradDir ?? 'h',
          )
        : null;
    case 'holo':
      return `${SPARKLES}, linear-gradient(90deg, ${HOLO})`;
    case 'gold':
    case 'silver': {
      const [glint, base, sheen, shade] = METAL_BANDS[style.finish];
      return `${SPARKLES}, linear-gradient(180deg, ${glint} 0 5%, ${base} 5% 13%, ${sheen} 13% 17%, ${base} 17% 24%, ${shade} 24% 28%, ${base} 28% 70%, ${sheen} 70% 74%, ${base} 74% 100%)`;
    }
  }
}
