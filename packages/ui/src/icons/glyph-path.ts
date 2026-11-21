/** One kit pixel, in CSS pixels. */
const PIXEL = 3;

/**
 * The path of a drawing packed in `glyphs.ts`, in pixels, set in the middle of a box of `box`
 * cells. Where the middle falls on half a pixel the drawing sits the whole pixel before it: a
 * glyph whose axis is one cell is drawn on an odd count of cells, and every cell of it still
 * lands on whole pixels. `cell` is the side of a cell in the path's unit: a drawing that counts
 * in cells itself asks for 1.
 */
export function glyphPath(glyph: string, box: number, cell = PIXEL): string {
  const width = parseInt(glyph.charAt(0), 36);
  const digits = Math.ceil(width / 4);
  const height = (glyph.length - 1) / digits;
  const left = Math.floor(((box - width) * cell) / 2);
  const top = Math.floor(((box - height) * cell) / 2);
  let path = '';
  for (let y = 0; y < height; y++) {
    const from = 1 + y * digits;
    const row = parseInt(glyph.slice(from, from + digits), 16)
      .toString(2)
      .padStart(digits * 4, '0');
    for (const run of row.matchAll(/1+/g)) {
      const across = run[0].length * cell;
      path += `M${String(left + run.index * cell)} ${String(top + y * cell)}h${String(across)}v${String(cell)}h-${String(across)}z`;
    }
  }
  return path;
}
