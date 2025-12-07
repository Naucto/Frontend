import * as Tone from "tone";
import { MusicError } from "./Music";
import { getSynth } from "./Note";

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
  return new Promise(resolve => {
    const synth = getSynth(instrument);
    if (synth) {
      synth.triggerAttackRelease(note, duration, when, 0.2);
    }
    resolve();
  });
};
