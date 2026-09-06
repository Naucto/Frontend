import { computed } from '@angular/core';
import { SPRITES_PER_ROW } from '@naucto/engine';
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
  grid: boolean;
  onion: boolean;
  selection: PixelRect | null;
}

/** Keeps a region whole and inside the sheet, whichever corner was dragged. */
function clampRegion(r: SpriteRect): SpriteRect {
  const w = Math.max(1, Math.min(SPRITES_PER_ROW, Math.round(r.w)));
  const h = Math.max(1, Math.min(SPRITES_PER_ROW, Math.round(r.h)));
  return {
    x: Math.max(0, Math.min(SPRITES_PER_ROW - w, Math.round(r.x))),
    y: Math.max(0, Math.min(SPRITES_PER_ROW - h, Math.round(r.y))),
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
    grid: true,
    onion: false,
    selection: null,
  }),
  withComputed(({ region }) => ({
    /** Index of the region's first cell — what the header names and what the flags are read from. */
    sprite: computed(() => region().y * SPRITES_PER_ROW + region().x),
  })),
  withMethods((store) => ({
    setTool(tool: ArtTool): void {
      patchState(store, { tool });
    },
    setColour(colour: number): void {
      patchState(store, { colour: Math.max(0, Math.min(15, colour)) });
    },
    setRegion(region: SpriteRect): void {
      patchState(store, { region: clampRegion(region), selection: null });
    },
    setClip(clip: boolean): void {
      patchState(store, { clip });
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
