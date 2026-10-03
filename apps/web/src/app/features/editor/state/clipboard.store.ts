import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

/**
 * Both editors hold rectangles of small integers and neither can read the other's: palette indices
 * are not sprite numbers, so a paste that crossed would land colours on a map as tiles.
 *
 * Nor are they the same width. A palette index fits a byte; a tile is a sprite number, and the
 * second sheet's sprites start at 256, so a tile clip holds sixteen bits or it truncates them.
 */
export interface PixelClip {
  kind: 'pixels';
  w: number;
  h: number;
  cells: Uint8Array;
}

export interface TileClip {
  kind: 'tiles';
  w: number;
  h: number;
  cells: Uint16Array;
}

export type Clip = PixelClip | TileClip;

/** The member a kind names, so a canvas that asks for its own kind gets its own array type back. */
export type ClipOf<K extends Clip['kind']> = Extract<Clip, { kind: K }>;

interface ClipboardState {
  clip: Clip | null;
}

/**
 * Provided beside the tab stores rather than in a tab: a tab's component is destroyed on every
 * navigation, and something copied has to outlive the trip to where it is going to be pasted.
 */
export const ClipboardStore = signalStore(
  withState<ClipboardState>({ clip: null }),
  withMethods((store) => ({
    put(clip: Clip): void {
      patchState(store, { clip });
    },
    take<K extends Clip['kind']>(kind: K): ClipOf<K> | null {
      const clip = store.clip();
      return clip?.kind === kind ? (clip as ClipOf<K>) : null;
    },
  })),
);
