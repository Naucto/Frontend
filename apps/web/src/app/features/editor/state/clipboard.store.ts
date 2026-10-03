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

/** What Mod-C, Mod-X and Mod-V reach on one canvas. */
export interface ClipboardSurface<K extends Clip['kind']> {
  readonly kind: K;
  /** What a copy takes, or null when there is nothing to. A canvas may fall back past its selection. */
  copy(): ClipOf<K> | null;
  /** A cut takes the selection or nothing: it empties what it took, so it never falls back. */
  hasSelection(): boolean;
  clear(): void;
  paste(clip: ClipOf<K>): void;
}

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
  withMethods((store) => ({
    /** Answers the clipboard's key — `c`, `x` or `v` — on `surface`; false for any other key. */
    transfer<K extends Clip['kind']>(key: string, surface: ClipboardSurface<K>): boolean {
      if (key === 'c' || key === 'x') {
        if (key === 'x' && !surface.hasSelection()) {
          return true;
        }
        const clip = surface.copy();
        if (clip) {
          store.put(clip);
          if (key === 'x') {
            surface.clear();
          }
        }
        return true;
      }
      if (key !== 'v') {
        return false;
      }
      const clip = store.take(surface.kind);
      if (clip) {
        surface.paste(clip);
      }
      return true;
    },
  })),
);
