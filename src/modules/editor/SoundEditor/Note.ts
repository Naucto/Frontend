import * as Tone from "tone";
import { SampleLibrary } from "@modules/editor/SoundEditor/Tonejs-Instruments";

export interface NoteData {
  note: string;
  duration: number;
  instrument: string;
}

// Create a single sampler instance for each instrument
const samplers = new Map<string, Tone.Sampler>();

export const createNote = (
  note: string = "Nan",
  duration: number = 1,
  instrument: string = "piano"
): NoteData => {
  // Initialize sampler for this instrument if it doesn't exist
  if (!samplers.has(instrument)) {
    const sampler = SampleLibrary.load({
      instruments: instrument,
    }).toDestination();
    samplers.set(instrument, sampler);
  }

  return {
    note,
    duration,
    instrument
  };
};

export const noteToJson = (note: NoteData): string => {
  return JSON.stringify({
    note: note.note,
    duration: note.duration,
    instrument: note.instrument
  });
};

export const noteFromJson = (json: string | NoteData): NoteData => {
  if (typeof json === "string") {
    const parsed = JSON.parse(json);
    return createNote(parsed.note, parsed.duration, parsed.instrument);
  }
  return json;
};

// Get the sampler for an instrument
export const getSampler = (instrument: string): Tone.Sampler | undefined => {
  return samplers.get(instrument);
};
