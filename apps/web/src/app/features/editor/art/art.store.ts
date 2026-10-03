import { computed } from '@angular/core';
import { DEFAULT_GEOMETRY, FIRST_SHEET_ID } from '@naucto/engine';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

export type ArtTool =
  'pen' | 'fill' | 'line' | 'rect' | 'circle' | 'select' | 'eyedropper' | 'move';

/** A rectangle of art pixels, inside the sheet. */
export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A rectangle of whole 8×8 cells, inside the sheet. The unit the sheet map and the flags speak. */
export interface SpriteRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ArtState {
  tool: ArtTool;
  colour: number;
  /**
   * The cells being worked on: what the flags apply to, what the preview shows, and — while `clip`
   * holds — how far a tool reaches. The canvas itself always shows the whole sheet.
   */
  region: SpriteRect;
  /** Whether a tool stops at the region's edge or may paint the whole sheet. */
  clip: boolean;
  /** Whether the canvas covers everything outside the region and fits the view to it. */
  crop: boolean;
  grid: boolean;
  onion: boolean;
  selection: PixelRect | null;
  /**
   * The sheet's size in cells, kept here because the region is clamped against it.
   *
   * Mirrored from the document rather than read from it: a store holds intent, and giving it the
   * game would make every tab that touches a region depend on the whole document.
   */
  cols: number;
  rows: number;
  sheetId: string;
  /** Pixels per sheet pixel the user chose, or null to fit the sheet to the view. */
  zoom: number | null;
}

/** Keeps a region whole and inside the sheet, whichever corner was dragged. */
function clampRegion(region: SpriteRect, cols: number, rows: number): SpriteRect {
  const width = Math.max(1, Math.min(cols, Math.round(region.w)));
  const height = Math.max(1, Math.min(rows, Math.round(region.h)));
  return {
    x: Math.max(0, Math.min(cols - width, Math.round(region.x))),
    y: Math.max(0, Math.min(rows - height, Math.round(region.y))),
    w: width,
    h: height,
  };
}

/** ART tab state (per editor route). */
export const ArtStore = signalStore(
  withState<ArtState>({
    tool: 'pen',
    colour: 4,
    region: { x: 1, y: 0, w: 1, h: 1 },
    clip: false,
    crop: false,
    grid: true,
    onion: false,
    selection: null,
    cols: DEFAULT_GEOMETRY.spritesPerRow,
    rows: DEFAULT_GEOMETRY.spriteRows,
    sheetId: FIRST_SHEET_ID,
    zoom: null,
  }),
  withComputed(({ region, cols }) => ({
    /** Index of the region's first cell, counted on its own sheet. */
    sprite: computed(() => region().y * cols() + region().x),
  })),
  withMethods((store) => ({
    setTool(tool: ArtTool): void {
      patchState(store, { tool });
    },
    setColour(colour: number): void {
      patchState(store, { colour: Math.max(0, Math.min(15, colour)) });
    },
    setRegion(region: SpriteRect): void {
      patchState(store, {
        region: clampRegion(region, store.cols(), store.rows()),
        selection: null,
      });
    },
    /** A different sheet is a different set of cells, so nothing selected on the old one survives. */
    setSheet(sheetId: string): void {
      patchState(store, { sheetId, region: { x: 0, y: 0, w: 1, h: 1 }, selection: null });
    },
    /** Follows the document's sheet, pulling the region back inside it when it shrinks. */
    setSheetSize(cols: number, rows: number): void {
      if (cols === store.cols() && rows === store.rows()) {
        return;
      }
      patchState(store, { cols, rows, region: clampRegion(store.region(), cols, rows) });
    },
    setClip(clip: boolean): void {
      patchState(store, { clip });
    },
    setCrop(crop: boolean): void {
      patchState(store, { crop });
    },
    setGrid(grid: boolean): void {
      patchState(store, { grid });
    },
    setOnion(onion: boolean): void {
      patchState(store, { onion });
    },
    setSelection(selection: PixelRect | null): void {
      patchState(store, { selection });
    },
    setZoom(zoom: number | null): void {
      patchState(store, { zoom });
    },
  })),
);
