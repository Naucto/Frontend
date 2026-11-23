import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import {
  BEATS_PER_BAR,
  C4,
  defaultInstrument,
  type NoteSheet,
  type Pattern,
  type Song,
  SoundEngine,
  VOICES,
  WebAudioBackend,
} from '@naucto/engine';
import { DialogService, type PresenceDot, ToastService } from '@naucto/ui';
import { firstValueFrom } from 'rxjs';

import { ySignal } from '../../../shared/yjs/y-signal';
import { injectUndo } from '../state/undo-scope';
import {
  type Collaborator,
  SessionPresenceService,
} from '../work-session/session-presence.service';
import { WorkSessionService } from '../work-session/work-session.service';
import {
  InstrumentDialog,
  type InstrumentDialogData,
  type InstrumentDialogResult,
} from './instrument.dialog';
import {
  NewInstrumentDialog,
  type NewInstrumentDialogData,
  type NewInstrumentResult,
} from './new-instrument.dialog';
import { SoundStore, type SoundWindow } from './sound.store';
import { blankPattern, pad2, patternLabel } from './sound-library';
import { SoundLibrary } from './sound-library';

export type SoundSource = Extract<SoundWindow, 'timeline' | 'patterns' | 'sfx'>;

const HELD_CHANNEL = VOICES - 1;
const UNDO_TOAST_MS = 6000;
const UNDO_LIMIT = 200;
const WINDOW_OF_SURFACE: Partial<Record<string, SoundWindow>> = {
  'sound:timeline': 'timeline',
  'sound:patterns': 'patterns',
  'sound:sfx': 'sfx',
  'sound:inspector': 'instruments',
  'sound:instruments': 'instruments',
};

const METRONOME = {
  downbeat: { volume: 0.5, pitch: C4 + 36 },
  beat: { volume: 0.26, pitch: C4 + 24 },
  env: { attack: 0, decay: 0.02, sustain: 0, release: 0.01 },
  seconds: 0.03,
} as const;

@Injectable()
export class SoundDeck {
  readonly session = inject(WorkSessionService);
  readonly presence = inject(SessionPresenceService);
  readonly store = inject(SoundStore);
  readonly dialogs = inject(DialogService);
  readonly transloco = inject(TranslocoService);
  private readonly toasts = inject(ToastService);
  private undoToast: { id: number; item: unknown } | null = null;
  readonly library = new SoundLibrary(this.session.game);
  readonly undo = injectUndo(
    [
      this.session.game.instruments,
      this.session.game.patterns,
      this.session.game.sfx,
      this.session.game.songs,
      this.session.game.samples,
    ],
    { limit: UNDO_LIMIT },
  );
  readonly palette = ySignal(
    () => this.session.game.palette,
    (cb) => this.session.game.onPaletteChange(cb),
  );
  private readonly backend = new WebAudioBackend();
  private readonly engine = new SoundEngine(this.backend, this.session.game);

  readonly playing = signal<SoundSource | null>(null);
  readonly heads = {
    timeline: signal<number>(0),
    patterns: signal<number | null>(null),
    sfx: signal<number | null>(null),
  };
  readonly voices = signal<boolean[]>(Array.from({ length: VOICES }, () => false));
  readonly marked = computed<string[]>(() => {
    const source = this.playing();
    return source ? [source] : [];
  });
  readonly peaks = (): Float32Array => this.engine.peaks();
  readonly peers = computed(() => {
    const out = new Map<SoundWindow, Collaborator[]>();
    for (const collaborator of this.presence.collaborators()) {
      const window = collaborator.isSelf
        ? undefined
        : WINDOW_OF_SURFACE[collaborator.cursor?.tab ?? ''];
      if (window) {
        out.set(window, [...(out.get(window) ?? []), collaborator]);
      }
    }
    return out;
  });
  private readonly openBy = computed(() => {
    const out = new Map<string, PresenceDot[]>();
    for (const collaborator of this.presence.collaborators()) {
      const item = collaborator.view?.tab === 'sound' ? collaborator.view.item : undefined;
      if (!collaborator.isSelf && item) {
        const dot = {
          id: collaborator.clientId,
          name: collaborator.name,
          colour: collaborator.colour,
        };
        out.set(item, [...(out.get(item) ?? []), dot]);
      }
    }
    return out;
  });
  /** The others who have this item open, the key written the way the view publishes it. */
  peersOn(item: string): PresenceDot[] {
    return this.openBy().get(item) ?? [];
  }

  readonly songPeers = (slot: string): PresenceDot[] => this.peersOn(`song:${slot}`);
  readonly sfxPeers = (slot: string): PresenceDot[] => this.peersOn(`sfx:${slot}`);
  readonly instrumentPeers = (id: string): PresenceDot[] => this.peersOn(`instrument:${id}`);
  readonly patternPeers = (slot: number): PresenceDot[] => this.peersOn(`pattern:${String(slot)}`);

  readonly instrumentList = computed(() => [...this.library.instruments().values()]);
  readonly instrument = computed(() => {
    const id = this.store.instrumentId();
    return (id ? this.library.instruments().get(id) : null) ?? this.instrumentList()[0] ?? null;
  });

  private sheet: NoteSheet | null = null;
  private raf = 0;
  private lastBeat = -1;
  private counting = 0;
  private songSent: string | null = null;
  private hold = 0;

  constructor() {
    const stale = (): void => {
      if (this.undoToast && this.undo.manager.undoStack.at(-1) !== this.undoToast.item) {
        this.toasts.dismiss(this.undoToast.id);
        this.undoToast = null;
      }
    };
    this.undo.manager.on('stack-item-added', stale);
    this.undo.manager.on('stack-item-popped', stale);
    inject(DestroyRef).onDestroy(() => {
      if (this.undoToast) {
        this.toasts.dismiss(this.undoToast.id);
      }
      cancelAnimationFrame(this.raf);
      this.engine.destroy();
      this.backend.destroy();
      this.library.destroy();
      this.presence.setCursor(null);
    });
  }

  private async ready(): Promise<void> {
    await this.engine.unlock();
    this.engine.monitor(true);
  }

  async playSheet(source: 'patterns' | 'sfx', sheet: NoteSheet, loop: boolean): Promise<void> {
    await this.ready();
    const head = this.heads[source]() ?? 0;
    this.halt();
    if (!(await this.countIn(sheet.bpm))) {
      return;
    }
    this.sheet = sheet;
    this.engine.previewPattern(sheet, loop, head < sheet.steps ? head : 0);
    this.playing.set(source);
    this.tick();
  }

  async playSong(song: Song, loop: boolean, end: number): Promise<void> {
    if (!song.blocks.length) {
      return;
    }
    await this.ready();
    const head = this.heads.timeline();
    this.halt();
    if (!(await this.countIn(song.bpm))) {
      return;
    }
    this.sheet = null;
    this.songSent = JSON.stringify(song);
    this.engine.previewSong(song, loop, head < end ? head : 0);
    this.playing.set('timeline');
    this.tick();
  }

  refreshSheet(source: 'patterns' | 'sfx', sheet: NoteSheet): void {
    if (this.playing() !== source) {
      return;
    }
    this.sheet = sheet;
    this.engine.updatePreview(sheet);
  }

  refreshSong(song: Song): void {
    const sent = JSON.stringify(song);
    if (this.playing() !== 'timeline' || !song.blocks.length || sent === this.songSent) {
      return;
    }
    this.songSent = sent;
    this.engine.previewSong(song, song.loop, this.heads.timeline());
  }

  setLoop(source: SoundSource, loop: boolean): void {
    if (this.playing() === source) {
      this.engine.setLoop(loop);
    }
  }

  pause(): void {
    this.halt();
  }

  stop(source: SoundSource): void {
    if (this.playing() === source) {
      this.halt();
    }
    if (source === 'timeline') {
      this.heads.timeline.set(0);
    } else {
      this.heads[source].set(null);
    }
  }

  private async countIn(bpm: number): Promise<boolean> {
    const settings = this.store.metronomeSettings();
    if (!this.store.metronome() || !settings.countIn) {
      return true;
    }
    const token = ++this.counting;
    const ticks = BEATS_PER_BAR * settings.division;
    const gap = (60 / bpm / settings.division) * 1000;
    for (let i = 0; i < ticks; i++) {
      if (token !== this.counting) {
        return false;
      }
      this.click(i, settings.division);
      await new Promise((resolve) => setTimeout(resolve, gap));
    }
    return token === this.counting;
  }

  private halt(): void {
    this.counting++;
    this.engine.stopMusic(0);
    this.playing.set(null);
    cancelAnimationFrame(this.raf);
  }

  private tick(): void {
    cancelAnimationFrame(this.raf);
    this.lastBeat = -1;
    let begun = false;
    const loop = (): void => {
      const beat = this.engine.musicBeat();
      const source = this.playing();
      this.voices.set(Array.from({ length: VOICES }, (_, i) => this.engine.isPlaying(i)));
      if (beat !== null && source) {
        begun = true;
        if (source === 'timeline') {
          this.heads.timeline.set(beat / BEATS_PER_BAR);
        } else if (this.sheet) {
          this.heads[source].set(beat * this.sheet.stepsPerBeat);
        }
        this.clickOnBeat(beat);
      } else if (begun && source) {
        this.playing.set(null);
        if (source !== 'timeline') {
          this.heads[source].set(null);
        }
        return;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private clickOnBeat(beat: number): void {
    const division = this.store.metronomeSettings().division;
    const tick = Math.floor(beat * division + 1e-6);
    if (!this.store.metronome() || tick === this.lastBeat) {
      return;
    }
    this.lastBeat = tick;
    this.click(tick, division);
  }

  private click(tick: number, division: number): void {
    const settings = this.store.metronomeSettings();
    const accent = settings.accent && tick % (BEATS_PER_BAR * division) === 0;
    const click = accent ? METRONOME.downbeat : METRONOME.beat;
    this.engine.preview(
      {
        ...defaultInstrument('__metronome__', 'metronome'),
        osc: 'square',
        volume: (click.volume * settings.volume) / 100,
        env: METRONOME.env,
      },
      click.pitch,
      METRONOME.seconds,
    );
  }

  previewInstrument(
    instrument: Parameters<SoundEngine['preview']>[0],
    pitch: number,
    length = 0.6,
  ): void {
    void this.ready().then(() => {
      this.engine.preview(instrument, pitch, length);
    });
  }

  audition(event: { instrument: string; pitch: number }): void {
    const inst = this.library.instruments().get(event.instrument);
    if (inst) {
      this.previewInstrument(inst, event.pitch, 0.3);
    }
  }

  holdKey(event: { instrument: string; pitch: number }): void {
    const inst = this.library.instruments().get(event.instrument);
    if (!inst) {
      return;
    }
    const token = ++this.hold;
    void this.ready().then(() => {
      if (token === this.hold) {
        this.engine.preview(inst, event.pitch, 0, HELD_CHANNEL);
      }
    });
  }

  releaseKey(): void {
    this.hold++;
    this.engine.stopNote(HELD_CHANNEL);
  }

  removeWithUndo(remove: () => void, message: string): void {
    const manager = this.undo.manager;
    manager.stopCapturing();
    const before = manager.undoStack.length;
    remove();
    manager.stopCapturing();
    if (manager.undoStack.length === before) {
      return;
    }
    if (this.undoToast) {
      this.toasts.dismiss(this.undoToast.id);
    }
    const item = manager.undoStack.at(-1);
    const id = this.toasts.show(message, 'info', UNDO_TOAST_MS, {
      label: this.transloco.translate('editor.undo'),
      run: () => {
        if (manager.undoStack.at(-1) === item) {
          manager.undo();
        }
      },
    });
    this.undoToast = { id, item };
  }

  createPattern(): Pattern {
    const slot = this.library.nextPatternSlot();
    const song = this.library.songs().get(String(this.store.songSlot()));
    const pattern: Pattern = { ...blankPattern(slot), name: '', bpm: song?.bpm ?? 124 };
    this.library.putPattern(pattern);
    this.store.selectPattern(slot);
    return pattern;
  }

  duplicatePattern(id: string): void {
    const copy = this.library.duplicatePattern(id);
    if (copy) {
      this.store.selectPattern(copy.slot);
    }
  }

  renamePattern(id: string, name: string): void {
    const pattern = this.library.patterns().get(id);
    if (pattern) {
      this.library.updatePattern(id, { name });
    }
  }

  async askPatternName(pattern: Pattern): Promise<void> {
    const result = await this.askName({
      title: this.transloco.translate('editor.sound.renamePattern', { n: pad2(pattern.slot) }),
      name: pattern.name,
      max: 24,
      allowEmpty: true,
    });
    if (result) {
      this.renamePattern(pattern.id, result.name);
    }
  }

  async removePattern(id: string): Promise<void> {
    const pattern = this.library.patterns().get(id);
    if (!pattern) {
      return;
    }
    const usage = this.library.patternUsage(id);
    const where = usage
      .map((entry) =>
        this.transloco.translate('editor.sound.usedInSong', {
          n: entry.uses,
          song: `${pad2(entry.slot)} ${entry.name}`.trim(),
        }),
      )
      .join(', ');
    const confirmed = await this.dialogs.confirmDanger({
      title: this.transloco.translate('editor.sound.removePatternTitle', {
        n: pad2(pattern.slot),
        name: patternLabel(pattern),
      }),
      message: usage.length
        ? this.transloco.translate('editor.sound.removePatternUsed', { where })
        : this.transloco.translate('editor.sound.removePatternUnused'),
      confirmLabel: this.transloco.translate('editor.sound.removePattern'),
    });
    if (!confirmed) {
      return;
    }
    this.removeWithUndo(
      () => {
        this.library.removePattern(id);
      },
      this.transloco.translate(
        usage.length
          ? 'editor.sound.toast.patternRemovedBlocks'
          : 'editor.sound.toast.patternRemoved',
        { name: `${pad2(pattern.slot)} · ${patternLabel(pattern)}` },
      ),
    );
  }

  async askName(data: InstrumentDialogData): Promise<InstrumentDialogResult | undefined> {
    return firstValueFrom(
      this.dialogs.open<InstrumentDialog, InstrumentDialogData, InstrumentDialogResult | undefined>(
        InstrumentDialog,
        { data },
      ).closed,
    );
  }

  addInstrument(): void {
    const base = defaultInstrument('__preset__', 'preset');
    this.dialogs
      .open<NewInstrumentDialog, NewInstrumentDialogData, NewInstrumentResult>(
        NewInstrumentDialog,
        {
          width: '640px',
          ariaLabel: this.transloco.translate('editor.sound.newInstrument'),
          data: {
            play: (settings, note) => {
              this.previewInstrument({ ...base, ...settings }, note, 0.6);
            },
          },
        },
      )
      .closed.subscribe((result: NewInstrumentResult) => {
        if (!result) {
          return;
        }
        const inst =
          result.kind === 'preset'
            ? this.library.addInstrument({
                name: result.preset.name,
                settings: result.preset.settings,
              })
            : this.library.addInstrument();
        this.store.selectInstrument(inst.id);
      });
  }

  duplicateInstrument(id: string): void {
    const copy = this.library.duplicateInstrument(id);
    if (copy) {
      this.store.selectInstrument(copy.id);
    }
  }

  async editInstrument(id: string): Promise<void> {
    const inst = this.library.instruments().get(id);
    if (!inst) {
      return;
    }
    const result = await this.askName({
      name: inst.name,
      colour: inst.colour,
      palette: this.palette(),
    });
    if (result) {
      this.library.updateInstrument(id, {
        name: result.name,
        colour: result.colour ?? inst.colour,
      });
    }
  }

  async removeInstrument(id: string): Promise<void> {
    const inst = this.library.instruments().get(id);
    if (!inst) {
      return;
    }
    const remove = (): void => {
      this.removeWithUndo(
        () => {
          this.library.removeInstrument(id);
        },
        this.transloco.translate('editor.sound.toast.instrumentRemoved', { name: inst.name }),
      );
      if (this.store.instrumentId() === id) {
        this.store.selectInstrument(null);
      }
    };
    const { patterns, sfx } = this.library.usedBy(id);
    if (patterns.length === 0 && sfx.length === 0) {
      remove();
      return;
    }
    const confirmed = await this.dialogs.confirmDanger({
      title: this.transloco.translate('editor.sound.removeInstrumentTitle', { name: inst.name }),
      message: this.transloco.translate('editor.sound.removeInstrumentMessage', {
        patterns: patterns.length,
        sfx: sfx.length,
      }),
      confirmLabel: this.transloco.translate('editor.sound.removeInstrumentConfirm'),
    });
    if (confirmed) {
      remove();
    }
  }
}
