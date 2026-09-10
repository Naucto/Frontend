import { SPRITE_COUNT, SPRITES_PER_ROW } from '@naucto/engine';
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
function clampToSheet(r: TileRect): TileRect {
  const rows = SPRITE_COUNT / SPRITES_PER_ROW;
  const w = Math.max(1, Math.min(MAX_BRUSH, SPRITES_PER_ROW, r.w));
  const h = Math.max(1, Math.min(MAX_BRUSH, rows, r.h));
  return {
    x: Math.max(0, Math.min(r.x, SPRITES_PER_ROW - w)),
    y: Math.max(0, Math.min(r.y, rows - h)),
    w,
    h,
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
  /** Pixels per sprite pixel (1..4). */
  zoom: number;
  selection: TileRect | null;
}

/**
 * Screen pixels per art pixel, the unit the drawing board's zoom is in.
 *
 * The ceiling is the lower of the two: a map covers far more area than a sheet, and what a canvas
 * that size costs is what sets it.
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
  }),
  withMethods((store) => ({
    setTool(tool: MapTool): void {
      patchState(store, { tool });
    },
    setBrush(brush: TileRect): void {
      patchState(store, { brush: clampToSheet(brush) });
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
