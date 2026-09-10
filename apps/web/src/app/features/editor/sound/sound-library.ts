import { type Signal, signal } from '@angular/core';
import {
  defaultInstrument,
  defaultPattern,
  defaultSong,
  type Game,
  type Instrument,
  LOCAL_ORIGIN,
  type Note,
  type Pattern,
  SFX_SLOTS,
  type Song,
  SONG_SLOTS,
} from '@naucto/engine';

import { ACCENT_SLOTS } from '../accent-slots';

const NAMES = ['lead', 'bass', 'drum', 'pad', 'clap', 'arp', 'pluck', 'kick', 'snare', 'bell'];

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
  /** sfx slot ("0".."15") → pattern id */
  readonly sfx: Signal<Map<string, string>> = this.sfxSig.asReadonly();
  /** music slot → the chain of patterns it plays */
  readonly songs: Signal<Map<string, Song>> = this.songsSig.asReadonly();
  /** sample id → base64 PCM */
  readonly samples: Signal<Map<string, string>> = this.samplesSig.asReadonly();

  constructor(private readonly game: Game) {
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
    for (const u of this.unsub) u();
  }

  // ---- instruments ----------------------------------------------------------

  addInstrument(): Instrument {
    const used = new Set([...this.instruments().values()].map((i) => i.name));
    const name = NAMES.find((n) => !used.has(n)) ?? `inst ${String(this.instruments().size + 1)}`;
    const inst = defaultInstrument(uid(), name);
    inst.colour = ACCENT_SLOTS[this.instruments().size % ACCENT_SLOTS.length] ?? ACCENT_SLOTS[0];
    this.game.transact(() => {
      this.game.setInstrument(inst);
    });
    return inst;
  }

  duplicateInstrument(id: string): Instrument | null {
    const src = this.instruments().get(id);
    if (!src) return null;
    const copy: Instrument = { ...src, id: uid(), name: `${src.name} 2` };
    this.game.transact(() => {
      this.game.setInstrument(copy);
    });
    return copy;
  }

  updateInstrument(id: string, patch: Partial<Instrument>): void {
    const src = this.instruments().get(id);
    if (!src) return;
    this.game.transact(() => {
      this.game.setInstrument({ ...src, ...patch, id });
    });
  }

  /** Removes the instrument and every note that used it. */
  removeInstrument(id: string): void {
    this.game.transact(() => {
      this.game.instruments.delete(id);
      for (const p of this.patterns().values())
        if (p.notes.some((n) => n.instrument === id))
          this.game.setPattern({ ...p, notes: p.notes.filter((n) => n.instrument !== id) });
    });
  }

  // ---- patterns -------------------------------------------------------------

  /** The lowest number nothing is using, so a deleted pattern's number comes back into service. */
  private freeSlot(): number {
    const taken = new Set([...this.patterns().values()].map((p) => p.slot));
    let n = 0;
    while (taken.has(n)) n += 1;
    return n;
  }

  addPattern(): Pattern {
    const slot = this.freeSlot();
    const p = defaultPattern(uid(), slot, `pattern ${String(slot).padStart(2, '0')}`);
    this.game.transact(() => {
      this.game.setPattern(p);
    });
    return p;
  }

  /**
   * Gives a number to any pattern that has none, in the order the map hands them over.
   *
   * Arbitrary, and stable from then on, which is all a number has to be. One transaction, so a
   * collaborator sees the numbering as a single change rather than one per pattern.
   */
  numberExistingPatterns(): void {
    const missing = [...this.patterns().values()].filter((p) => typeof p.slot !== 'number');
    if (missing.length === 0) return;
    const taken = new Set(
      [...this.patterns().values()].map((p) => p.slot).filter((n) => typeof n === 'number'),
    );
    this.game.transact(() => {
      let next = 0;
      for (const p of missing) {
        while (taken.has(next)) next += 1;
        taken.add(next);
        this.game.setPattern({ ...p, slot: next });
      }
    });
  }

  updatePattern(id: string, patch: Partial<Pattern>): void {
    const src = this.patterns().get(id);
    if (!src) return;
    this.game.transact(() => {
      this.game.setPattern({ ...src, ...patch, id });
    });
  }

  setNotes(id: string, notes: Note[]): void {
    this.updatePattern(id, { notes });
  }

  removePattern(id: string): void {
    this.game.transact(() => {
      this.game.patterns.delete(id);
      for (const [slot, pid] of this.sfx()) if (pid === id) this.game.sfx.delete(slot);
    });
  }

  // ---- sfx ------------------------------------------------------------------

  /** Store or drop a PCM blob. Sample bytes live outside the instrument so a duplicate shares them. */
  setSample(id: string, pcm: string | null): void {
    this.game.transact(() => {
      if (pcm === null) this.game.samples.delete(id);
      else this.game.samples.set(id, pcm);
    });
  }

  assignSfx(slot: number, patternId: string | null): void {
    if (slot < 0 || slot >= SFX_SLOTS) return;
    this.game.transact(() => {
      if (patternId) this.game.sfx.set(String(slot), patternId);
      else this.game.sfx.delete(String(slot));
    });
  }

  // ---- songs ----------------------------------------------------------------

  /**
   * A music is a chain of patterns. Each link keeps its own tempo and its own length, so a chain
   * can change speed halfway.
   */
  setSongSequence(slot: number, sequence: string[]): void {
    if (slot < 0 || slot >= SONG_SLOTS) return;
    const current = this.songs().get(String(slot)) ?? defaultSong();
    this.game.transact(() => {
      this.game.setSong(slot, { ...current, sequence });
    });
  }

  removeSong(slot: number): void {
    this.game.transact(() => {
      this.game.songs.delete(String(slot));
    });
  }

  /** Patterns and sfx slots that use an instrument. */
  usedBy(id: string): { patterns: Pattern[]; sfx: number[] } {
    const patterns = [...this.patterns().values()].filter((p) =>
      p.notes.some((n) => n.instrument === id),
    );
    const ids = new Set(patterns.map((p) => p.id));
    const sfx = [...this.sfx()].filter(([, pid]) => ids.has(pid)).map(([s]) => Number(s));
    return { patterns, sfx };
  }
}

export const SOUND_ORIGIN = LOCAL_ORIGIN;

function uid(): string {
  return crypto.randomUUID().slice(0, 8);
}
