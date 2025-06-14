import { NoteData, createNote, noteToJson, noteFromJson } from "./Note";
import { AllNotes, numberToNote, playInstrument } from "./MusicManager";
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
  const numberOfNotes = AllNotes.length * numberOfOctaves;
  const notes = Array.from({ length }, () =>
    Array.from({ length: numberOfNotes }, () => createNote())
  );

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
  if (position < 0 || position >= music.notes.length) {
    throw new MusicError("Note position out of bounds");
  }

  const newNotes = [...music.notes];
  newNotes[position] = [...newNotes[position]];

  if (newNotes[position][note].note === "Nan") {
    newNotes[position][note] = createNote(numberToNote(note), duration, instrument);
  } else {
    newNotes[position][note] = createNote();
  }

  return {
    ...music,
    notes: newNotes
  };
};

export const isNoteActive = (music: MusicData, position: number, note: number): boolean => {
  if (position < 0 || position >= music.notes.length) {
    throw new MusicError("Position out of bounds");
  }
  if (note < 0 || note >= music.notes[position].length) {
    throw new MusicError("Note out of bounds");
  }
  return music.notes[position][note].note !== "Nan";
};

export const playMusic = (music: MusicData): void => {
  let now = Tone.now();
  Tone.start();

  for (const noteList of music.notes) {
    for (const note of noteList) {
      if (note.note !== "Nan") {
        playInstrument(note.note, note.instrument, now, 60 / music.bpm * note.duration);
      }
    }
    now += 60 / music.bpm;
  }
};

export const musicToJson = (music: MusicData): string => {
  return JSON.stringify({
    bpm: music.bpm,
    length: music.length,
    numberOfOctaves: music.numberOfOctaves,
    notes: music.notes.map(row => row.map(note => noteToJson(note))),
  });
};

export const musicFromJson = (json: string): MusicData => {
  const data = JSON.parse(json);
  const music = createMusic(data.bpm, data.length, data.numberOfOctaves);

  return {
    ...music,
    notes: data.notes.map((row: string[]) =>
      row.map(noteData => noteFromJson(noteData))
    )
  };
};
