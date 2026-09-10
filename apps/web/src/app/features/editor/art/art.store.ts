import { computed } from '@angular/core';
import { DEFAULT_GEOMETRY } from '@naucto/engine';
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
  /**
   * Whether the canvas shows only the region.
   *
   * Off, the whole sheet is on screen and the region is an outline on it — good for placing a
   * sprite among its neighbours. On, everything outside the region is covered and the view fits it,
   * which is what you want once the neighbours stop being the subject.
   */
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
}

/**
 * Keeps a region whole and inside the sheet, whichever corner was dragged.
 *
 * Each axis against its own bound. They were both clamped against the width, which was only ever
 * right because the sheet happened to be square.
 */
function clampRegion(r: SpriteRect, cols: number, rows: number): SpriteRect {
  const w = Math.max(1, Math.min(cols, Math.round(r.w)));
  const h = Math.max(1, Math.min(rows, Math.round(r.h)));
  return {
    x: Math.max(0, Math.min(cols - w, Math.round(r.x))),
    y: Math.max(0, Math.min(rows - h, Math.round(r.y))),
    w,
    h,
  };
}

/** ART tab state (per editor route). */
export const ArtStore = signalStore(
  withState<ArtState>({
    tool: 'pen',
    colour: 4,
    region: { x: 1, y: 0, w: 1, h: 1 },
    clip: true,
    crop: false,
    grid: true,
    onion: false,
    selection: null,
    cols: DEFAULT_GEOMETRY.spritesPerRow,
    rows: DEFAULT_GEOMETRY.spriteRows,
  }),
  withComputed(({ region, cols }) => ({
    /** Index of the region's first cell — what the header names and what the flags are read from. */
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
    /** Follows the document's sheet, pulling the region back inside it when it shrinks. */
    setSheetSize(cols: number, rows: number): void {
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
  })),
);
