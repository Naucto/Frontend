import { computed, type Signal } from '@angular/core';
import {
  blockBars,
  blockIds,
  duplicateBlocks,
  type Pattern,
  patternBars,
  placeBlocks,
  removeBlocks,
  type Song,
  type SongBlock,
} from '@naucto/engine';

import type { SoundDeck } from '../sound-deck';

interface Copied {
  pattern: string;
  offset: number;
  repeat: number;
}

/** What the keyboard needs from the Timeline beyond the blocks themselves. */
export interface TimelineKeyHost {
  playing: Signal<boolean>;
  listPattern: Signal<Pattern | null>;
  play(): void;
}

/**
 * The blocks of the music on show: writing them, snapping to the bar division, the selection,
 * the clipboard, and the keys that act on them.
 */
export class TimelineEdits {
  private readonly store: SoundDeck['store'];
  private readonly library: SoundDeck['library'];
  private readonly head: SoundDeck['heads']['timeline'];
  private clipboard: Copied[] = [];

  readonly selected: Signal<Set<string>>;

  constructor(
    private readonly deck: SoundDeck,
    private readonly song: Signal<Song>,
  ) {
    this.store = deck.store;
    this.library = deck.library;
    this.head = deck.heads.timeline;
    this.selected = computed(() => new Set(this.store.selectedBlocks()));
  }

  write(change: (song: Song) => Song): void {
    const before = this.song();
    const after = change(before);
    if (after !== before) {
      this.library.putSong(this.store.songSlot(), after);
    }
  }

  snap(bars: number): number {
    const div = this.store.barDivision();
    return Math.round(bars * div) / div;
  }

  snapDown(bars: number): number {
    const div = this.store.barDivision();
    return Math.floor(bars * div + 1e-6) / div;
  }

  insert(patternId: string, at: number, moveHead: boolean): void {
    const pattern = this.library.patterns().get(patternId);
    if (!pattern) {
      return;
    }
    const block: SongBlock = {
      id: blockIds(this.song())(),
      pattern: patternId,
      start: Math.max(0, at),
      repeat: 1,
    };
    this.write((song) => placeBlocks(song, [block], this.library.patterns()));
    this.store.selectBlocks([block.id]);
    if (moveHead) {
      this.head.set(block.start + patternBars(pattern));
    }
  }

  deleteSelected(): void {
    const ids = this.selected();
    if (!ids.size) {
      return;
    }
    this.write((song) => removeBlocks(song, ids));
    this.store.selectBlocks([]);
  }

  duplicateSelected(): void {
    const ids = this.selected();
    if (!ids.size) {
      return;
    }
    let created: SongBlock[] = [];
    this.write((song) => {
      const out = duplicateBlocks(song, ids, this.library.patterns(), blockIds(song));
      created = out.created;
      return out.song;
    });
    this.store.selectBlocks(created.map((block) => block.id));
  }

  private copySelected(): void {
    const chosen = this.song().blocks.filter((block) => this.selected().has(block.id));
    if (!chosen.length) {
      return;
    }
    const first = Math.min(...chosen.map((block) => block.start));
    this.clipboard = chosen.map((block) => ({
      pattern: block.pattern,
      offset: block.start - first,
      repeat: block.repeat,
    }));
  }

  private paste(): void {
    const patterns = this.library.patterns();
    const at = this.snapDown(this.head());
    const nextId = blockIds(this.song());
    const made: SongBlock[] = this.clipboard
      .filter((item) => patterns.has(item.pattern))
      .map((item) => ({
        id: nextId(),
        pattern: item.pattern,
        start: at + item.offset,
        repeat: item.repeat,
      }));
    if (!made.length) {
      return;
    }
    this.write((song) => placeBlocks(song, made, patterns));
    this.store.selectBlocks(made.map((block) => block.id));
    this.head.set(Math.max(...made.map((block) => block.start + blockBars(block, patterns))));
  }

  onKey(event: KeyboardEvent, host: TimelineKeyHost): void {
    const target = event.target as HTMLElement | null;
    if (target?.tagName === 'INPUT') {
      return;
    }
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const writes = this.deck.mode.canWrite();
    if (key === ' ' && !target?.closest('button')) {
      event.preventDefault();
      if (host.playing()) {
        this.deck.pause();
      } else {
        host.play();
      }
    } else if ((key === 'delete' || key === 'backspace') && writes && this.selected().size) {
      event.preventDefault();
      this.deleteSelected();
    } else if (mod && key === 'd' && writes) {
      event.preventDefault();
      this.duplicateSelected();
    } else if (mod && key === 'c') {
      this.copySelected();
    } else if (mod && key === 'v' && writes && this.clipboard.length) {
      event.preventDefault();
      this.paste();
    } else if (key === 'enter' && writes && !target?.closest('button')) {
      const pattern = host.listPattern();
      if (pattern) {
        event.preventDefault();
        this.insert(pattern.id, this.snapDown(this.head()), true);
      }
    } else if (key === 'escape' && this.selected().size) {
      this.store.selectBlocks([]);
    }
  }
}
