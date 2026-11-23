import { type Signal, signal } from '@angular/core';
import {
  defaultInstrument,
  defaultPattern,
  type EditableGame,
  type Instrument,
  type InstrumentPreset,
  type Note,
  type Pattern,
  patternBars,
  patternUses,
  type Sfx,
  type Song,
  stepsAfterEdit,
  stretchPattern,
  withoutPattern,
} from '@naucto/engine';

import { ACCENT_SLOTS } from '../accent-slots';

const NAMES = ['lead', 'bass', 'drum', 'pad', 'clap', 'arp', 'pluck', 'kick', 'snare', 'bell'];
export const INSTRUMENT_NAME_MAX = 16;

/** Reactive view of the game's sound library (instruments, patterns, sfx slots) with edit helpers. */
export class SoundLibrary {
  private readonly instrumentsSig = signal<Map<string, Instrument>>(new Map());
  private readonly patternsSig = signal<Map<string, Pattern>>(new Map());
  private readonly sfxSig = signal<Map<string, Sfx>>(new Map());
  private readonly songsSig = signal<Map<string, Song>>(new Map());
  private readonly samplesSig = signal<Map<string, string>>(new Map());
  private readonly unsub: (() => void)[] = [];

  readonly instruments: Signal<Map<string, Instrument>> = this.instrumentsSig.asReadonly();
  readonly patterns: Signal<Map<string, Pattern>> = this.patternsSig.asReadonly();
  /** sfx slot → its SFX */
  readonly sfx: Signal<Map<string, Sfx>> = this.sfxSig.asReadonly();
  /** music slot → its blocks on the timeline */
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
      this.sfxSig.set(game.getSfx());
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
      name = freeName(from.name, used);
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
    const used = new Set([...this.instruments().values()].map((i) => i.name));
    const copy: Instrument = { ...src, id: uid(), name: freeName(src.name, used) };
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

  /** Removes the instrument, every note that used it, and its sample unless another plays it. */
  removeInstrument(id: string): void {
    const instruments = this.game.getInstruments();
    const held = instruments.get(id)?.sampleId;
    const shared = held !== undefined && playedElsewhere(instruments, id, held);
    this.game.transact(() => {
      this.game.instruments.delete(id);
      if (held !== undefined && !shared) {
        this.game.samples.delete(held);
      }
      for (const pattern of this.patterns().values()) {
        if (pattern.notes.some((note) => note.instrument === id)) {
          this.game.setPattern({
            ...pattern,
            notes: pattern.notes.filter((note) => note.instrument !== id),
          });
        }
      }
      for (const [slot, sfx] of this.sfx()) {
        if (sfx.notes.some((note) => note.instrument === id)) {
          this.game.setSfx(Number(slot), {
            ...sfx,
            notes: sfx.notes.filter((note) => note.instrument !== id),
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

  setPatternNotes(id: string, notes: Note[]): void {
    const src = this.patterns().get(id);
    if (src) {
      this.updatePattern(id, { notes, steps: stepsAfterEdit(src, notes) });
    }
  }

  setPatternLength(id: string, steps: number, notes?: Note[]): void {
    const src = this.patterns().get(id);
    if (!src) {
      return;
    }
    const next = { ...src, steps, notes: notes ?? src.notes };
    const added = patternBars(next) - patternBars(src);
    this.game.transact(() => {
      this.game.setPattern(next);
      if (added > 0) {
        for (const [slot, song] of this.songs()) {
          const pushed = stretchPattern(song, id, added);
          if (pushed !== song) {
            this.game.setSong(Number(slot), pushed);
          }
        }
      }
    });
  }

  removePattern(id: string): void {
    this.game.transact(() => {
      this.game.patterns.delete(id);
      for (const [slot, song] of this.songs()) {
        if (patternUses(song, id) > 0) {
          this.game.setSong(Number(slot), withoutPattern(song, id));
        }
      }
    });
  }

  patternUsage(id: string): { slot: number; name: string; uses: number }[] {
    return [...this.songs()]
      .map(([slot, song]) => ({ slot: Number(slot), name: song.name, uses: patternUses(song, id) }))
      .filter((entry) => entry.uses > 0)
      .sort((a, b) => a.slot - b.slot);
  }

  nextPatternSlot(): number {
    const taken = new Set([...this.patterns().values()].map((pattern) => pattern.slot));
    let slot = 0;
    while (taken.has(slot)) {
      slot += 1;
    }
    return slot;
  }

  duplicatePattern(id: string): Pattern | null {
    const src = this.patterns().get(id);
    if (!src) {
      return null;
    }
    const slot = this.nextPatternSlot();
    const copy: Pattern = {
      ...src,
      id: uid(),
      slot,
      name: src.name,
      notes: src.notes.map((note) => ({ ...note })),
    };
    this.putPattern(copy);
    return copy;
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
    const shared = held !== undefined && playedElsewhere(instruments, id, held);
    this.game.transact(() => {
      if (pcm === null) {
        if (held !== undefined && !shared) {
          this.game.samples.delete(held);
        }
        this.game.setInstrument({ ...src, sampleId: undefined });
        return;
      }
      // The plain id may still be held by a duplicate this instrument once shared it with.
      const fresh = this.game.samples.has(`${id}-pcm`) ? `${id}-${uid()}` : `${id}-pcm`;
      const sampleId = held === undefined ? fresh : shared ? `${id}-${uid()}` : held;
      this.game.samples.set(sampleId, pcm);
      this.game.setInstrument({ ...src, sampleId, sampleRoot: src.sampleRoot ?? 60 });
    });
  }

  putSfx(slot: number, sfx: Sfx): void {
    if (slot < 0) {
      return;
    }
    this.game.transact(() => {
      this.game.setSfx(slot, sfx);
    });
  }

  removeSfx(slot: number): void {
    this.game.transact(() => {
      this.game.sfx.delete(String(slot));
    });
  }

  nextSfxSlot(): number {
    const taken = [...this.sfx().keys()].map(Number).filter(Number.isInteger);
    return taken.length ? Math.max(...taken) + 1 : 0;
  }

  // ---- songs ----------------------------------------------------------------

  putSong(slot: number, song: Song): void {
    if (slot < 0) {
      return;
    }
    this.game.transact(() => {
      this.game.setSong(slot, song);
    });
  }

  removeSong(slot: number): void {
    this.game.transact(() => {
      this.game.songs.delete(String(slot));
    });
  }

  nextSongSlot(): number {
    const taken = new Set([...this.songs().keys()].map(Number));
    let slot = 0;
    while (taken.has(slot)) {
      slot += 1;
    }
    return slot;
  }

  /** Patterns and sfx slots that use an instrument. */
  usedBy(id: string): { patterns: Pattern[]; sfx: number[] } {
    const patterns = [...this.patterns().values()].filter((pattern) =>
      pattern.notes.some((note) => note.instrument === id),
    );
    const sfx = [...this.sfx()]
      .filter(([, each]) => each.notes.some((note) => note.instrument === id))
      .map(([slot]) => Number(slot));
    return { patterns, sfx };
  }
}

/**
 * The name itself if no instrument has it yet, else the name numbered from 2, cut to leave the
 * number room under {@link INSTRUMENT_NAME_MAX}.
 */
function freeName(wanted: string, used: Set<string>): string {
  const base = wanted.slice(0, INSTRUMENT_NAME_MAX);
  let name = base;
  for (let count = 2; used.has(name); count++) {
    const suffix = ` ${String(count)}`;
    name = base.slice(0, INSTRUMENT_NAME_MAX - suffix.length) + suffix;
  }
  return name;
}

function playedElsewhere(
  instruments: Map<string, Instrument>,
  id: string,
  sampleId: string,
): boolean {
  return [...instruments.values()].some((i) => i.id !== id && i.sampleId === sampleId);
}

export function uid(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** A pattern that doesn't exist yet, named the way a stored one would be. */
export function blankPattern(slot: number): Pattern {
  return defaultPattern(uid(), slot, `pattern ${pad2(slot)}`);
}

export function patternTint(pattern: Pattern, instruments: Map<string, Instrument>): number {
  if (pattern.colour !== undefined) {
    return pattern.colour;
  }
  const counts = new Map<string, number>();
  for (const note of pattern.notes) {
    counts.set(note.instrument, (counts.get(note.instrument) ?? 0) + 1);
  }
  const main = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  const colour = main === undefined ? undefined : instruments.get(main)?.colour;

  return colour ?? ACCENT_SLOTS[pattern.slot % ACCENT_SLOTS.length] ?? ACCENT_SLOTS[0];
}

export function patternLabel(pattern: Pattern): string {
  return pattern.name.trim() || `pattern ${pad2(pattern.slot)}`;
}
