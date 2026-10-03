import { MAP_HEIGHT, MAP_WIDTH, SHEET_HEIGHT, SHEET_WIDTH, SPRITE_SIZE } from './keys';

/**
 * How big a game's first sheet and first map are, with the defaults below standing for a game that
 * has neither.
 */
export interface Geometry {
  /** Sheet, in pixels. Always a whole number of sprites. */
  readonly sheetWidth: number;
  readonly sheetHeight: number;
  /** The same sheet, in sprites -- the units a sprite number is counted in. */
  readonly spritesPerRow: number;
  readonly spriteRows: number;
  readonly spriteCount: number;
  /** Map, in tiles. */
  readonly mapWidth: number;
  readonly mapHeight: number;
}

/** Sizes move a whole sprite at a time: half a sprite is a sprite cut across a boundary. */
export const SIZE_STEP = SPRITE_SIZE;
export const MIN_SHEET_SIZE = SIZE_STEP;
export const MAX_SHEET_SIZE = 256;
export const MIN_MAP_SIZE = 1;
export const MAX_MAP_SIZE = 256;

/** A size snapped to whole sprites and held inside its range. */
export function clampSheetSize(size: number): number {
  const stepped = Math.round(size / SIZE_STEP) * SIZE_STEP;

  return Math.max(MIN_SHEET_SIZE, Math.min(MAX_SHEET_SIZE, stepped));
}

export function clampMapSize(size: number): number {
  return Math.max(MIN_MAP_SIZE, Math.min(MAX_MAP_SIZE, Math.round(size)));
}

export function geometryOf(
  sheetWidth: number,
  sheetHeight: number,
  mapWidth: number,
  mapHeight: number,
): Geometry {
  const spritesPerRow = sheetWidth / SPRITE_SIZE;
  const spriteRows = sheetHeight / SPRITE_SIZE;

  return {
    sheetWidth,
    sheetHeight,
    spritesPerRow,
    spriteRows,
    spriteCount: spritesPerRow * spriteRows,
    mapWidth,
    mapHeight,
  };
}

/** The size a new sheet and a new map start at. */
export const DEFAULT_GEOMETRY: Geometry = geometryOf(
  SHEET_WIDTH,
  SHEET_HEIGHT,
  MAP_WIDTH,
  MAP_HEIGHT,
);
