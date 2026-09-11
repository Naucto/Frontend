import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

/**
 * Both editors hold rectangles of small integers and neither can read the other's: palette indices
 * are not sprite numbers, so a paste that crossed would land colours on a map as tiles.
 */
export interface Clip {
  kind: 'pixels' | 'tiles';
  w: number;
  h: number;
  cells: Uint8Array;
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
    take(kind: Clip['kind']): Clip | null {
      const clip = store.clip();
      return clip?.kind === kind ? clip : null;
    },
  })),
);
