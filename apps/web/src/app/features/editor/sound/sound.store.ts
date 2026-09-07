import { computed } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

/**
 * Snap is a resolution, not an on/off: "1/16" and "1/8" place notes on different grids, and OFF
 * is one of the choices rather than a separate switch. The value is the denominator in beats.
 */
export const SNAP_DIVISIONS = [1, 2, 4, 8, 16] as const;
export type SnapDivision = (typeof SNAP_DIVISIONS)[number] | 0;

interface SoundState {
  instrumentId: string | null;
  patternId: string | null;
  /** Notes per beat the grid snaps to; 0 is free placement. */
  snap: SnapDivision;
  zoom: 1 | 2;
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
    snap: 4,
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
    selectPattern(id: string | null): void {
      patchState(store, { patternId: id });
    },
    setSnap(snap: SnapDivision): void {
      patchState(store, { snap });
    },
    toggleZoom(): void {
      patchState(store, { zoom: store.zoom() === 1 ? 2 : 1 });
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
