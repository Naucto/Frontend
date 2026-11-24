import { BAYER_8 } from '@naucto/ui';

/** One cell of the mask is one pixel of the kit. */
const CELL = 3;
/** How far the backdrop runs under what follows the hero, where it dissolves. */
export const HERO_BLEED = 240;

/** What the pile and its dots take at the foot of the hero, above the bleed. */
const PILE_HEIGHT = 490;

/**
 * How much of the backdrop shows at a point, from 0 to 1. It is kept off the text: beside the pile
 * that is the left, so the backdrop shows whole along the right edge and falls away toward the
 * text; `stacked`, with the text above the pile, it shows from the pile down. Either way it
 * dissolves into what follows the hero at the bottom.
 */
export function maskAlpha(
  x: number,
  y: number,
  width: number,
  height: number,
  stacked = false,
): number {
  const smooth = (value: number): number => {
    const share = Math.max(0, Math.min(1, value));
    return share * share * (3 - 2 * share);
  };
  const clear = stacked
    ? smooth((y - (height - HERO_BLEED - PILE_HEIGHT - 40)) / 120)
    : smooth((x - width * 0.24) / (width * 0.36));
  const fadeFrom = height - HERO_BLEED - 30;
  const down = 1 - smooth((y - fadeFrom) / (height - 8 - fadeFrom));
  return Math.pow(clear * down, 1.25);
}

/** That falloff as an ordered dither, a PNG the size of the backdrop; null where there is no canvas. */
export function heroMask(width: number, height: number, stacked: boolean): string | null {
  const columns = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  const cells = Object.assign(document.createElement('canvas'), { width: columns, height: rows });
  const full = Object.assign(document.createElement('canvas'), { width, height });
  const pen = cells.getContext('2d');
  const brush = full.getContext('2d');
  if (!pen || !brush) {
    return null;
  }
  const image = pen.createImageData(columns, rows);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const alpha = maskAlpha((column + 0.5) * CELL, (row + 0.5) * CELL, width, height, stacked);
      const threshold = ((BAYER_8[row & 7]?.[column & 7] ?? 0) + 0.5) / 64;
      image.data[(row * columns + column) * 4 + 3] = alpha > threshold ? 255 : 0;
    }
  }
  pen.putImageData(image, 0, 0);
  brush.imageSmoothingEnabled = false;
  brush.drawImage(cells, 0, 0, columns * CELL, rows * CELL);
  return full.toDataURL();
}
