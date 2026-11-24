import { type Signal, signal } from '@angular/core';
import {
  moveBlocks,
  type Pattern,
  patternBars,
  removeBlocks,
  setBlockRepeat,
  type Song,
  type SongBlock,
} from '@naucto/engine';

import type { SoundDeck } from '../sound-deck';
import type { TimelineEdits } from './timeline-edits';

const LEAVE_LANE = 48;
const MAX_REPEAT = 64;

export type Gesture =
  | {
      kind: 'move';
      startX: number;
      startY: number;
      x: number;
      y: number;
      ids: Set<string>;
      delta: number;
      /** Tracks moved down, negative up. */
      rows: number;
      out: boolean;
    }
  | { kind: 'grow'; id: string; startX: number; from: number; repeat: number }
  | {
      kind: 'place';
      pattern: string;
      x: number;
      y: number;
      /** The bar and the track it would land on, or null off the tracks. */
      over: number | null;
      track: number;
    }
  | { kind: 'seek' }
  | { kind: 'loop'; edge: 'start' | 'end'; at: number };

/** What a drag on the Timeline reads from the component that draws it. */
export interface TimelineGestureHost {
  song: Signal<Song>;
  barWidth: Signal<number>;
  playing: Signal<boolean>;
  end: Signal<number>;
  loopStart: Signal<number>;
  loopEnd: Signal<number>;
  /** The tracks' lanes as one box, a track every `rowHeight` pixels from its top. */
  lane(): HTMLElement | undefined;
  rowHeight: number;
  ruler(): HTMLElement | undefined;
  takeFocus(): void;
}

/**
 * The drags of the Timeline: moving, stretching and dropping blocks, dragging a pattern in from
 * the list, the playhead and the loop edges. The gesture in progress is a signal so the blocks
 * and the loop are drawn where the pointer is before anything is written.
 */
export class TimelineGestures {
  readonly gesture = signal<Gesture | null>(null);

  constructor(
    private readonly deck: SoundDeck,
    private readonly edits: TimelineEdits,
    private readonly host: TimelineGestureHost,
  ) {}

  private get store(): SoundDeck['store'] {
    return this.deck.store;
  }

  private get head(): SoundDeck['heads']['timeline'] {
    return this.deck.heads.timeline;
  }

  /** The track under a point of the screen, held to the tracks there are. */
  private trackAt(clientY: number): number {
    const top = this.host.lane()?.getBoundingClientRect().top ?? 0;
    const row = Math.floor((clientY - top) / this.host.rowHeight);
    return Math.max(0, Math.min(this.host.song().tracks.length - 1, row));
  }

  private barAt(clientX: number, element: HTMLElement | undefined): number {
    const rect = element?.getBoundingClientRect();
    return rect ? Math.max(0, (clientX - rect.left) / this.host.barWidth()) : 0;
  }

  onBlockDown(event: PointerEvent, block: SongBlock): void {
    if (event.button !== 0) {
      return;
    }
    this.host.takeFocus();
    event.stopPropagation();
    event.preventDefault();
    const current = this.store.selectedBlocks();
    let ids: string[];
    if (event.shiftKey) {
      ids = current.includes(block.id)
        ? current.filter((id) => id !== block.id)
        : [...current, block.id];
    } else {
      ids = current.includes(block.id) ? current : [block.id];
    }
    this.store.selectBlocks(ids);
    const pattern = this.deck.library.patterns().get(block.pattern);
    if (pattern) {
      this.store.selectPattern(pattern.slot);
    }
    if (!ids.includes(block.id) || !this.deck.mode.canWrite()) {
      return;
    }
    this.start({
      kind: 'move',
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      ids: new Set(ids),
      delta: 0,
      rows: 0,
      out: false,
    });
  }

  onGrowDown(event: PointerEvent, block: SongBlock): void {
    if (event.button !== 0 || !this.deck.mode.canWrite()) {
      return;
    }
    this.host.takeFocus();
    event.stopPropagation();
    event.preventDefault();
    this.store.selectBlocks([block.id]);
    this.start({
      kind: 'grow',
      id: block.id,
      startX: event.clientX,
      from: block.repeat,
      repeat: block.repeat,
    });
  }

  onLaneDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    this.host.takeFocus();
    this.store.selectBlocks([]);
    this.head.set(this.edits.snapDown(this.barAt(event.clientX, this.host.lane())));
  }

  onRulerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    if (this.host.playing()) {
      this.deck.pause();
    }
    this.head.set(this.edits.snap(this.barAt(event.clientX, this.host.ruler())));
    this.start({ kind: 'seek' });
  }

  onLoopDown(event: PointerEvent, edge: 'start' | 'end'): void {
    if (event.button !== 0 || !this.deck.mode.canWrite()) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    this.start({
      kind: 'loop',
      edge,
      at: edge === 'start' ? this.host.loopStart() : this.host.loopEnd(),
    });
  }

  onListDown(event: PointerEvent, pattern: Pattern): void {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) {
      return;
    }
    event.preventDefault();
    this.store.selectPattern(pattern.slot);
    if (!this.deck.mode.canWrite()) {
      return;
    }
    this.start({
      kind: 'place',
      pattern: pattern.id,
      x: event.clientX,
      y: event.clientY,
      over: null,
      track: 0,
    });
  }

  private readonly onMove = (event: PointerEvent): void => {
    const gesture = this.gesture();
    const lane = this.host.lane();
    switch (gesture?.kind) {
      case 'move': {
        const delta = this.edits.snap((event.clientX - gesture.startX) / this.host.barWidth());
        const rect = lane?.getBoundingClientRect();
        const out =
          !!rect &&
          (event.clientY < rect.top - LEAVE_LANE || event.clientY > rect.bottom + LEAVE_LANE);
        const rows = this.trackAt(event.clientY) - this.trackAt(gesture.startY);
        this.gesture.set({ ...gesture, x: event.clientX, y: event.clientY, delta, rows, out });
        return;
      }
      case 'grow': {
        const block = this.host.song().blocks.find((each) => each.id === gesture.id);
        const pattern = block ? this.deck.library.patterns().get(block.pattern) : undefined;
        if (!block || !pattern) {
          return;
        }
        const span = patternBars(pattern) * this.host.barWidth();
        const grown = gesture.from + Math.round((event.clientX - gesture.startX) / span);
        this.gesture.set({ ...gesture, repeat: Math.max(1, Math.min(MAX_REPEAT, grown)) });
        return;
      }
      case 'place': {
        const rect = lane?.getBoundingClientRect();
        const over =
          rect && event.clientY >= rect.top && event.clientY <= rect.bottom
            ? this.edits.snapDown(this.barAt(event.clientX, lane))
            : null;
        const track = this.trackAt(event.clientY);
        this.gesture.set({ ...gesture, x: event.clientX, y: event.clientY, over, track });
        return;
      }
      case 'seek':
        this.head.set(this.edits.snap(this.barAt(event.clientX, this.host.ruler())));
        return;
      case 'loop': {
        const at = this.edits.snap(this.barAt(event.clientX, this.host.ruler()));
        const step = 1 / this.store.barDivision();
        this.gesture.set({
          ...gesture,
          at:
            gesture.edge === 'start'
              ? Math.min(at, this.host.loopEnd() - step)
              : Math.max(at, this.host.loopStart() + step),
        });
        return;
      }
      default:
        return;
    }
  };

  private readonly onUp = (): void => {
    const gesture = this.gesture();
    this.gesture.set(null);
    this.stop();
    const patterns = this.deck.library.patterns();
    switch (gesture?.kind) {
      case 'move':
        if (gesture.out) {
          this.edits.write((song) => removeBlocks(song, gesture.ids));
          this.store.selectBlocks([]);
        } else if (gesture.delta !== 0 || gesture.rows !== 0) {
          this.edits.write((song) =>
            moveBlocks(song, gesture.ids, gesture.delta, patterns, gesture.rows),
          );
        }
        return;
      case 'grow':
        if (gesture.repeat !== gesture.from) {
          this.edits.write((song) => setBlockRepeat(song, gesture.id, gesture.repeat, patterns));
        }
        return;
      case 'place':
        if (gesture.over !== null) {
          this.edits.insert(gesture.pattern, gesture.over, false, gesture.track);
        }
        return;
      case 'loop': {
        const at = Math.max(0, gesture.at);
        if (gesture.edge === 'start') {
          this.edits.write((song) => ({ ...song, loopStart: at }));
        } else {
          this.edits.write((song) => {
            const next = { ...song };
            if (at >= this.host.end()) {
              delete next.loopEnd;
            } else {
              next.loopEnd = at;
            }
            return next;
          });
        }
        return;
      }
      default:
        return;
    }
  };

  private start(gesture: Gesture): void {
    this.gesture.set(gesture);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  }

  stop(): void {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
  }
}
