import type { Instrument, Pattern, Song } from '../model';

/** Messages from the main thread to the worklet. */
export type SynthCommand =
  | { type: 'library'; instruments: [string, Instrument][]; patterns: [string, Pattern][] }
  | { type: 'sample'; id: string; data: Float32Array }
  | {
      type: 'note_on';
      instrument: string;
      pitch: number;
      velocity: number;
      length: number;
      channel?: number;
    }
  | { type: 'note_off'; channel: number }
  | { type: 'play_sfx'; pattern: string; pitchOffset: number; volume: number; channel?: number }
  | { type: 'play_song'; song: Song; loop: boolean; fadeIn: number }
  | { type: 'stop_music'; fadeOut: number }
  | { type: 'stop_all' }
  | { type: 'mixer'; master: number; music?: number; sfx?: number };

/** Messages from the worklet back to the main thread. */
export type SynthEvent =
  | { type: 'position'; pattern: number; step: number }
  | { type: 'stopped' }
  | { type: 'voices'; active: boolean[] }
  /**
   * A downsampled peak envelope of what just came out, for the editor's oscilloscope. Peaks
   * rather than raw frames: a render quantum is 128 samples and the scope is ~200px wide, so
   * sending audio would be both far too much data and, once decimated, would alias into a lie.
   */
  | { type: 'scope'; peaks: Float32Array };
