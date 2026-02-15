import { NoteData, createNote, noteToJson, noteFromJson, preInitializeSynths } from "./Note";
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
  if (position < 0) {
    throw new MusicError("Note position out of bounds");
  }

  const maxLength = 32;
  const requiredLength = Math.max(music.length, position + 1, position + duration);
  const newLength = Math.min(requiredLength, maxLength);

  if (position >= maxLength) {
    throw new MusicError("Note position exceeds maximum grid size");
  }

  const newNotes = [...music.notes];

  while (newNotes.length < newLength) {
    newNotes.push([]);
  }

  if (!newNotes[position]) {
    newNotes[position] = [];
  }

  newNotes[position][note] = createNote(numberToNote(note), duration, instrument);

  return {
    ...music,
    notes: newNotes,
    length: newLength
  };
};

export const playMusicFromPosition = async (
  music: MusicData,
  startPosition: number = 0,
  onProgress?: (position: number, totalLength: number) => void,
  onAudioStart?: (audioStartTime: number) => void,
  endPosition?: number
): Promise<void> => {
  const effectiveEndPosition = endPosition !== undefined ? Math.min(endPosition, music.notes.length) : music.notes.length;

  const instrumentsToUse = new Set<string>();
  for (let i = startPosition; i < effectiveEndPosition; i++) {
    if (music.notes[i]) {
      for (const note of music.notes[i]) {
        if (note && note.instrument) {
          instrumentsToUse.add(note.instrument);
        }
      }
    }
  }

  await preInitializeSynths(Array.from(instrumentsToUse));

  Tone.start();

  Tone.now();

  const actualAudioStartTime = Date.now();

  let now = Tone.now();

  const playPromises: Promise<void>[] = [];
  const beatDuration = 60 / music.bpm;
  const totalLength = music.length;

  if (onAudioStart) {
    onAudioStart(actualAudioStartTime);
  }

  if (onProgress) {
    onProgress(startPosition, totalLength);
  }

  for (let i = startPosition; i < effectiveEndPosition; i++) {
    const columnIndex = i;

    if (music.notes[i]) {
      for (const note of music.notes[i]) {
        if (note && note.note !== "Nan") {
          playPromises.push(playInstrument(note.note, note.instrument, now, beatDuration * note.duration));
        }
      }
    }

    if (!onProgress) {
      now += beatDuration;
      continue;
    }

    Tone.Draw.schedule(() => {
      requestAnimationFrame(() => {
        onProgress(columnIndex, totalLength);
      });
    }, now);

    now += beatDuration;
  }

  await Promise.all(playPromises);

  if (onProgress && effectiveEndPosition > startPosition) {
    const lastNoteTime = now;
    Tone.Draw.schedule(() => {
      requestAnimationFrame(() => {
        onProgress(effectiveEndPosition, totalLength);
      });
    }, lastNoteTime);
  }
};

export const musicToJson = (music: MusicData): string => {
  return JSON.stringify({
    bpm: music.bpm,
    length: music.length,
    numberOfOctaves: music.numberOfOctaves,
    notes: music.notes.map(row => row ? row.map(note => note ? noteToJson(note) : null) : []),
  });
};

export const musicFromJson = (json: string): MusicData => {
  const data = JSON.parse(json);
  const music = createMusic(data.bpm, data.length, data.numberOfOctaves);

  return {
    ...music,
    notes: data.notes.map((row: (string | null)[]) =>
      row ? row.map(noteData => noteData ? noteFromJson(noteData) : null) : []
    )
  };
};

