import * as Tone from "tone";
import { MusicError } from "./Music";
import { getSampler } from "./Note";

export const AllNotes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Base note for all instruments
export const BASE_NOTE = "C4";

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

export const playInstrument = (
  note: string,
  instrument: string,
  when = Tone.now(),
  duration: Tone.Unit.Time
): void => {
  if (note === "Nan") {
    return;
  }
  Tone.loaded().then(() => {
    const sampler = getSampler(instrument);
    if (!sampler) {
      console.error(`No sampler found for instrument: ${instrument}`);
      return;
    }
    console.log(`Playing ${note}`, duration, when);
    sampler.triggerAttackRelease(note, duration, when);
  });
};
