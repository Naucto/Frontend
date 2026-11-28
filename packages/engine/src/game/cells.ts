export type Transform = 'flipH' | 'flipV' | 'rotateCw' | 'rotateCcw';

/** A rectangle of cells in row-major order: the pixels of a sheet or the tiles of a map alike. */
export interface Block<T extends Uint8Array | Uint16Array> {
  cells: T;
  w: number;
  h: number;
}

/** The block flipped, or turned by a quarter. A rotation swaps `w` and `h`; where the turned block lands is the caller's decision. The result keeps the input's element width. */
export function transformBlock<T extends Uint8Array | Uint16Array>(
  block: Block<T>,
  op: Transform,
): Block<T> {
  const turned = op === 'rotateCw' || op === 'rotateCcw';
  const width = turned ? block.h : block.w;
  const height = turned ? block.w : block.h;
  const cells = new (block.cells.constructor as new (length: number) => T)(width * height);
  const dest = (x: number, y: number): number => {
    switch (op) {
      case 'flipH':
        return y * width + (block.w - 1 - x);
      case 'flipV':
        return (block.h - 1 - y) * width + x;
      case 'rotateCw':
        return x * width + (block.h - 1 - y);
      case 'rotateCcw':
        return (block.w - 1 - x) * width + y;
    }
  };
  for (let y = 0; y < block.h; y++) {
    for (let x = 0; x < block.w; x++) {
      cells[dest(x, y)] = block.cells[y * block.w + x] ?? 0;
    }
  }
  return { cells, w: width, h: height };
}
