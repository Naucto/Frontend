import { inject } from '@angular/core';
import { baseLayout, type DockLayout } from '@naucto/ui';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

import { EditorPrefsStore } from '../../../core/prefs/editor-prefs.store';

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

export const SOUND_WINDOWS = ['timeline', 'patterns', 'instruments', 'sfx'] as const;
export type SoundWindow = (typeof SOUND_WINDOWS)[number];

export const BAR_DIVISIONS = [1, 2, 4, 8] as const;
export type BarDivision = (typeof BAR_DIVISIONS)[number];

export const MIN_BAR_ZOOM = 0.5;
export const MAX_BAR_ZOOM = 2.25;

export type SoundSide = 'timeline' | 'patterns' | 'instruments' | 'sfx';

export const METRONOME_DIVISIONS = [1, 2, 4] as const;
export type MetronomeDivision = (typeof METRONOME_DIVISIONS)[number];

export interface MetronomeSettings {
  division: MetronomeDivision;
  accent: boolean;
  countIn: boolean;
  volume: number;
}

interface SoundState {
  instrumentId: string | null;
  /**
   * Which pattern number the roll is showing.
   *
   * A number rather than an id, because every number is a pattern: most of them hold nothing, and
   * a pattern that holds nothing is one nobody is using. There is nothing to create and nothing to
   * pick from — you go to a number the way you go to a page.
   */
  patternSlot: number;
  /** Which music the order list is showing. */
  songSlot: number;
  /** Note value the grid snaps to, as its denominator; 0 is free placement. */
  snap: SnapDivision;
  zoom: number;
  loop: boolean;
  metronome: boolean;
  sfxSlot: number;
  sfxLoop: boolean;
  sfxZoom: number;
  metronomeSettings: MetronomeSettings;
  layout: DockLayout<string>;
  focus: SoundWindow;
  selectedBlocks: string[];
  barDivision: BarDivision;
  barZoom: number;
  folded: SoundSide[];
}

/** SOUND tab state (per editor route). */
export const SoundStore = signalStore(
  withState<SoundState>(() => ({
    instrumentId: null,
    patternSlot: 0,
    songSlot: 0,
    // The preference is a yes or no; yes opens on a step, the resolution most notes want.
    snap: inject(EditorPrefsStore).soundSnap() ? 16 : 0,
    zoom: 1,
    loop: true,
    metronome: false,
    sfxSlot: 0,
    sfxLoop: false,
    sfxZoom: 1,
    metronomeSettings: { division: 1, accent: true, countIn: false, volume: 70 },
    layout: baseLayout<string>(SOUND_WINDOWS, 'patterns'),
    focus: 'patterns',
    selectedBlocks: [],
    barDivision: 1,
    barZoom: 1,
    folded: [],
  })),
  withMethods((store) => ({
    selectInstrument(id: string | null): void {
      patchState(store, { instrumentId: id });
    },
    selectSong(slot: number): void {
      patchState(store, { songSlot: slot, selectedBlocks: [] });
    },
    selectSfx(slot: number): void {
      patchState(store, { sfxSlot: Math.max(0, Math.round(slot)) });
    },
    setSfxLoop(sfxLoop: boolean): void {
      patchState(store, { sfxLoop });
    },
    setSfxZoom(zoom: number): void {
      patchState(store, { sfxZoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) });
    },
    setMetronomeSettings(patch: Partial<MetronomeSettings>): void {
      patchState(store, { metronomeSettings: { ...store.metronomeSettings(), ...patch } });
    },
    setLayout(layout: DockLayout<string>): void {
      patchState(store, { layout });
    },
    resetLayout(): void {
      patchState(store, { layout: baseLayout<string>(SOUND_WINDOWS, store.focus()) });
    },
    setFocus(focus: SoundWindow): void {
      patchState(store, { focus });
    },
    selectBlocks(selectedBlocks: string[]): void {
      patchState(store, { selectedBlocks });
    },
    setBarDivision(barDivision: BarDivision): void {
      patchState(store, { barDivision });
    },
    setBarZoom(zoom: number): void {
      patchState(store, { barZoom: Math.max(MIN_BAR_ZOOM, Math.min(MAX_BAR_ZOOM, zoom)) });
    },
    toggleSide(side: SoundSide): void {
      const folded = store.folded();
      patchState(store, {
        folded: folded.includes(side) ? folded.filter((each) => each !== side) : [...folded, side],
      });
    },
    selectPattern(slot: number): void {
      patchState(store, { patternSlot: Math.max(0, Math.round(slot)) });
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
  })),
);
