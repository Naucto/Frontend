import * as Tone from "tone";
import { MusicError } from "./Music";
import { getSampler, getSamplerLoadingPromise, isSamplerReady } from "./Note";

export const AllNotes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const BASE_NOTE = "C4";

const fallbackSynth = new Tone.Synth().toDestination();

export interface SynthNote {
  note: string;
  duration: string;
  type: SynthType;
  volume: number;
}

export enum SynthType {
  SYNTH = 0,
  DUOSYNTH = 1,
  POLYSYNTH = 2,
  // NOISE = 3
}

export const numberToNote = (number: number): string => {
  if (number < 0) {
    throw new MusicError("Number out of bounds");
  }
  const note = AllNotes.length - number % AllNotes.length - 1;
  const octave = 4 - Math.floor(number / AllNotes.length);
  const result = AllNotes[note] + String(octave);
  return result;
};

export const playInstrument = async (
  note: string,
  instrument: string,
  when = Tone.now(),
  duration: Tone.Unit.Time
): Promise<void> => {
  if (note === "Nan") {
    return;
  }

  try {
    await Tone.loaded();

    let sampler = getSampler(instrument);
    if (!sampler) {
      const loadingPromise = getSamplerLoadingPromise(instrument);
      if (loadingPromise) {
        await loadingPromise;
        sampler = getSampler(instrument);
      } else {
        console.error(`No sampler found for instrument: ${instrument}`);
        return;
      }
    }

    if (!sampler) {
      console.error(`Failed to load sampler for instrument: ${instrument}`);
      return;
    }

    if (!isSamplerReady(instrument)) {
      const loadingPromise = getSamplerLoadingPromise(instrument);
      if (loadingPromise) {
        await loadingPromise;
      } else {
        console.error(`No loading promise found for instrument: ${instrument}`);
        return;
      }
    }

    try {
      sampler.triggerAttackRelease(note, duration, when);
    } catch (samplerError) {
      console.warn(`Sampler failed for ${instrument}, using fallback synth:`, samplerError);
      fallbackSynth.triggerAttackRelease(note, duration, when);
    }
  } catch (error) {
    console.error(`Error playing instrument ${instrument}:`, error);
    try {
      fallbackSynth.triggerAttackRelease(note, duration, when);
    } catch (fallbackError) {
      console.error("Fallback synth also failed:", fallbackError);
    }
  }
};
