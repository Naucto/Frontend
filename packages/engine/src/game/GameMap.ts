/**
 * One tile map of a game.
 *
 * A projection over the document, like {@link Sheet}. Its tiles are sprite numbers, and those run
 * across every sheet, so a map is not tied to one of them.
 */
export class GameMap {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly order: number,
    readonly width: number,
    readonly height: number,
    /** Palette slot this map is marked with, or null where it takes none. */
    readonly colour: number | null,
    /** Sprite numbers, row-major. Replaced when the map is resized, so do not hold it. */
    readonly tiles: Uint16Array,
  ) {}

  getTile(x: number, y: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;

    return this.tiles[y * this.width + x] ?? 0;
  }
}
