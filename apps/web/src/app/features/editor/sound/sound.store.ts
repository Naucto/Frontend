import { computed } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

/**
 * Snap is a resolution, not an on/off: "1/16" and "1/8" place notes on different grids, and OFF
 * is one of the choices rather than a separate switch.
 *
 * The value is the denominator of a note value, read the way every sequencer reads it — 1/16 is a
 * sixteenth note. A step is a sixteenth at the default four steps per beat, so 1/16 is one step,
 * and that is the default here for the same reason.
 */
export const SNAP_DIVISIONS = [4, 8, 16, 32] as const;
export type SnapDivision = (typeof SNAP_DIVISIONS)[number] | 0;

/**
 * How wide a step is drawn, as a multiple of its own width.
 *
 * Below one a sixty-four step pattern fits on a screen whole, which is the only way to see its
 * shape; above it a note can be placed against a grain finer than the eye can aim at unaided.
 */
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;

interface SoundState {
  instrumentId: string | null;
  patternId: string | null;
  /** Which music the order list is showing. */
  songSlot: number;
  /** Note value the grid snaps to, as its denominator; 0 is free placement. */
  snap: SnapDivision;
  zoom: number;
  loop: boolean;
  metronome: boolean;
  /** Selected sfx slot for assignment, null when none. */
  sfxSlot: number | null;
}

/** SOUND tab state (per editor route). */
export const SoundStore = signalStore(
  withState<SoundState>({
    instrumentId: null,
    patternId: null,
    songSlot: 0,
    snap: 16,
    zoom: 1,
    loop: true,
    metronome: false,
    sfxSlot: null,
  }),
  withComputed((s) => ({
    snapLabel: computed(() => (s.snap() === 0 ? 'OFF' : `1/${String(s.snap())}`)),
  })),
  withMethods((store) => ({
    selectInstrument(id: string | null): void {
      patchState(store, { instrumentId: id });
    },
    selectSong(slot: number): void {
      patchState(store, { songSlot: slot });
    },
    selectPattern(id: string | null): void {
      patchState(store, { patternId: id });
    },
    setSnap(snap: SnapDivision): void {
      patchState(store, { snap });
    },
    setZoom(zoom: number): void {
      patchState(store, { zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) });
    },
    setLoop(loop: boolean): void {
      patchState(store, { loop });
    },
    setMetronome(metronome: boolean): void {
      patchState(store, { metronome });
    },
    selectSfxSlot(slot: number | null): void {
      patchState(store, { sfxSlot: slot });
    },
  })),
);
