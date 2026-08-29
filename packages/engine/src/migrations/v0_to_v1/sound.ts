import type * as Y from 'yjs';

import { KEYS, LEGACY_KEYS } from '../../game/keys';
import {
  defaultInstrument,
  type Instrument,
  type Note,
  noteNameToMidi,
  type OscType,
  type Pattern,
  type Song,
  VOICES,
} from '../../sound/model';
import type { MigrationReport } from '../types';

interface V0Note {
  note: string;
  duration: number;
  instrument: string;
}
interface V0Music {
  bpm: number;
  length: number;
  notes: (string | V0Note | null)[][];
}

const PRESETS: Record<string, Partial<Instrument>> = {
  piano: { osc: 'triangle', env: { attack: 0.005, decay: 0.25, sustain: 0.3, release: 0.2 } },
  guitar: {
    osc: 'saw',
    env: { attack: 0.005, decay: 0.3, sustain: 0.2, release: 0.15 },
    filter: { type: 'lp', cutoff: 3000, resonance: 0.2, envAmount: 1 },
  },
  flute: {
    osc: 'sine',
    env: { attack: 0.05, decay: 0.1, sustain: 0.8, release: 0.2 },
    vibrato: { rate: 5, depth: 0.15, delay: 0.2 },
  },
  trumpet: {
    osc: 'square',
    duty: 0.5,
    env: { attack: 0.02, decay: 0.1, sustain: 0.7, release: 0.1 },
  },
  harmonica: {
    osc: 'square',
    duty: 0.25,
    env: { attack: 0.03, decay: 0.1, sustain: 0.8, release: 0.15 },
  },
  contrabass: {
    osc: 'saw',
    env: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.2 },
    filter: { type: 'lp', cutoff: 600, resonance: 0.3, envAmount: 0 },
  },
};

const toneOsc = (t: unknown): OscType => {
  switch (t) {
    case 'sine':
      return 'sine';
    case 'square':
      return 'square';
    case 'triangle':
      return 'triangle';
    case 'sawtooth':
      return 'saw';
    default:
      return 'square';
  }
};

/**
 * Best-effort: 16 v0 musics → 16 patterns + 16 song slots; built-in Tone
 * instruments → chip presets; custom AMSynth configs → osc + ADSR. Anything the
 * new model cannot hold (more than 5 simultaneous notes, exotic params) is dropped.
 */
export function migrateSound(doc: Y.Doc, report: MigrationReport): void {
  const musics = doc.getArray<string>(LEGACY_KEYS.musics);
  const custom = doc.getMap<string>(LEGACY_KEYS.customInstruments);
  const instruments = doc.getMap<string>(KEYS.instruments);
  const patterns = doc.getMap<string>(KEYS.patterns);
  const songs = doc.getMap<string>(KEYS.songs);

  const usedInstruments = new Set<string>();
  const parsed: V0Music[] = [];
  for (let i = 0; i < musics.length; i++) {
    try {
      const m = JSON.parse(musics.get(i) ?? '') as V0Music;
      parsed.push(m);
      for (const col of m.notes ?? [])
        for (const n of col ?? []) {
          const note = typeof n === 'string' ? (JSON.parse(n) as V0Note) : n;
          if (note?.instrument) usedInstruments.add(note.instrument);
        }
    } catch {
      parsed.push({ bpm: 240, length: 32, notes: [] });
    }
  }

  let colour = 0;
  const ensureInstrument = (name: string): void => {
    if (instruments.has(name)) return;
    const base = defaultInstrument(name, name);
    base.colour = [4, 11, 3, 6, 13, 7][colour++ % 6] ?? 4;
    const preset = PRESETS[name];
    if (preset) Object.assign(base, preset);
    const customJson = custom.get(name);
    if (customJson) {
      try {
        const cfg = JSON.parse(customJson) as {
          oscillator?: { type?: string };
          envelope?: Partial<Instrument['env']>;
        };
        base.osc = toneOsc(cfg.oscillator?.type);
        base.env = { ...base.env, ...cfg.envelope };
      } catch {
        report.warnings.push({
          step: 'sound',
          message: `custom instrument "${name}" could not be parsed; using defaults`,
        });
      }
    }
    instruments.set(name, JSON.stringify(base));
  };
  for (const name of usedInstruments) ensureInstrument(name);
  custom.forEach((_v, name) => {
    ensureInstrument(name);
  });

  let dropped = 0;
  parsed.forEach((m, i) => {
    const id = `p${String(i).padStart(2, '0')}`;
    const notes: Note[] = [];
    const steps = Math.max(1, Math.min(64, m.length || 32));
    (m.notes ?? []).forEach((col, step) => {
      if (!col || step >= steps) return;
      const inStep: Note[] = [];
      for (const raw of col) {
        if (!raw) continue;
        const n = typeof raw === 'string' ? (JSON.parse(raw) as V0Note) : raw;
        const pitch = noteNameToMidi(n.note);
        if (pitch === null) continue;
        inStep.push({
          step,
          pitch,
          length: Math.max(0.25, n.duration || 1),
          instrument: n.instrument || 'piano',
          volume: 1,
        });
      }
      if (inStep.length > VOICES) {
        dropped += inStep.length - VOICES;
        inStep.length = VOICES;
      }
      notes.push(...inStep);
    });
    const pattern: Pattern = {
      id,
      name: `music ${String(i).padStart(2, '0')}`,
      bpm: Math.max(20, (m.bpm || 240) / 4),
      stepsPerBeat: 4,
      steps,
      notes,
    };
    if (notes.length > 0) {
      patterns.set(id, JSON.stringify(pattern));
      const song: Song = { name: pattern.name, sequence: [id], loop: true, loopStart: 0 };
      songs.set(String(i), JSON.stringify(song));
    }
  });
  if (dropped > 0)
    report.warnings.push({
      step: 'sound',
      message: `${String(dropped)} notes exceeded the 5-voice limit and were dropped`,
    });
  report.counts.patterns = patterns.size;
  report.counts.instruments = instruments.size;

  musics.delete(0, musics.length);
  custom.clear();
  doc.getMap(LEGACY_KEYS.selectedMusic).clear();
}
