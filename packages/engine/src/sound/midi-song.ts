import { convertMidi, type MidiImportReport, type MidiInstrument, type ParsedMidi } from './midi';
import { type Instrument, type Pattern, type Song, type SongBlock, VOICES } from './model';
import { patternBars } from './timeline';

export interface MidiSongOptions {
  /** What the music is called. */
  name: string;
  /** The file's tracks to bring in, in the order they become the music's tracks. */
  tracks: number[];
  /** Voices kept for the sound effects while the music plays. */
  sfxVoices: number;
  /** First pattern number to use; the caller picks one past those taken. */
  firstSlot: number;
  /** Ids of what the import makes start with this, so two imports never meet. */
  prefix: string;
  /** Tempo of the music; the file's own by default. */
  bpm?: number;
  /** A chip voice per file track, chosen by the person; a default one otherwise. */
  instruments?: Record<number, Omit<MidiInstrument, 'id'>>;
}

export interface MidiTrackReport extends MidiImportReport {
  /** The file track this music track came from. */
  source: number;
  name: string;
  /** Voices the track was given. */
  voices: number;
}

export interface MidiSong {
  song: Song;
  patterns: Pattern[];
  instruments: Instrument[];
  reports: MidiTrackReport[];
}

/** The most notes of one file track that sound at once. */
function peakOf(parsed: ParsedMidi, index: number): number {
  const notes = parsed.tracks.find((track) => track.index === index)?.notes ?? [];
  const edges = notes.flatMap((note) => [
    { at: note.start, by: 1 },
    { at: note.end, by: -1 },
  ]);
  edges.sort((a, b) => a.at - b.at || a.by - b.by);
  let now = 0;
  let peak = 0;
  for (const edge of edges) {
    now += edge.by;
    peak = Math.max(peak, now);
  }
  return Math.max(1, peak);
}

/**
 * The voices the music may hold, shared between its tracks: one each first, then the rest to the
 * tracks whose chords need them, in order. The same rule `voicePlan` plays the music with, so a
 * track is converted to the voices it will actually have.
 */
export function shareVoices(peaks: readonly number[], sfxVoices: number): number[] {
  let left = VOICES - Math.max(0, Math.min(VOICES - peaks.length, sfxVoices));
  const given = peaks.map(() => 0);
  peaks.forEach((_, i) => {
    if (left > 0) {
      given[i] = 1;
      left -= 1;
    }
  });
  peaks.forEach((peak, i) => {
    const extra = Math.min(left, peak - (given[i] ?? 0));
    given[i] = (given[i] ?? 0) + extra;
    left -= extra;
  });
  return given;
}

/**
 * A MIDI file as a music of the SOUND tab: each chosen file track becomes a track of the music, its
 * own instrument and its own patterns laid out as blocks on the timeline. A section that repeats is
 * stored once and played again, by a block's repeat when it comes straight back and by another
 * block when it comes later. Silent sections take no block.
 *
 * Every track starts at the music's first bar, so the tracks stay together however their
 * patterns are cut.
 */
export function midiToSong(parsed: ParsedMidi, options: MidiSongOptions): MidiSong {
  const max = VOICES - Math.min(options.sfxVoices, VOICES - 1);
  if (options.tracks.length === 0 || options.tracks.length > max) {
    throw new Error(`Choose between 1 and ${String(max)} tracks`);
  }
  const voices = shareVoices(
    options.tracks.map((index) => peakOf(parsed, index)),
    options.sfxVoices,
  );
  const patterns: Pattern[] = [];
  const instruments: Instrument[] = [];
  const blocks: SongBlock[] = [];
  const reports: MidiTrackReport[] = [];
  let slot = options.firstSlot;
  let bpm = options.bpm ?? 0;
  options.tracks.forEach((source, track) => {
    const conversion = convertMidi(parsed, {
      prefix: `${options.prefix}-${String(track)}`,
      voices: Math.max(1, voices[track] ?? 1),
      tracks: [source],
      ...(options.instruments ? { instruments: options.instruments } : {}),
      ...(options.bpm === undefined ? {} : { bpm: options.bpm }),
      firstSlot: slot,
    });
    const file = parsed.tracks.find((held) => held.index === source);
    const name = (file?.name ?? '').slice(0, 12);
    const kept = conversion.patterns.filter((pattern) => pattern.notes.length > 0);
    const keptIds = new Set(kept.map((pattern) => pattern.id));
    // Named for the track they play, which the list and a block show, not for the import's ids.
    patterns.push(
      ...kept.map((pattern, i) => ({
        ...pattern,
        slot: slot + i,
        name: `${name} ${String(i + 1)}`,
      })),
    );
    slot += kept.length;
    instruments.push(...conversion.instruments);
    bpm ||= conversion.patterns[0]?.bpm ?? 120;
    const bars = conversion.patterns[0] ? patternBars(conversion.patterns[0]) : 0;
    let last: SongBlock | null = null;
    conversion.song.sequence.forEach((pattern, i) => {
      if (!keptIds.has(pattern)) {
        last = null;
        return;
      }
      if (last?.pattern === pattern) {
        last.repeat += 1;
        return;
      }
      last = {
        id: `${options.prefix}-b${String(track)}-${String(i)}`,
        pattern,
        start: i * bars,
        repeat: 1,
        track,
      };
      blocks.push(last);
    });
    reports.push({
      ...conversion.report,
      source,
      name: file?.name ?? '',
      voices: voices[track] ?? 0,
    });
  });
  return {
    song: {
      name: options.name,
      bpm,
      blocks,
      tracks: reports.map((report) => report.name.slice(0, 24)),
      sfxVoices: options.sfxVoices,
      loop: true,
      loopStart: 0,
    },
    patterns,
    instruments,
    reports,
  };
}
