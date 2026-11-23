import { BAYER_8 } from './bayer';

/** How wide a cell of a dithered field is drawn, in CSS pixels: one pixel of the kit. */
export const CELL = 3;

/** A colour as its three channels, 0 to 255. */
export type Rgb = readonly [number, number, number];

/** A soft ellipse, in shares of the field's width and height. */
export interface FieldBlob {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** A blob with what it is drawn in: four steps, from the ground up to its own colour. */
export interface PaintedBlob extends FieldBlob {
  ramp: readonly Rgb[];
}

/** The threshold a cell's depth is held against, and a second one, offset, for whose cell it is. */
const DEPTH = new Float32Array(64);
const OWNER = new Float32Array(64);
for (let y = 0; y < 8; y++) {
  for (let x = 0; x < 8; x++) {
    DEPTH[y * 8 + x] = (BAYER_8[y]?.[x] ?? 0) / 64;
    OWNER[y * 8 + x] = ((BAYER_8[(y + 3) & 7]?.[(x + 5) & 7] ?? 0) + 0.5) / 64;
  }
}

/** How far a blob's ramp leaves the ground at each step: gently on a dark page, more on paper. */
const STEPS_DARK = [0, 0.085, 0.165, 0.245];
const STEPS_LIGHT = [0, 0.14, 0.27, 0.4];

export function rampOf(ground: Rgb, colour: Rgb, dark: boolean): Rgb[] {
  return (dark ? STEPS_DARK : STEPS_LIGHT).map((step) => [
    ground[0] + (colour[0] - ground[0]) * step,
    ground[1] + (colour[1] - ground[1]) * step,
    ground[2] + (colour[2] - ground[2]) * step,
  ]);
}

/**
 * Where three blobs sit for a seed: spread around the centre a third of a turn apart, each a
 * little off its place, so the same seed always gives the same sky and two seeds rarely the same.
 */
export function blobLayout(seed: string): FieldBlob[] {
  let state = 0;
  for (let i = 0; i < seed.length; i++) {
    state = (state * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const next = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const turn = next() * Math.PI * 2;
  const spin = next() < 0.5 ? 1 : -1;
  return [0, 1, 2].map((i) => {
    const angle = turn + (spin * i * Math.PI * 2) / 3 + (next() - 0.5) * 0.6;
    const reach = 0.42 + next() * 0.22;
    return {
      cx: 0.5 + Math.cos(angle) * reach * 0.95,
      cy: 0.5 + Math.sin(angle) * reach * 0.85,
      rx: 0.42 + next() * 0.26,
      ry: 0.38 + next() * 0.24,
    };
  });
}

/**
 * Paints the blobs into RGBA pixels, one pixel a cell. Nothing is blended: where blobs meet, an
 * ordered dither decides whose cell it is, and another how deep into that blob's ramp it goes, so
 * every cell is exactly one of the ramps' colours. The blobs are placed in shares of `height`;
 * `rows` past it carry the field on below, for a field that is slid up as the page scrolls.
 */
export function paintField(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  blobs: readonly PaintedBlob[],
  rows = height,
): void {
  const weights = new Float32Array(blobs.length);
  let at = 0;
  for (let y = 0; y < rows; y++) {
    const down = y / height;
    for (let x = 0; x < width; x++, at += 4) {
      const across = x / width;
      const cell = (y & 7) * 8 + (x & 7);
      let total = 0;
      let clear = 1;
      for (let i = 0; i < blobs.length; i++) {
        const blob = blobs[i];
        if (!blob) {
          continue;
        }
        const dx = (across - blob.cx) / blob.rx;
        const dy = (down - blob.cy) / blob.ry;
        const fall = 1 - (dx * dx + dy * dy) * 0.8;
        const weight = fall > 0 ? fall * Math.sqrt(fall) : 0;
        weights[i] = weight;
        total += weight;
        clear *= 1 - Math.min(1, weight);
      }
      let owner = 0;
      let reached = (OWNER[cell] ?? 0) * total;
      for (; owner < blobs.length - 1; owner++) {
        const weight = weights[owner] ?? 0;
        if (reached < weight) {
          break;
        }
        reached -= weight;
      }
      const depth = Math.min(3, Math.floor((1 - clear) * 3.2 + (DEPTH[cell] ?? 0)));
      const colour = blobs[owner]?.ramp[depth];
      if (colour) {
        data[at] = colour[0];
        data[at + 1] = colour[1];
        data[at + 2] = colour[2];
      }
    }
  }
}

/** A picture read one sample a cell: `rows` rows of `width` cells, RGBA. */
export interface BannerSample {
  data: Uint8ClampedArray;
  width: number;
  rows: number;
}

/** In cells: how tall the picture is laid, how far it stays whole, where the last of it goes. */
export const BANNER_ROWS = 140;
const BANNER_WHOLE = 100;
export const BANNER_REACH = 320;

/**
 * Paints a banner into transparent RGBA pixels, `BANNER_REACH` rows of `width`: whole for its first
 * rows, then dropping out cell by cell in an ordered dither until nothing is left, so whatever lies
 * under it shows through the holes. Below the picture its last row runs on, so the fade carries its
 * colours rather than a cut. Every cell it keeps is the picture's colour pulled toward the ground,
 * so text over it reads as on the page.
 */
export function paintBanner(
  data: Uint8ClampedArray,
  width: number,
  banner: BannerSample,
  ground: Rgb,
  dark: boolean,
): void {
  const pull = dark ? 0.55 : 0.6;
  for (let y = 0; y < BANNER_REACH; y++) {
    const share = y < BANNER_WHOLE ? 1 : 1 - (y - BANNER_WHOLE) / (BANNER_REACH - BANNER_WHOLE);
    const row = Math.min(y, banner.rows - 1) * banner.width;
    const matrix = BAYER_8[y & 7];
    for (let x = 0; x < Math.min(width, banner.width); x++) {
      if (share <= ((matrix?.[x & 7] ?? 0) + 0.5) / 64) {
        continue;
      }
      const seen = (row + x) * 4;
      const at = (y * width + x) * 4;
      data[at] = ground[0] + ((banner.data[seen] ?? 0) - ground[0]) * pull;
      data[at + 1] = ground[1] + ((banner.data[seen + 1] ?? 0) - ground[1]) * pull;
      data[at + 2] = ground[2] + ((banner.data[seen + 2] ?? 0) - ground[2]) * pull;
      data[at + 3] = 255;
    }
  }
}
