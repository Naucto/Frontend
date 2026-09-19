import { MAP_HEIGHT, MAP_WIDTH, SHEET_HEIGHT, SHEET_WIDTH, SPRITE_SIZE } from './keys';

/**
 * How big a game's sheet and map are, in the units each of them is measured in.
 *
 * These were constants until games started running out of room. They are read from the document
 * now, so the numbers below are only what a document that says nothing is taken to mean -- which is
 * exactly what every game written before this held.
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

export const GEOMETRY_KEYS = {
  sheetWidth: 'sheetWidth',
  sheetHeight: 'sheetHeight',
  mapWidth: 'mapWidth',
  mapHeight: 'mapHeight',
} as const;

/** A size snapped to whole sprites and held inside its range. */
export function clampSheetSize(n: number): number {
  const stepped = Math.round(n / SIZE_STEP) * SIZE_STEP;

  return Math.max(MIN_SHEET_SIZE, Math.min(MAX_SHEET_SIZE, stepped));
}

export function clampMapSize(n: number): number {
  return Math.max(MIN_MAP_SIZE, Math.min(MAX_MAP_SIZE, Math.round(n)));
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

/** What a document that records no size is taken to mean. */
export const DEFAULT_GEOMETRY: Geometry = geometryOf(
  SHEET_WIDTH,
  SHEET_HEIGHT,
  MAP_WIDTH,
  MAP_HEIGHT,
);

/** Reads a size a document recorded, falling back to what a document without one means. */
function sizeFrom(meta: { get(key: string): unknown }, key: string, fallback: number): number {
  const v = meta.get(key);

  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;
}

export function readGeometry(meta: { get(key: string): unknown }): Geometry {
  return geometryOf(
    clampSheetSize(sizeFrom(meta, GEOMETRY_KEYS.sheetWidth, SHEET_WIDTH)),
    clampSheetSize(sizeFrom(meta, GEOMETRY_KEYS.sheetHeight, SHEET_HEIGHT)),
    clampMapSize(sizeFrom(meta, GEOMETRY_KEYS.mapWidth, MAP_WIDTH)),
    clampMapSize(sizeFrom(meta, GEOMETRY_KEYS.mapHeight, MAP_HEIGHT)),
  );
}
