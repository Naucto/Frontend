import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

export type ArtTool =
  'pen' | 'fill' | 'line' | 'rect' | 'circle' | 'select' | 'eyedropper' | 'move';

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ArtState {
  tool: ArtTool;
  colour: number;
  sprite: number;
  /** Sprite block size in 8×8 cells (1..8). */
  size: number;
  grid: boolean;
  onion: boolean;
  band: number;
  selection: PixelRect | null;
}

/** ART tab state (per editor route). */
export const ArtStore = signalStore(
  withState<ArtState>({
    tool: 'pen',
    colour: 4,
    sprite: 1,
    size: 1,
    grid: true,
    onion: false,
    band: 0,
    selection: null,
  }),
  withMethods((store) => ({
    setTool(tool: ArtTool): void {
      patchState(store, { tool });
    },
    setColour(colour: number): void {
      patchState(store, { colour: Math.max(0, Math.min(15, colour)) });
    },
    setSprite(sprite: number): void {
      patchState(store, { sprite, selection: null });
    },
    setSize(size: number): void {
      patchState(store, { size: Math.max(1, Math.min(8, size)), selection: null });
    },
    setGrid(grid: boolean): void {
      patchState(store, { grid });
    },
    setOnion(onion: boolean): void {
      patchState(store, { onion });
    },
    setBand(band: number): void {
      patchState(store, { band });
    },
    setSelection(selection: PixelRect | null): void {
      patchState(store, { selection });
    },
  })),
);
