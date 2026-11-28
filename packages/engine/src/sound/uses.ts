import type { Game, SoundLibraryPart } from '../game/Game';
import type { Instrument, NoteSheet, Pattern, Sfx, Song } from './model';

/** The instruments a sheet of notes plays. */
export const instrumentsIn = (sheet: Pick<NoteSheet, 'notes'>): string[] => [
  ...new Set(sheet.notes.map((note) => note.instrument)),
];

/** The patterns a music lays out. */
export const patternsIn = (song: Pick<Song, 'blocks'>): string[] => [
  ...new Set(song.blocks.map((block) => block.pattern)),
];

/** What an entry of the sound library names, as `part:id`. */
export function soundNeeds(part: SoundLibraryPart, entry: unknown): string[] {
  if (typeof entry !== 'object' || entry === null) {
    return [];
  }
  switch (part) {
    case 'patterns':
    case 'sfx':
      return instrumentsIn(entry as Pattern | Sfx).map((id) => `instruments:${id}`);
    case 'songs':
      return patternsIn(entry as Song).map((id) => `patterns:${id}`);
    case 'instruments': {
      const sample = (entry as Instrument).sampleId;
      return sample === undefined ? [] : [`samples:${sample}`];
    }
    case 'samples':
      return [];
  }
}

/** Every entry of the sound library, by part. */
export const soundEntries = (
  game: Game,
): Record<SoundLibraryPart, ReadonlyMap<string, unknown>> => ({
  instruments: game.getInstruments(),
  patterns: game.getPatterns(),
  songs: game.getSongs(),
  sfx: game.getSfx(),
  samples: game.getSamples(),
});

/** The entries that name one, as `part:id`: what would be left naming nothing without it. */
export function usersOfSound(game: Game, part: SoundLibraryPart, id: string): string[] {
  const wanted = `${part}:${id}`;
  return Object.entries(soundEntries(game)).flatMap(([userPart, entries]) =>
    [...entries]
      .filter(([, entry]) => soundNeeds(userPart as SoundLibraryPart, entry).includes(wanted))
      .map(([userId]) => `${userPart}:${userId}`),
  );
}
