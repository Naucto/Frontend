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
  return playMusicFromPosition(music, 0);
};

export const playMusicFromPosition = async (
  music: MusicData,
  startPosition: number = 0,
  onProgress?: (position: number, totalLength: number) => void,
  onAudioStart?: (audioStartTime: number) => void
): Promise<void> => {
  // Collect all instruments that will be used in this playback
  const instrumentsToUse = new Set<string>();
  for (let i = startPosition; i < music.notes.length; i++) {
    if (music.notes[i]) {
      for (const note of music.notes[i]) {
        if (note && note.instrument) {
          instrumentsToUse.add(note.instrument);
        }
      }
    }
  }

  // Pre-initialize all synths before starting playback to prevent lag
  await preInitializeSynths(Array.from(instrumentsToUse));

  // Start audio context and capture when we start
  const wallClockStart = Date.now();
  Tone.start();

  // Wait a moment for audio context to initialize
  await new Promise(resolve => setTimeout(resolve, 50)); // Small delay for initialization

  // Get the current Tone.js time - this is the reference point for all scheduling
  const toneStartTime = Tone.now();

  // Calculate when audio actually starts (wall clock time when Tone context is ready)
  const actualAudioStartTime = Date.now();

  let now = Tone.now();

  const playPromises: Promise<void>[] = [];
  const beatDuration = 60 / music.bpm;
  const totalLength = music.length;

  // Report when audio will actually start playing
  if (onAudioStart) {
    onAudioStart(actualAudioStartTime);
  }

  // Report initial position immediately
  if (onProgress) {
    onProgress(startPosition, totalLength);
  }

  for (let i = startPosition; i < music.notes.length; i++) {
    const columnIndex = i;

    if (music.notes[i]) {
      for (const note of music.notes[i]) {
        if (note) {
          playPromises.push(playInstrument(note.note, note.instrument, now, beatDuration * note.duration));
        }
      }
    }

    // Schedule progress update using Tone.Draw.schedule which runs on the audio thread
    // This fires exactly when the sound is actually being emitted
    if (onProgress) {
      if (i === startPosition) {
        // First column - schedule immediately at the audio time
        Tone.Draw.schedule(() => {
          // Use requestAnimationFrame to update UI from audio thread
          requestAnimationFrame(() => {
            onProgress(columnIndex, totalLength);
          });
        }, now);
      } else {
        // Schedule callback at the exact audio time when this column's notes are emitted
        Tone.Draw.schedule(() => {
          // Use requestAnimationFrame to update UI from audio thread
          requestAnimationFrame(() => {
            onProgress(columnIndex, totalLength);
          });
        }, now);
      }
    }

    now += beatDuration;
  }

  // Wait for all notes to finish playing
  await Promise.all(playPromises);

  // Report completion at the time when the last note finishes playing
  if (onProgress && music.notes.length > startPosition) {
    const lastNoteTime = now; // This is when the last column's notes start
    // Schedule completion callback when last note finishes (we don't track exact end time, so use a small delay)
    Tone.Draw.schedule(() => {
      requestAnimationFrame(() => {
        onProgress(music.notes.length, totalLength);
      });
    }, lastNoteTime);
  }
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

