import { NoteData, createNote, noteToJson, noteFromJson } from "./Note";
import { numberToNote, playInstrument } from "./MusicManager";
import * as Tone from "tone";

export class MusicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MusicError";
  }
}

export interface MusicData {
  notes: NoteData[][];
  bpm: number;
  length: number;
  numberOfOctaves: number;
}

export const createMusic = (
  bpm: number = 240,
  length: number = 32,
  numberOfOctaves: number = 2,
): MusicData => {
  const notes: NoteData[][] = [];
  return {
    notes,
    bpm,
    length,
    numberOfOctaves
  };
};

export const setNote = (
  music: MusicData,
  position: number,
  note: number,
  duration: number,
  instrument: string
): MusicData => {
  if (position < 0 || position >= music.length) {
    throw new MusicError("Note position out of bounds");
  }
  const newNotes = [...music.notes];

  if (!newNotes[position]) {
    newNotes[position] = [];
  }

  newNotes[position][note] = createNote(numberToNote(note), duration, instrument);

  return {
    ...music,
    notes: newNotes
  };
};

export const playMusic = async (music: MusicData): Promise<void> => {
  let now = Tone.now();
  Tone.start();

  const playPromises: Promise<void>[] = [];

  for (let i = 0; i < music.notes.length; i++) {
    if (music.notes[i]) {
      for (const note of music.notes[i]) {
        if (note) {
          playPromises.push(playInstrument(note.note, note.instrument, now, 60 / music.bpm * note.duration));
        }
      }
    }
    now += 60 / music.bpm;
  }

  await Promise.all(playPromises);
};

export const musicToJson = (music: MusicData): string => {
  return JSON.stringify({
    bpm: music.bpm,
    length: music.length,
    numberOfOctaves: music.numberOfOctaves,
    notes: music.notes.map(row => row ? row.map(note => noteToJson(note)) : []),
  });
};

export const musicFromJson = (json: string): MusicData => {
  const data = JSON.parse(json);
  const music = createMusic(data.bpm, data.length, data.numberOfOctaves);

  return {
    ...music,
    notes: data.notes.map((row: string[]) =>
      row ? row.map(noteData => noteFromJson(noteData)) : []
    )
  };
};
