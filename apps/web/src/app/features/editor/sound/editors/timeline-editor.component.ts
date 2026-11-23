import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  blockBars,
  blockIds,
  defaultSong,
  duplicateBlocks,
  moveBlocks,
  type Pattern,
  patternBars,
  placeBlocks,
  removeBlocks,
  setBlockRepeat,
  type Song,
  type SongBlock,
  songEnd,
  songLoopEnd,
} from '@naucto/engine';
import {
  ButtonDirective,
  EdgeHandleComponent,
  focus,
  IconComponent,
  NumberFieldComponent,
  type PresenceColour,
  PresenceDotsComponent,
  PresenceLayerComponent,
  type PresenceMark,
  type PresenceViewport,
  ToggleButtonComponent,
  TransportComponent,
} from '@naucto/ui';

import { MetronomeButtonComponent } from '../controls/metronome-button.component';
import { SoundHelpComponent } from '../controls/sound-help.component';
import { type PickerItem, SoundPickerComponent } from '../controls/sound-picker.component';
import { SoundZoomComponent } from '../controls/sound-zoom.component';
import { OscilloscopeComponent } from '../oscilloscope.component';
import { BAR_DIVISIONS, MAX_BAR_ZOOM, MIN_BAR_ZOOM } from '../sound.store';
import { SoundDeck } from '../sound-deck';
import { pad2, patternLabel, patternTint } from '../sound-library';
import { SoundPeersComponent } from '../sound-peers.component';
import { BPM_MAX, BPM_MIN } from './note-sheet-editor.component';

const BAR_WIDTH = 56;
const MIN_BARS = 16;
const SPARE_BARS = 8;
const LEAVE_LANE = 48;
const MAX_REPEAT = 64;
const HEAD_W = 96;
const SURFACE = 'sound:timeline';
const PEER_OUTLINE: Record<PresenceColour, string> = {
  sky: 'border-presence-sky',
  blush: 'border-presence-blush',
  jade: 'border-presence-jade',
};

interface Mini {
  viewBox: string;
  path: string;
}

type Gesture =
  | { kind: 'move'; startX: number; startY: number; ids: Set<string>; delta: number; out: boolean }
  | { kind: 'grow'; id: string; startX: number; from: number; repeat: number }
  | { kind: 'place'; pattern: string; x: number; y: number; over: number | null }
  | { kind: 'seek' }
  | { kind: 'loop'; edge: 'start' | 'end'; at: number };

@Component({
  selector: 'nc-timeline-editor',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    EdgeHandleComponent,
    IconComponent,
    NumberFieldComponent,
    ToggleButtonComponent,
    TransportComponent,
    OscilloscopeComponent,
    PresenceDotsComponent,
    PresenceLayerComponent,
    SoundPeersComponent,
    SoundHelpComponent,
    MetronomeButtonComponent,
    SoundPickerComponent,
    SoundZoomComponent,
  ],
  templateUrl: './timeline-editor.component.html',
  host: { class: 'relative flex h-full min-h-0', '(keydown)': 'onKey($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimelineEditorComponent {
  protected readonly deck = inject(SoundDeck);
  protected readonly store = this.deck.store;
  private readonly library = this.deck.library;
  private readonly lane = viewChild<ElementRef<HTMLElement>>('lane');
  private readonly ruler = viewChild<ElementRef<HTMLElement>>('ruler');
  private readonly content = viewChild<ElementRef<HTMLElement>>('content');
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  protected readonly HEAD_W = HEAD_W;
  protected readonly viewport = signal<PresenceViewport>({ x: 0, y: 0, w: 0, h: 0 });
  private pointer: { x: number; y: number } | null = null;
  protected readonly pad = pad2;
  protected readonly label = patternLabel;
  protected readonly BPM_MIN = BPM_MIN;
  protected readonly BPM_MAX = BPM_MAX;

  protected readonly gesture = signal<Gesture | null>(null);
  private clipboard: { pattern: string; offset: number; repeat: number }[] = [];

  protected readonly folded = computed(() => this.store.folded().includes('timeline'));
  protected readonly barWidth = computed(() => Math.round(BAR_WIDTH * this.store.barZoom()));
  protected readonly songs = computed(() =>
    [...this.library.songs()]
      .map(([slot, song]) => ({ slot: Number(slot), song }))
      .filter((entry) => Number.isInteger(entry.slot))
      .sort((a, b) => a.slot - b.slot),
  );
  protected readonly stored = computed(() =>
    this.library.songs().has(String(this.store.songSlot())),
  );
  protected readonly song = computed<Song>(
    () => this.library.songs().get(String(this.store.songSlot())) ?? defaultSong(),
  );
  protected readonly patterns = computed(() =>
    [...this.library.patterns().values()].sort((a, b) => a.slot - b.slot),
  );
  protected readonly end = computed(() => songEnd(this.song(), this.library.patterns()));
  protected readonly loopEnd = computed(() => {
    const gesture = this.gesture();
    if (gesture?.kind === 'loop' && gesture.edge === 'end') {
      return gesture.at;
    }
    return songLoopEnd(this.song(), this.library.patterns());
  });
  protected readonly loopStart = computed(() => {
    const gesture = this.gesture();
    return gesture?.kind === 'loop' && gesture.edge === 'start'
      ? gesture.at
      : this.song().loopStart;
  });
  protected readonly bars = computed(() => Math.max(MIN_BARS, Math.ceil(this.end()) + SPARE_BARS));
  protected readonly barNumbers = computed(() =>
    Array.from({ length: this.bars() }, (_, i) => i).filter(
      (i) => this.barWidth() >= 40 || i % 2 === 0,
    ),
  );
  protected readonly playing = computed(() => this.deck.playing() === 'timeline');
  protected readonly head = this.deck.heads.timeline;
  protected readonly selected = computed(() => new Set(this.store.selectedBlocks()));
  protected readonly MIN_BAR_ZOOM = MIN_BAR_ZOOM;
  protected readonly MAX_BAR_ZOOM = MAX_BAR_ZOOM;
  protected readonly songItems = computed<PickerItem[]>(() => {
    const items = this.songs().map((entry) => this.songItemAt(entry.slot));
    return items.some((item) => item.key === String(this.store.songSlot()))
      ? items
      : [...items, this.songItemAt(this.store.songSlot())];
  });
  protected readonly songItem = computed(() => this.songItemAt(this.store.songSlot()));
  protected readonly listPattern = computed(() => {
    const slot = this.store.patternSlot();
    return this.patterns().find((pattern) => pattern.slot === slot) ?? null;
  });

  private readonly peersHere = computed(() =>
    this.deck.presence
      .collaborators()
      .filter(
        (collaborator) =>
          !collaborator.isSelf &&
          collaborator.cursor?.tab === SURFACE &&
          collaborator.cursor.scope === String(this.store.songSlot()),
      ),
  );
  protected readonly peerMarks = computed<PresenceMark[]>(() =>
    this.peersHere().map((collaborator) => ({
      id: collaborator.clientId,
      name: collaborator.name,
      colour: collaborator.colour,
      x: HEAD_W + (collaborator.cursor?.x ?? 0) * this.barWidth(),
      y: collaborator.cursor?.y ?? 0,
    })),
  );
  protected readonly peerBlocks = computed(() => {
    const out = new Map<string, string>();
    const scope = String(this.store.songSlot());
    for (const collaborator of this.deck.presence.collaborators()) {
      const selection = collaborator.selection;
      if (collaborator.isSelf || selection?.tab !== SURFACE || selection.scope !== scope) {
        continue;
      }
      for (const id of selection.items) {
        out.set(id, PEER_OUTLINE[collaborator.colour]);
      }
    }
    return out;
  });

  protected readonly minis = computed(() => {
    const out = new Map<string, Mini>();
    for (const pattern of this.library.patterns().values()) {
      const notes = pattern.notes.filter((note) => note.step < pattern.steps);
      if (!notes.length) {
        continue;
      }
      let low = Math.min(...notes.map((note) => note.pitch));
      let high = Math.max(...notes.map((note) => note.pitch));
      if (high - low < 8) {
        low -= 4;
        high += 4;
      }
      out.set(pattern.id, {
        viewBox: `0 0 ${String(pattern.steps)} ${String(high - low + 1)}`,
        path: notes
          .map((note) => {
            const width = Math.max(0.6, Math.min(note.length, pattern.steps - note.step) - 0.25);
            return `M${String(note.step)} ${String(high - note.pitch)}h${String(width)}v1h${String(-width)}z`;
          })
          .join(''),
      });
    }
    return out;
  });

  protected readonly blocks = computed(() => {
    const patterns = this.library.patterns();
    const instruments = this.library.instruments();
    const palette = this.deck.palette();
    const width = this.barWidth();
    const gesture = this.gesture();
    return this.song().blocks.flatMap((block) => {
      const pattern = patterns.get(block.pattern);
      if (!pattern) {
        return [];
      }
      let start = block.start;
      let repeat = block.repeat;
      let leaving = false;
      if (gesture?.kind === 'move' && gesture.ids.has(block.id)) {
        start = Math.max(0, start + gesture.delta);
        leaving = gesture.out;
      }
      if (gesture?.kind === 'grow' && gesture.id === block.id) {
        repeat = gesture.repeat;
      }
      const length = patternBars(pattern);
      return [
        {
          block,
          pattern,
          left: start * width + 2,
          width: length * repeat * width - 4,
          repWidth: length * width,
          reps: Array.from({ length: repeat }, (_, i) => i),
          colour: palette[patternTint(pattern, instruments)] ?? '',
          leaving,
        },
      ];
    });
  });

  constructor() {
    effect(() => {
      const items = this.store.selectedBlocks();
      const scope = String(this.store.songSlot());
      untracked(() => {
        this.deck.presence.setSelection({ tab: SURFACE, scope, items });
      });
    });
    effect(() => {
      const song = this.song();
      untracked(() => {
        this.deck.refreshSong(song);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.stopListening();
      this.deck.presence.setSelection(null);
    });
  }

  protected tint(pattern: Pattern): string {
    return this.deck.palette()[patternTint(pattern, this.library.instruments())] ?? '';
  }

  private songItemAt(slot: number): PickerItem {
    const song = this.library.songs().get(String(slot));
    return {
      key: String(slot),
      number: pad2(slot),
      name: song
        ? this.songName(slot, song)
        : this.deck.transloco.translate('editor.sound.emptySlot'),
      free: !song,
      canDuplicate: !!song,
      canRemove: !!song,
    };
  }

  protected songName(slot: number, song: Song): string {
    return (
      song.name.trim() || this.deck.transloco.translate('editor.sound.musicN', { n: pad2(slot) })
    );
  }

  private snap(bars: number): number {
    const div = this.store.barDivision();
    return Math.round(bars * div) / div;
  }

  private snapDown(bars: number): number {
    const div = this.store.barDivision();
    return Math.floor(bars * div + 1e-6) / div;
  }

  private write(change: (song: Song) => Song): void {
    const slot = this.store.songSlot();
    const before = this.song();
    const after = change(before);
    if (after !== before) {
      this.library.putSong(slot, after);
    }
  }

  protected cycleDivision(): void {
    const i = BAR_DIVISIONS.indexOf(this.store.barDivision());
    this.store.setBarDivision(BAR_DIVISIONS[(i + 1) % BAR_DIVISIONS.length] ?? 1);
  }

  protected setBpm(bpm: number): void {
    this.write((song) => ({ ...song, bpm }));
  }

  protected setLoop(loop: boolean): void {
    this.write((song) => ({ ...song, loop }));
    this.deck.setLoop('timeline', loop);
  }

  protected play(): void {
    void this.deck.playSong(this.song(), this.song().loop, this.end());
  }

  // ---- songs ----------------------------------------------------------------

  protected selectSong(slot: number): void {
    if (this.playing()) {
      this.deck.stop('timeline');
    }
    this.head.set(0);
    this.store.selectSong(slot);
  }

  protected createSong(): void {
    const slot = this.library.nextSongSlot();
    this.library.putSong(slot, defaultSong(this.song().bpm));
    this.selectSong(slot);
  }

  protected pickSong(key: string): void {
    this.selectSong(Number(key));
  }

  protected duplicateSong(key: string): void {
    const song = this.library.songs().get(key);
    if (!song) {
      return;
    }
    const slot = this.library.nextSongSlot();
    this.library.putSong(slot, {
      ...song,
      name: song.name ? `${song.name} 2` : '',
      blocks: song.blocks.map((block) => ({ ...block })),
    });
    this.selectSong(slot);
  }

  protected renameSong(event: { key: string; name: string }): void {
    if (Number(event.key) === this.store.songSlot()) {
      this.write((song) => ({ ...song, name: event.name }));
    }
  }

  protected async removeSong(key: string): Promise<void> {
    const held = this.library.songs().get(key);
    if (!held) {
      return;
    }
    const slot = Number(key);
    const confirmed = await this.deck.dialogs.confirmDanger({
      title: this.deck.transloco.translate('editor.sound.removeMusicTitle', {
        name: this.songName(slot, held),
      }),
      message: this.deck.transloco.translate('editor.sound.removeMusicMessage', {
        n: held.blocks.length,
        slot,
      }),
      confirmLabel: this.deck.transloco.translate('editor.sound.removeMusic'),
    });
    if (confirmed) {
      if (this.playing() && slot === this.store.songSlot()) {
        this.deck.stop('timeline');
      }
      const name = this.songName(slot, held);
      this.deck.removeWithUndo(
        () => {
          this.library.removeSong(slot);
        },
        this.deck.transloco.translate('editor.sound.toast.musicRemoved', { name }),
      );
      this.store.selectBlocks([]);
    }
  }

  // ---- patterns list --------------------------------------------------------

  protected openPattern(pattern: Pattern): void {
    this.store.selectPattern(pattern.slot);
    this.store.setFocus('patterns');
    this.store.setLayout(focus(this.store.layout(), 'patterns'));
  }

  // ---- blocks ---------------------------------------------------------------

  private insert(patternId: string, at: number, moveHead: boolean): void {
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

  protected deleteSelected(): void {
    const ids = this.selected();
    if (!ids.size) {
      return;
    }
    this.write((song) => removeBlocks(song, ids));
    this.store.selectBlocks([]);
  }

  protected duplicateSelected(): void {
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

  protected setRepeat(delta: number): void {
    const [id] = this.store.selectedBlocks();
    const block = this.song().blocks.find((each) => each.id === id);
    if (!block || this.store.selectedBlocks().length !== 1) {
      return;
    }
    const repeat = Math.max(1, Math.min(MAX_REPEAT, block.repeat + delta));
    this.write((song) => setBlockRepeat(song, block.id, repeat, this.library.patterns()));
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

  // ---- pointer --------------------------------------------------------------

  private barAt(clientX: number, element: HTMLElement | undefined): number {
    const rect = element?.getBoundingClientRect();
    return rect ? Math.max(0, (clientX - rect.left) / this.barWidth()) : 0;
  }

  protected onBlockDown(event: PointerEvent, block: SongBlock): void {
    if (event.button !== 0) {
      return;
    }
    this.takeFocus();
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
    const pattern = this.library.patterns().get(block.pattern);
    if (pattern) {
      this.store.selectPattern(pattern.slot);
    }
    if (!ids.includes(block.id)) {
      return;
    }
    this.gesture.set({
      kind: 'move',
      startX: event.clientX,
      startY: event.clientY,
      ids: new Set(ids),
      delta: 0,
      out: false,
    });
    this.listen();
  }

  protected onGrowDown(event: PointerEvent, block: SongBlock): void {
    if (event.button !== 0) {
      return;
    }
    this.takeFocus();
    event.stopPropagation();
    event.preventDefault();
    this.store.selectBlocks([block.id]);
    this.gesture.set({
      kind: 'grow',
      id: block.id,
      startX: event.clientX,
      from: block.repeat,
      repeat: block.repeat,
    });
    this.listen();
  }

  protected onLaneDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    this.takeFocus();
    this.store.selectBlocks([]);
    this.head.set(this.snapDown(this.barAt(event.clientX, this.lane()?.nativeElement)));
  }

  protected onRulerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    if (this.playing()) {
      this.deck.pause();
    }
    this.head.set(this.snap(this.barAt(event.clientX, this.ruler()?.nativeElement)));
    this.gesture.set({ kind: 'seek' });
    this.listen();
  }

  protected onLoopDown(event: PointerEvent, edge: 'start' | 'end'): void {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    this.gesture.set({
      kind: 'loop',
      edge,
      at: edge === 'start' ? this.loopStart() : this.loopEnd(),
    });
    this.listen();
  }

  protected onListDown(event: PointerEvent, pattern: Pattern): void {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) {
      return;
    }
    event.preventDefault();
    this.store.selectPattern(pattern.slot);
    this.gesture.set({
      kind: 'place',
      pattern: pattern.id,
      x: event.clientX,
      y: event.clientY,
      over: null,
    });
    this.listen();
  }

  private readonly onMove = (event: PointerEvent): void => {
    const gesture = this.gesture();
    const lane = this.lane()?.nativeElement;
    switch (gesture?.kind) {
      case 'move': {
        const delta = this.snap((event.clientX - gesture.startX) / this.barWidth());
        const rect = lane?.getBoundingClientRect();
        const out =
          !!rect &&
          (event.clientY < rect.top - LEAVE_LANE || event.clientY > rect.bottom + LEAVE_LANE);
        this.gesture.set({ ...gesture, delta, out });
        return;
      }
      case 'grow': {
        const block = this.song().blocks.find((each) => each.id === gesture.id);
        const pattern = block ? this.library.patterns().get(block.pattern) : undefined;
        if (!block || !pattern) {
          return;
        }
        const span = patternBars(pattern) * this.barWidth();
        const grown = gesture.from + Math.round((event.clientX - gesture.startX) / span);
        this.gesture.set({ ...gesture, repeat: Math.max(1, Math.min(MAX_REPEAT, grown)) });
        return;
      }
      case 'place': {
        const rect = lane?.getBoundingClientRect();
        const over =
          rect && event.clientY >= rect.top && event.clientY <= rect.bottom
            ? this.snapDown(this.barAt(event.clientX, lane))
            : null;
        this.gesture.set({ ...gesture, x: event.clientX, y: event.clientY, over });
        return;
      }
      case 'seek':
        this.head.set(this.snap(this.barAt(event.clientX, this.ruler()?.nativeElement)));
        return;
      case 'loop': {
        const at = this.snap(this.barAt(event.clientX, this.ruler()?.nativeElement));
        this.gesture.set({
          ...gesture,
          at:
            gesture.edge === 'start'
              ? Math.min(at, this.loopEnd() - 1 / this.store.barDivision())
              : Math.max(at, this.loopStart() + 1 / this.store.barDivision()),
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
    this.stopListening();
    const patterns = this.library.patterns();
    switch (gesture?.kind) {
      case 'move':
        if (gesture.out) {
          this.write((song) => removeBlocks(song, gesture.ids));
          this.store.selectBlocks([]);
        } else if (gesture.delta !== 0) {
          this.write((song) => moveBlocks(song, gesture.ids, gesture.delta, patterns));
        }
        return;
      case 'grow':
        if (gesture.repeat !== gesture.from) {
          this.write((song) => setBlockRepeat(song, gesture.id, gesture.repeat, patterns));
        }
        return;
      case 'place':
        if (gesture.over !== null) {
          this.insert(gesture.pattern, gesture.over, false);
        }
        return;
      case 'loop': {
        const at = Math.max(0, gesture.at);
        if (gesture.edge === 'start') {
          this.write((song) => ({ ...song, loopStart: at }));
        } else {
          this.write((song) => {
            const next = { ...song };
            if (at >= this.end()) {
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

  private listen(): void {
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  }

  private stopListening(): void {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
  }

  // ---- presence -------------------------------------------------------------

  protected onScroll(element: HTMLElement): void {
    this.viewport.set({
      x: element.scrollLeft,
      y: element.scrollTop,
      w: element.clientWidth,
      h: element.clientHeight,
    });
  }

  protected onTrackMove(event: PointerEvent): void {
    const rect = this.content()?.nativeElement.getBoundingClientRect();
    if (!rect) {
      return;
    }
    this.pointer = {
      x: Math.max(0, (event.clientX - rect.left - HEAD_W) / this.barWidth()),
      y: event.clientY - rect.top,
    };
    this.publish();
  }

  protected onTrackLeave(): void {
    this.pointer = null;
    this.publish();
  }

  private publish(): void {
    const pointer = this.pointer;
    this.deck.presence.setCursor(
      pointer
        ? {
            tab: SURFACE,
            scope: String(this.store.songSlot()),
            x: Math.round(pointer.x * 100) / 100,
            y: Math.round(pointer.y),
          }
        : null,
    );
  }

  private takeFocus(): void {
    this.scroller()?.nativeElement.focus({ preventScroll: true });
  }

  // ---- keyboard -------------------------------------------------------------

  protected onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.tagName === 'INPUT') {
      return;
    }
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (key === ' ' && !target?.closest('button')) {
      event.preventDefault();
      if (this.playing()) {
        this.deck.pause();
      } else {
        this.play();
      }
    } else if ((key === 'delete' || key === 'backspace') && this.selected().size) {
      event.preventDefault();
      this.deleteSelected();
    } else if (mod && key === 'd') {
      event.preventDefault();
      this.duplicateSelected();
    } else if (mod && key === 'c') {
      this.copySelected();
    } else if (mod && key === 'v' && this.clipboard.length) {
      event.preventDefault();
      this.paste();
    } else if (key === 'enter' && !target?.closest('button')) {
      const pattern = this.listPattern();
      if (pattern) {
        event.preventDefault();
        this.insert(pattern.id, this.snapDown(this.head()), true);
      }
    } else if (key === 'escape' && this.selected().size) {
      this.store.selectBlocks([]);
    }
  }
}
