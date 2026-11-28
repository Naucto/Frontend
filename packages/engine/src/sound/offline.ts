import { BEATS_PER_BAR, type Instrument, type NoteSheet, type Pattern, type Song } from './model';
import { decodeSample } from './sample-codec';
import { Sequencer } from './Sequencer';
import { SynthCore } from './SynthCore';
import { songEnd, voicePlan } from './timeline';

/** What a sound is played with. */
export interface SoundLibrary {
  instruments: Map<string, Instrument>;
  patterns: Map<string, Pattern>;
  /** Sample id to its encoded PCM. */
  samples: ReadonlyMap<string, string>;
}

/** A note as written, in seconds from the start. */
export interface PlayedNote {
  start: number;
  end: number;
  pitch: number;
  volume: number;
  instrument: string;
  track: number;
}

export interface OfflineSound {
  mono: Float32Array;
  rate: number;
  /** Every note as written, whether or not a voice was left to play it. */
  notes: PlayedNote[];
  /** Where a block starts again or another one starts, in seconds. */
  marks: number[];
  /** How long the sound is as written, which a render cut short does not reach. */
  writtenSeconds: number;
  /** Frames the synth answered with no number, rendered as silence. */
  broken: number;
  /** Tracks whose patterns play more notes at once than the voices they get. */
  short: { track: number; needs: number; given: number }[];
}

const BLOCK = 128;

function notesOf(song: Song, patterns: ReadonlyMap<string, Pattern>): [PlayedNote[], number[]] {
  const beat = 60 / song.bpm;
  const notes: PlayedNote[] = [];
  const marks = new Set<number>();
  for (const block of song.blocks) {
    const pattern = patterns.get(block.pattern);
    if (!pattern) {
      continue;
    }
    const step = beat / pattern.stepsPerBeat;
    for (let turn = 0; turn < block.repeat; turn += 1) {
      const from = block.start * BEATS_PER_BAR * beat + turn * pattern.steps * step;
      marks.add(from);
      for (const note of pattern.notes) {
        if (note.step >= pattern.steps) {
          continue;
        }
        notes.push({
          start: from + note.step * step,
          end: from + (note.step + note.length) * step,
          pitch: note.pitch,
          volume: note.volume,
          instrument: note.instrument,
          track: block.track,
        });
      }
    }
  }
  marks.delete(0);
  return [notes.sort((a, b) => a.start - b.start), [...marks].sort((a, b) => a - b)];
}

/**
 * Plays a music once, or a sheet of notes as a sound effect, without an audio device: the same
 * sequencer and synth the console plays with, every track of the music at its own place.
 */
export function renderOffline(
  library: SoundLibrary,
  play: { song: Song } | { sheet: NoteSheet },
  { rate = 48000, maxSeconds = 30 }: { rate?: number; maxSeconds?: number } = {},
): OfflineSound {
  const synth = new SynthCore(rate);
  for (const [id, data] of library.samples) {
    synth.samples.set(id, decodeSample(data));
  }
  const sequencer = new Sequencer(synth, rate);
  sequencer.setLibrary(library.instruments, library.patterns);

  let notes: PlayedNote[];
  let marks: number[] = [];
  let writtenSeconds: number;
  let short: OfflineSound['short'] = [];
  if ('song' in play) {
    const { song } = play;
    [notes, marks] = notesOf(song, library.patterns);
    writtenSeconds = songEnd(song, library.patterns) * BEATS_PER_BAR * (60 / song.bpm);
    const plan = voicePlan(song, library.patterns, library.instruments);
    short = plan.needs.flatMap((needs, track) => {
      const given = (plan.tracks[track]?.length ?? 0) + plan.free.length;
      return needs > given ? [{ track, needs, given }] : [];
    });
    sequencer.playSong(song, false, 0);
  } else {
    const { sheet } = play;
    const step = 60 / sheet.bpm / sheet.stepsPerBeat;
    notes = sheet.notes.map((note) => ({
      start: note.step * step,
      end: (note.step + note.length) * step,
      pitch: note.pitch,
      volume: note.volume,
      instrument: note.instrument,
      track: 0,
    }));
    writtenSeconds = sheet.steps * step;
    sequencer.playSfx(sheet, 0, 1);
  }

  const release = Math.max(
    0.1,
    ...[...library.instruments.values()].map((instrument) => instrument.env.release),
  );
  const limit = Math.round(Math.min(maxSeconds, writtenSeconds + release + 0.15) * rate);
  const mono = new Float32Array(limit);
  const left = new Float32Array(BLOCK);
  const right = new Float32Array(BLOCK);
  let at = 0;
  let broken = 0;
  while (at < limit) {
    const frames = Math.min(BLOCK, limit - at);
    sequencer.advance(frames);
    synth.render(left, right, frames);
    for (let i = 0; i < frames; i += 1) {
      const value = ((left[i] ?? 0) + (right[i] ?? 0)) / 2;
      if (Number.isFinite(value)) {
        mono[at + i] = value;
      } else {
        broken += 1;
      }
    }
    at += frames;
    if (at / rate > writtenSeconds && synth.voices.every((voice) => !voice.active)) {
      break;
    }
  }
  return { mono: mono.subarray(0, at), rate, notes, marks, writtenSeconds, broken, short };
}
