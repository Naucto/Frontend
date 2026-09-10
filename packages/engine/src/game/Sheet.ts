import { SPRITE_SIZE } from './keys';

/**
 * One sprite sheet of a game.
 *
 * A projection over the document, the way a code file is: the pixels are a mirror the game keeps in
 * step, and the methods here are the arithmetic that turns a sprite number into a place on it.
 */
export interface SheetShape {
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly width: number;
  readonly height: number;
  /**
   * The first sprite number this sheet answers to.
   *
   * Sprite numbers run on from one sheet to the next, so a sheet's own cells are `base` to
   * `base + count - 1`. Nothing outside this file should do that addition itself.
   */
  readonly base: number;
}

export class Sheet implements SheetShape {
  readonly cols: number;
  readonly rows: number;
  readonly count: number;

  constructor(
    readonly id: string,
    readonly name: string,
    readonly order: number,
    readonly width: number,
    readonly height: number,
    readonly base: number,
    /** Palette indices, row-major. Replaced when the sheet is resized, so do not hold it. */
    readonly pixels: Uint8Array,
    /** One byte per cell, indexed from 0 within this sheet rather than by sprite number. */
    readonly flags: Uint8Array,
  ) {
    this.cols = width / SPRITE_SIZE;
    this.rows = height / SPRITE_SIZE;
    this.count = this.cols * this.rows;
  }

  /** Whether a sprite number is one of this sheet's. */
  holds(sprite: number): boolean {
    return sprite >= this.base && sprite < this.base + this.count;
  }

  /** Where a sprite number starts on this sheet, in its own pixels. */
  originOf(sprite: number): { x: number; y: number } {
    const local = sprite - this.base;

    return {
      x: (local % this.cols) * SPRITE_SIZE,
      y: Math.floor(local / this.cols) * SPRITE_SIZE,
    };
  }

  getPixel(x: number, y: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;

    return this.pixels[y * this.width + x] ?? 0;
  }

  isEmpty(sprite: number): boolean {
    const { x: ox, y: oy } = this.originOf(sprite);
    for (let y = 0; y < SPRITE_SIZE; y++)
      for (let x = 0; x < SPRITE_SIZE; x++) if (this.getPixel(ox + x, oy + y) !== 0) return false;

    return true;
  }
}
