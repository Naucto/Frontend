import { type Signal, signal } from '@angular/core';
import {
  defaultInstrument,
  defaultPattern,
  defaultSong,
  type EditableGame,
  type Instrument,
  type InstrumentPreset,
  type Pattern,
  type Song,
  SONG_SLOTS,
} from '@naucto/engine';

import { ACCENT_SLOTS } from '../accent-slots';

const NAMES = ['lead', 'bass', 'drum', 'pad', 'clap', 'arp', 'pluck', 'kick', 'snare', 'bell'];
export const INSTRUMENT_NAME_MAX = 16;

/** Reactive view of the game's sound library (instruments, patterns, sfx slots) with edit helpers. */
export class SoundLibrary {
  private readonly instrumentsSig = signal<Map<string, Instrument>>(new Map());
  private readonly patternsSig = signal<Map<string, Pattern>>(new Map());
  private readonly sfxSig = signal<Map<string, string>>(new Map());
  private readonly songsSig = signal<Map<string, Song>>(new Map());
  private readonly samplesSig = signal<Map<string, string>>(new Map());
  private readonly unsub: (() => void)[] = [];

  readonly instruments: Signal<Map<string, Instrument>> = this.instrumentsSig.asReadonly();
  readonly patterns: Signal<Map<string, Pattern>> = this.patternsSig.asReadonly();
  /** sfx slot → pattern id */
  readonly sfx: Signal<Map<string, string>> = this.sfxSig.asReadonly();
  /** music slot → the chain of patterns it plays */
  readonly songs: Signal<Map<string, Song>> = this.songsSig.asReadonly();
  /** sample id → base64 PCM */
  readonly samples: Signal<Map<string, string>> = this.samplesSig.asReadonly();

  constructor(private readonly game: EditableGame) {
    const refreshInstruments = (): void => {
      this.instrumentsSig.set(game.getInstruments());
    };
    const refreshPatterns = (): void => {
      this.patternsSig.set(game.getPatterns());
    };
    const refreshSfx = (): void => {
      this.sfxSig.set(game.getSfxSlots());
    };
    const refreshSongs = (): void => {
      this.songsSig.set(game.getSongs());
    };
    const refreshSamples = (): void => {
      this.samplesSig.set(new Map(game.samples.entries()));
    };
    refreshInstruments();
    refreshPatterns();
    refreshSfx();
    refreshSongs();
    refreshSamples();
    game.instruments.observe(refreshInstruments);
    game.patterns.observe(refreshPatterns);
    game.sfx.observe(refreshSfx);
    game.songs.observe(refreshSongs);
    game.samples.observe(refreshSamples);
    this.unsub.push(
      () => {
        game.instruments.unobserve(refreshInstruments);
      },
      () => {
        game.patterns.unobserve(refreshPatterns);
      },
      () => {
        game.sfx.unobserve(refreshSfx);
      },
      () => {
        game.songs.unobserve(refreshSongs);
      },
      () => {
        game.samples.unobserve(refreshSamples);
      },
    );
  }

  destroy(): void {
    for (const unsubscribe of this.unsub) {
      unsubscribe();
    }
  }

  /**
   * A new instrument: the default sound under the next free name of the pool, or a preset's
   * sound under the preset's own name — numbered where the name is already taken, since two
   * instruments the list calls the same thing cannot be told apart in it.
   */
  addInstrument(from?: { name: string; settings: InstrumentPreset }): Instrument {
    const used = new Set([...this.instruments().values()].map((i) => i.name));
    let name: string;
    if (from) {
      const base = from.name.slice(0, INSTRUMENT_NAME_MAX);
      name = base;
      for (let count = 2; used.has(name); count++) {
        const suffix = ` ${String(count)}`;
        name = base.slice(0, INSTRUMENT_NAME_MAX - suffix.length) + suffix;
      }
    } else {
      name =
        NAMES.find((candidate) => !used.has(candidate)) ??
        `inst ${String(this.instruments().size + 1)}`;
    }
    const inst: Instrument = { ...defaultInstrument(uid(), name), ...from?.settings, id: uid() };
    inst.name = name;
    inst.colour = ACCENT_SLOTS[this.instruments().size % ACCENT_SLOTS.length] ?? ACCENT_SLOTS[0];
    this.game.transact(() => {
      this.game.setInstrument(inst);
    });
    return inst;
  }

  duplicateInstrument(id: string): Instrument | null {
    const src = this.instruments().get(id);
    if (!src) {
      return null;
    }
    const copy: Instrument = { ...src, id: uid(), name: `${src.name} 2` };
    this.game.transact(() => {
      this.game.setInstrument(copy);
    });
    return copy;
  }

  updateInstrument(id: string, patch: Partial<Instrument>): void {
    const src = this.instruments().get(id);
    if (!src) {
      return;
    }
    this.game.transact(() => {
      this.game.setInstrument({ ...src, ...patch, id });
    });
  }

  /** Removes the instrument and every note that used it. */
  removeInstrument(id: string): void {
    this.game.transact(() => {
      this.game.instruments.delete(id);
      for (const pattern of this.patterns().values()) {
        if (pattern.notes.some((note) => note.instrument === id)) {
          this.game.setPattern({
            ...pattern,
            notes: pattern.notes.filter((note) => note.instrument !== id),
          });
        }
      }
    });
  }

  // ---- patterns -------------------------------------------------------------

  /**
   * Gives every pattern a number of its own: one to those that have none, a new one to the second
   * of two that ended up sharing.
   *
   * The one that keeps the number is the one whose id sorts first — arbitrary, but the same
   * arbitrary answer on every client, which is what stops two of them from repairing the same
   * clash in opposite directions. One transaction, so a collaborator sees a single change.
   */
  reconcilePatternSlots(): void {
    const all = [...this.game.getPatterns().values()].sort((a, b) => (a.id < b.id ? -1 : 1));
    const taken = new Set<number>();
    const wrong: Pattern[] = [];
    for (const pattern of all) {
      if (typeof pattern.slot === 'number' && !taken.has(pattern.slot)) {
        taken.add(pattern.slot);
      } else {
        wrong.push(pattern);
      }
    }
    if (wrong.length === 0) {
      return;
    }
    this.game.transact(() => {
      let next = 0;
      for (const pattern of wrong) {
        while (taken.has(next)) {
          next += 1;
        }
        taken.add(next);
        this.game.setPattern({ ...pattern, slot: next });
      }
    });
  }

  /** Writes a pattern whole, whether or not the document already holds one under that id. */
  putPattern(pattern: Pattern): void {
    this.game.transact(() => {
      this.game.setPattern(pattern);
    });
  }

  updatePattern(id: string, patch: Partial<Pattern>): void {
    const src = this.patterns().get(id);
    if (!src) {
      return;
    }
    this.game.transact(() => {
      this.game.setPattern({ ...src, ...patch, id });
    });
  }

  // ---- sfx ------------------------------------------------------------------

  /**
   * Gives an instrument a PCM blob, or takes it away.
   *
   * Sample bytes live outside the instrument so a duplicate shares them, and bytes another
   * instrument still plays are never overwritten or dropped.
   */
  setInstrumentSample(id: string, pcm: string | null): void {
    const instruments = this.game.getInstruments();
    const src = instruments.get(id);
    if (!src) {
      return;
    }
    const held = src.sampleId;
    const shared =
      held !== undefined &&
      [...instruments.values()].some((i) => i.id !== id && i.sampleId === held);
    this.game.transact(() => {
      if (pcm === null) {
        if (held !== undefined && !shared) {
          this.game.samples.delete(held);
        }
        this.game.setInstrument({ ...src, sampleId: undefined });
        return;
      }
      const sampleId = held === undefined ? `${id}-pcm` : shared ? `${id}-${uid()}` : held;
      this.game.samples.set(sampleId, pcm);
      this.game.setInstrument({ ...src, sampleId, sampleRoot: src.sampleRoot ?? 60 });
    });
  }

  assignSfx(slot: number, patternId: string | null): void {
    if (slot < 0) {
      return;
    }
    this.game.transact(() => {
      if (patternId) {
        this.game.sfx.set(String(slot), patternId);
      } else {
        this.game.sfx.delete(String(slot));
      }
    });
  }

  // ---- songs ----------------------------------------------------------------

  setSongSequence(slot: number, sequence: (string | null)[]): void {
    if (slot < 0 || slot >= SONG_SLOTS) {
      return;
    }
    const current = this.songs().get(String(slot)) ?? defaultSong();
    this.game.transact(() => {
      this.game.setSong(slot, { ...current, sequence });
    });
  }

  /** Patterns and sfx slots that use an instrument. */
  usedBy(id: string): { patterns: Pattern[]; sfx: number[] } {
    const patterns = [...this.patterns().values()].filter((pattern) =>
      pattern.notes.some((note) => note.instrument === id),
    );
    const ids = new Set(patterns.map((pattern) => pattern.id));
    const sfx = [...this.sfx()].filter(([, pid]) => ids.has(pid)).map(([slot]) => Number(slot));
    return { patterns, sfx };
  }
}

function uid(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** A pattern that doesn't exist yet, named the way a stored one would be. */
export function blankPattern(slot: number): Pattern {
  return defaultPattern(uid(), slot, `pattern ${pad2(slot)}`);
}
