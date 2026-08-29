import { SPRITE_COUNT, SPRITES_PER_ROW } from '@naucto/engine';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

export type MapTool = 'stamp' | 'fill' | 'select' | 'erase';

/** Keep an n×n brush inside the sheet: no wrapping onto the next row, no running off the bottom. */
function clampToSheet(sprite: number, brush: number): number {
  const rows = SPRITE_COUNT / SPRITES_PER_ROW;
  const column = Math.min(sprite % SPRITES_PER_ROW, SPRITES_PER_ROW - brush);
  const row = Math.min(Math.floor(sprite / SPRITES_PER_ROW), rows - brush);
  return Math.max(0, row) * SPRITES_PER_ROW + Math.max(0, column);
}

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface MapState {
  tool: MapTool;
  sprite: number;
  /** Brush footprint in tiles (1..8). */
  brush: number;
  grid: boolean;
  flags: boolean;
  /** Pixels per sprite pixel (1..4). */
  zoom: number;
  selection: TileRect | null;
}

/** MAP tab state (per editor route). */
export const MapStore = signalStore(
  withState<MapState>({
    tool: 'stamp',
    sprite: 1,
    brush: 1,
    grid: true,
    flags: false,
    zoom: 2,
    selection: null,
  }),
  withMethods((store) => ({
    setTool(tool: MapTool): void {
      patchState(store, { tool });
    },
    setSprite(sprite: number): void {
      patchState(store, { sprite: clampToSheet(sprite, store.brush()) });
    },
    setBrush(brush: number): void {
      const next = Math.max(1, Math.min(8, brush));
      // Widening the brush can push the picked sprite past the right edge of the sheet, and the
      // extra columns would then wrap onto the next row when stamping. Pull it back instead.
      patchState(store, { brush: next, sprite: clampToSheet(store.sprite(), next) });
    },
    setGrid(grid: boolean): void {
      patchState(store, { grid });
    },
    setFlags(flags: boolean): void {
      patchState(store, { flags });
    },
    zoomBy(delta: number): void {
      patchState(store, { zoom: Math.max(1, Math.min(4, store.zoom() + delta)) });
    },
    setSelection(selection: TileRect | null): void {
      patchState(store, { selection });
    },
  })),
);
