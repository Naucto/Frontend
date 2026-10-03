import { DEFAULT_GEOMETRY, FIRST_MAP_ID, FIRST_SHEET_ID } from '@naucto/engine';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { stepZoom } from '../art/sprite-canvas.component';

export type MapTool = 'stamp' | 'fill' | 'select' | 'erase' | 'move';

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The widest and tallest a brush may be, in sprites. */
const MAX_BRUSH = 8;

/**
 * Keep a brush whole and inside the sheet, whichever corner was dragged.
 *
 * Both axes are clamped separately: a brush that overhangs the right edge would wrap onto the next
 * row when stamped, and one that overhangs the bottom would ask for sprites the sheet has not got.
 */
function clampToSheet(rect: TileRect, cols: number, rows: number): TileRect {
  const width = Math.max(1, Math.min(MAX_BRUSH, cols, rect.w));
  const height = Math.max(1, Math.min(MAX_BRUSH, rows, rect.h));
  return {
    x: Math.max(0, Math.min(rect.x, cols - width)),
    y: Math.max(0, Math.min(rect.y, rows - height)),
    w: width,
    h: height,
  };
}

interface MapState {
  tool: MapTool;
  /**
   * The block of the sheet a press stamps, as a rectangle on it.
   *
   * One value rather than an origin and a size, because the picker is drawn on: where to take from
   * and how much to take are the same gesture.
   */
  brush: TileRect;
  grid: boolean;
  flags: boolean;
  /** Screen pixels per art pixel, between {@link MAP_MIN_ZOOM} and {@link MAP_MAX_ZOOM}. */
  zoom: number;
  selection: TileRect | null;
  /** Which sheet the brush is picked from. A map may take its tiles from any of them. */
  sheetId: string;
  /** That sheet's size in cells. Mirrored from the document, like ART's. */
  cols: number;
  rows: number;
  mapId: string;
}

/**
 * Screen pixels per art pixel, at the ends; a map covers far more area than a sheet, so the ceiling
 * is what a canvas that size costs.
 */
export const MAP_MIN_ZOOM = 1;
export const MAP_MAX_ZOOM = 8;

/** MAP tab state (per editor route). */
export const MapStore = signalStore(
  withState<MapState>({
    tool: 'stamp',
    brush: { x: 1, y: 0, w: 1, h: 1 },
    grid: true,
    flags: false,
    zoom: 2,
    selection: null,
    sheetId: FIRST_SHEET_ID,
    cols: DEFAULT_GEOMETRY.spritesPerRow,
    rows: DEFAULT_GEOMETRY.spriteRows,
    mapId: FIRST_MAP_ID,
  }),
  withMethods((store) => ({
    setTool(tool: MapTool): void {
      patchState(store, { tool });
    },
    setBrush(brush: TileRect): void {
      patchState(store, { brush: clampToSheet(brush, store.cols(), store.rows()) });
    },
    /** A different map is a different grid, so nothing selected on the old one survives. */
    setMap(mapId: string): void {
      patchState(store, { mapId, selection: null });
    },
    /** A different sheet is a different set of cells, so the brush goes back to its first one. */
    setSheet(sheetId: string): void {
      patchState(store, { sheetId, brush: { x: 0, y: 0, w: 1, h: 1 } });
    },
    /** Follows the chosen sheet, pulling the brush back onto it when it shrinks. */
    setSheetSize(cols: number, rows: number): void {
      if (cols === store.cols() && rows === store.rows()) {
        return;
      }
      patchState(store, { cols, rows, brush: clampToSheet(store.brush(), cols, rows) });
    },
    setGrid(grid: boolean): void {
      patchState(store, { grid });
    },
    setFlags(flags: boolean): void {
      patchState(store, { flags });
    },
    zoomBy(delta: number): void {
      patchState(store, { zoom: stepZoom(store.zoom(), delta, MAP_MIN_ZOOM, MAP_MAX_ZOOM) });
    },
    setZoom(zoom: number): void {
      patchState(store, {
        zoom: Math.max(MAP_MIN_ZOOM, Math.min(MAP_MAX_ZOOM, zoom)),
      });
    },
    setSelection(selection: TileRect | null): void {
      patchState(store, { selection });
    },
  })),
);
