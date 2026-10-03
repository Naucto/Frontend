import { type Rect } from './pixel-tools';

/**
 * The sheet's guides: one between every two pixels, a stronger one between every two sprites. The
 * fine ones only once a pixel is drawn wide enough for a line between two of them to read as a gap.
 */
export const SHEET_GRID = { fineAlpha: 0.07, boldAlpha: 0.2, fineMinScale: 8 } as const;

/** The map's guides: one between every two tiles, a stronger one every `boldEvery` tiles. */
export const MAP_GRID = { boldEvery: 8, fineAlpha: 0.06, boldAlpha: 0.28 } as const;

/** The frame before the one being drawn, ghosted underneath it. */
export const ONION_ALPHA = 0.3;

/** A flagged tile's tint: enough to tell the flag, not enough to hide the sprite under it. */
export const FLAG_TINT_ALPHA = 0.4;

/** The pointer's cell and the region being worked on, drawn heavier than a selection. */
export const MARK_LINE_WIDTH = 2;

/**
 * Strokes `rect`, given in cells drawn `scale` wide, entirely inside its own cells: a line is
 * centred on its path, so the path is pulled in by half the width on every side.
 */
export function outlineCells(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  scale: number,
  lineWidth = 1,
): void {
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(
    rect.x * scale + lineWidth / 2,
    rect.y * scale + lineWidth / 2,
    rect.w * scale - lineWidth,
    rect.h * scale - lineWidth,
  );
  ctx.lineWidth = 1;
}
