import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  addTrack,
  defaultSong,
  type MidiSong,
  notesAtOnce,
  type Pattern,
  patternBars,
  removeTrack,
  renameTrack,
  setSfxVoices,
  type Song,
  songEnd,
  songLoopEnd,
  voicePlan,
  VOICES,
} from '@naucto/engine';
import {
  ButtonDirective,
  ChipComponent,
  EdgeHandleComponent,
  focus,
  HelpDotComponent,
  IconComponent,
  JoinedDirective,
  LooksOnlyDirective,
  MarkComponent,
  NumberFieldComponent,
  type PresenceColour,
  PresenceDotsComponent,
  PresenceLayerComponent,
  type PresenceMark,
  type PresenceViewport,
  ToggleButtonComponent,
  TooltipDirective,
  TransportComponent,
} from '@naucto/ui';

import { MetronomeButtonComponent } from '../controls/metronome-button.component';
import { SoundHelpComponent } from '../controls/sound-help.component';
import { type PickerItem, SoundPickerComponent } from '../controls/sound-picker.component';
import { SoundZoomComponent } from '../controls/sound-zoom.component';
import { MidiImportDialog, type MidiImportDialogData } from '../midi-import.dialog';
import { OscilloscopeComponent } from '../oscilloscope.component';
import { BAR_DIVISIONS, MAX_BAR_ZOOM, MIN_BAR_ZOOM } from '../sound.store';
import { SoundDeck } from '../sound-deck';
import { pad2, patternLabel, patternTint } from '../sound-library';
import { SoundPeersComponent } from '../sound-peers.component';
import { BPM_MAX, BPM_MIN } from './note-sheet-editor.component';
import { TimelineEdits } from './timeline-edits';
import { TimelineGestures } from './timeline-gestures';

const BAR_WIDTH = 56;
const MIN_BARS = 16;
const SPARE_BARS = 8;
const HEAD_W = 330;
const ROW_H = 72;
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

@Component({
  selector: 'nc-timeline-editor',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    ChipComponent,
    EdgeHandleComponent,
    HelpDotComponent,
    JoinedDirective,
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
    LooksOnlyDirective,
    MarkComponent,
    TooltipDirective,
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
  protected readonly ROW_H = ROW_H;
  protected readonly viewport = signal<PresenceViewport>({ x: 0, y: 0, w: 0, h: 0 });
  private pointer: { x: number; y: number } | null = null;
  protected readonly pad = pad2;
  protected readonly label = patternLabel;
  protected readonly BPM_MIN = BPM_MIN;
  protected readonly BPM_MAX = BPM_MAX;

  protected readonly edits = new TimelineEdits(
    this.deck,
    computed(() => this.song()),
  );
  protected readonly gestures: TimelineGestures = new TimelineGestures(this.deck, this.edits, {
    song: computed(() => this.song()),
    barWidth: computed(() => this.barWidth()),
    playing: computed(() => this.playing()),
    end: computed(() => this.end()),
    loopStart: computed(() => this.loopStart()),
    loopEnd: computed(() => this.loopEnd()),
    lane: () => this.lane()?.nativeElement,
    rowHeight: ROW_H,
    ruler: () => this.ruler()?.nativeElement,
    takeFocus: () => {
      this.takeFocus();
    },
  });
  protected readonly gesture = this.gestures.gesture;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * The pattern being dragged in from the list: where it would land on the track, or, off the
   * track, beside the pointer. The label is placed from the host, which is positioned: a
   * container query above it makes `fixed` relative to that container, not to the screen.
   */
  protected readonly placing = computed(() => {
    const gesture = this.gesture();
    if (gesture?.kind !== 'place') {
      return null;
    }
    const pattern = this.library.patterns().get(gesture.pattern);
    if (!pattern) {
      return null;
    }
    const width = this.barWidth();
    const origin = this.host.nativeElement.getBoundingClientRect();
    return {
      pattern,
      over: gesture.over,
      left: (gesture.over ?? 0) * width + 2,
      top: gesture.track * ROW_H + 6,
      width: patternBars(pattern) * width - 4,
      colour: this.tint(pattern),
      x: gesture.x - origin.left + 12,
      y: gesture.y - origin.top + 12,
    };
  });
  protected readonly selected = this.edits.selected;
  protected readonly folded = computed(() => this.store.folded().includes('timeline'));
  protected readonly barWidth = computed(() => Math.round(BAR_WIDTH * this.store.barZoom()));
  protected readonly songs = computed(() =>
    [...this.library.songs()]
      .map(([slot, song]) => ({ slot: Number(slot), song }))
      .filter((entry) => Number.isInteger(entry.slot))
      .sort((a, b) => a.slot - b.slot),
  );
  protected readonly song = computed<Song>(
    () => this.library.songs().get(String(this.store.songSlot())) ?? defaultSong(),
  );
  protected readonly tracks = computed(() => this.song().tracks);
  /** How many voices each pattern asks for; read for every block on every pointer move. */
  private readonly needs = computed(() => {
    const instruments = this.library.instruments();
    return new Map(
      [...this.library.patterns()].map(([id, pattern]) => [id, notesAtOnce(pattern, instruments)]),
    );
  });
  /** Which voices each track sounds on, and how many its patterns ask for. */
  protected readonly plan = computed(() =>
    voicePlan(this.song(), this.library.patterns(), this.library.instruments()),
  );
  /** Tracks given fewer voices than their patterns play at once: a note of theirs is cut. */
  protected readonly short = computed(() => {
    const plan = this.plan();
    return plan.needs.map((need, i) => (plan.tracks[i]?.length ?? 0) < need);
  });
  protected readonly VOICES = VOICES;
  protected readonly canAddTrack = computed(() => addTrack(this.song()) !== this.song());
  /** The music as this person hears it: without the tracks they silenced, or only those they singled out. */
  private readonly audible = computed<Song>(() => {
    const song = this.song();
    return this.store.mutedTracks().length || this.store.soloTracks().length
      ? { ...song, blocks: song.blocks.filter((block) => !this.silenced(block.track)) }
      : song;
  });
  protected readonly patterns = computed(() =>
    [...this.library.patterns().values()].sort((a, b) => a.slot - b.slot),
  );
  protected readonly end = computed(() => songEnd(this.song(), this.library.patterns()));
  protected readonly loopEnd = computed<number>(() => {
    const gesture = this.gesture();
    if (gesture?.kind === 'loop' && gesture.edge === 'end') {
      return gesture.at;
    }
    return songLoopEnd(this.song(), this.library.patterns());
  });
  protected readonly loopStart = computed<number>(() => {
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
      let track = block.track;
      let leaving = false;
      // Off the track a block hangs from the pointer, free of the snap, since it lands nowhere.
      let shift = { x: 0, y: 0 };
      if (gesture?.kind === 'move' && gesture.ids.has(block.id)) {
        leaving = gesture.out;
        if (leaving) {
          shift = { x: gesture.x - gesture.startX, y: gesture.y - gesture.startY };
        } else {
          start = Math.max(0, start + gesture.delta);
          track = Math.max(0, Math.min(this.tracks().length - 1, track + gesture.rows));
        }
      }
      if (gesture?.kind === 'grow' && gesture.id === block.id) {
        repeat = gesture.repeat;
      }
      const length = patternBars(pattern);
      const cut =
        (this.needs().get(pattern.id) ?? 0) > (this.plan().tracks[block.track]?.length ?? 0);
      return [
        {
          block,
          pattern,
          left: start * width + 2,
          top: track * ROW_H + 6,
          width: length * repeat * width - 4,
          repWidth: length * width,
          reps: Array.from({ length: repeat }, (_, i) => i),
          colour: palette[patternTint(pattern, instruments)] ?? '',
          leaving,
          shift,
          cut,
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
      const song = this.audible();
      untracked(() => {
        this.deck.refreshSong(song);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.gestures.stop();
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

  protected cycleDivision(): void {
    const i = BAR_DIVISIONS.indexOf(this.store.barDivision());
    this.store.setBarDivision(BAR_DIVISIONS[(i + 1) % BAR_DIVISIONS.length] ?? 1);
  }

  protected setBpm(bpm: number): void {
    this.edits.write((song) => ({ ...song, bpm }));
  }

  protected setLoop(loop: boolean): void {
    this.edits.write((song) => ({ ...song, loop }));
    this.deck.setLoop('timeline', loop);
  }

  protected play(): void {
    void this.deck.playSong(this.audible(), this.song().loop, this.end());
  }

  // ---- tracks ---------------------------------------------------------------

  /** Whether this person does not hear a track: silenced, or another one singled out. */
  protected silenced(index: number): boolean {
    const solo = this.store.soloTracks();
    return solo.length ? !solo.includes(index) : this.store.mutedTracks().includes(index);
  }

  protected trackName(index: number): string {
    const name = this.tracks()[index]?.trim() ?? '';
    return name || this.deck.transloco.translate('editor.sound.trackN', { n: index + 1 });
  }

  protected addTrack(): void {
    this.edits.write((song) => addTrack(song));
  }

  protected removeTrack(index: number): void {
    const name = this.trackName(index);
    this.deck.removeWithUndo(
      () => {
        this.edits.write((song) => removeTrack(song, index));
      },
      this.deck.transloco.translate('editor.sound.toast.trackRemoved', { name }),
    );
    this.store.clearTrackMarks();
    this.store.selectBlocks([]);
  }

  protected async askTrackName(index: number): Promise<void> {
    const result = await this.deck.askName({
      title: this.deck.transloco.translate('editor.sound.renameTrack', {
        name: this.trackName(index),
      }),
      name: this.tracks()[index] ?? '',
      max: 24,
      allowEmpty: true,
    });
    if (result) {
      this.edits.write((song) => renameTrack(song, index, result.name));
    }
  }

  protected setSfxVoices(count: number): void {
    this.edits.write((song) => setSfxVoices(song, count));
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

  /** A MIDI file as a new music, opened once it is in. */
  protected importMidi(): void {
    this.deck.dialogs
      .open<MidiImportDialog, MidiImportDialogData, MidiSong | undefined>(MidiImportDialog, {
        data: { firstSlot: this.library.patternSlotAfterAll() },
        ariaLabel: this.deck.transloco.translate('editor.sound.midi.title'),
      })
      .closed.subscribe((music) => {
        if (!music) {
          return;
        }
        const slot = this.library.nextSongSlot();
        this.library.importMusic(slot, music);
        this.selectSong(slot);
      });
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
      this.edits.write((song) => ({ ...song, name: event.name }));
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
    this.edits.onKey(event, {
      playing: this.playing,
      listPattern: this.listPattern,
      play: () => {
        this.play();
      },
    });
  }
}
