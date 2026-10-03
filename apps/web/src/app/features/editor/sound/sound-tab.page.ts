import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ySignal } from '@app/shared/yjs/y-signal';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  defaultInstrument,
  type Instrument,
  LOCAL_ORIGIN,
  type Note,
  type Pattern,
  type Song,
  SoundEngine,
  VOICES,
  WebAudioBackend,
} from '@naucto/engine';
import {
  ButtonDirective,
  ConfirmDialogComponent,
  type ConfirmDialogData,
  DialogService,
  EmptyStateComponent,
  IconComponent,
  NumberFieldComponent,
  PanelColumnComponent,
  SliderComponent,
  ToggleButtonComponent,
  TransportComponent,
} from '@naucto/ui';
import * as Y from 'yjs';

import { PANEL_WIDTH } from '../state/editor-ui.store';
import { WorkSessionService } from '../work-session/work-session.service';
import {
  InstrumentDialog,
  type InstrumentDialogData,
  type InstrumentDialogResult,
} from './instrument.dialog';
import { InstrumentInspectorComponent } from './instrument-inspector.component';
import { InstrumentListComponent } from './instrument-list.component';
import {
  NewInstrumentDialog,
  type NewInstrumentDialogData,
  type NewInstrumentResult,
} from './new-instrument.dialog';
import { OscilloscopeComponent } from './oscilloscope.component';
import { PianoRollComponent } from './piano-roll.component';
import { SongListComponent } from './song-list.component';
import { MAX_ZOOM, MIN_ZOOM, SNAP_DIVISIONS, type SnapDivision, SoundStore } from './sound.store';
import { blankPattern, pad2, SoundLibrary } from './sound-library';
import { VoicesLaneComponent } from './voices-lane.component';

const ZOOM_OCTAVES = Math.log2(MAX_ZOOM / MIN_ZOOM);

/**
 * Roll-column width under which the pattern bar tightens. Must equal the tightest container-query
 * breakpoint in the template: the query closes the gaps, and the bindings need the same width as a
 * value.
 */
const BAR_TIGHT_MAX = 440;
const BPM_MIN = 40;
const BPM_MAX = 240;

/**
 * A pattern's length moves a bar at a time.
 *
 * The sheet's tooltip says 4 to 64 by 4, which is finer than a pattern is ever cut: four steps is
 * not a phrase, and it puts fifteen stops between the two lengths anybody uses.
 */
const STEP_SIZE = 16;
const STEP_MAX = 64;

/**
 * Voice the side keyboard sounds on.
 *
 * Named rather than allocated, because a held note has to be stoppable and the worklet never says
 * which voice it chose. The last one, which is the last the allocator reaches for, so a pattern
 * playing underneath keeps the voices it was already using.
 */
const HELD_CHANNEL = VOICES - 1;

/**
 * Highest pattern number there is.
 *
 * A pattern is written as two digits wherever it is shown, and the boxes it is shown in are sized
 * for two.
 */
const PATTERN_MAX = 99;

/** SOUND tab: instruments on the left, the piano roll in the middle, the inspector on the right. */
@Component({
  selector: 'nc-sound-tab-page',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    EmptyStateComponent,
    IconComponent,
    NumberFieldComponent,
    PanelColumnComponent,
    SliderComponent,
    ToggleButtonComponent,
    TransportComponent,
    InstrumentInspectorComponent,
    InstrumentListComponent,
    SongListComponent,
    PianoRollComponent,
    OscilloscopeComponent,
    VoicesLaneComponent,
  ],
  templateUrl: './sound-tab.page.html',
  host: { class: 'block h-full', '(keydown)': 'onKey($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoundTabPage {
  protected readonly PANEL_WIDTH = PANEL_WIDTH;
  protected readonly session = inject(WorkSessionService);
  protected readonly sound = inject(SoundStore);
  private readonly dialogs = inject(DialogService);
  private readonly transloco = inject(TranslocoService);
  protected readonly library = new SoundLibrary(this.session.game);
  protected readonly undo: Y.UndoManager;
  protected readonly BPM_MIN = BPM_MIN;
  protected readonly BPM_MAX = BPM_MAX;
  protected readonly STEP_SIZE = STEP_SIZE;
  protected readonly STEP_MAX = STEP_MAX;
  protected readonly PATTERN_MAX = PATTERN_MAX;
  private readonly column = viewChild<ElementRef<HTMLElement>>('column');
  protected readonly tightBar = signal(false);
  private readonly backend = new WebAudioBackend();
  private readonly engine = new SoundEngine(this.backend, this.session.game);
  /** Which of the two transports is running, or null when neither is. */
  protected readonly playingWhat = signal<'pattern' | 'song' | null>(null);
  protected readonly playing = computed(() => this.playingWhat() !== null);
  /** Handed to the scope as a getter so it can pull at frame rate without a signal per frame. */
  protected readonly peaks = (): Float32Array => this.engine.peaks();
  protected readonly playhead = signal<number | null>(null);
  private resumeAfterSeek = false;
  protected readonly voices = signal<boolean[]>(Array.from({ length: VOICES }, () => false));
  private readonly blanks = new Map<number, Pattern>();
  protected readonly canUndo = signal(false);
  protected readonly canRedo = signal(false);
  private raf = 0;

  protected readonly palette = ySignal(
    () => this.session.game.palette,
    (cb) => this.session.game.onPaletteChange(cb),
  );
  protected readonly instrumentList = computed(() => [...this.library.instruments().values()]);
  protected readonly patternList = computed(() => [...this.library.patterns().values()]);
  protected readonly instrument = computed<Instrument | null>(() => {
    const id = this.sound.instrumentId();
    return (id ? this.library.instruments().get(id) : null) ?? this.instrumentList()[0] ?? null;
  });
  /**
   * The pattern at the selected number, or the held blank standing in where the document has none.
   */
  protected readonly pattern = computed<Pattern | null>(() => {
    if (!this.instrumentList().length) return null;
    const slot = this.sound.patternSlot();
    return this.patternList().find((q) => q.slot === slot) ?? this.blankAt(slot);
  });
  protected readonly song = computed<Song | null>(
    () => this.library.songs().get(String(this.sound.songSlot())) ?? null,
  );
  /** Which link of the chain is sounding, so the order list can say where the music has got to. */
  protected readonly songPosition = signal<number | null>(null);
  /** Bumped on every key press and release, so a press whose audio unlock resolves after its release stays silent. */
  private hold = 0;

  /**
   * The head's step on the roll, or null while the chain is sounding a pattern other than the one
   * shown: a head there would mark steps nothing is playing.
   */
  protected readonly rollHead = computed(() => {
    const at = this.songPosition();
    // Nothing in the chain is sounding: either a pattern is being auditioned on its own, which is
    // this one, or nothing is playing and the head is null anyway.
    if (at === null) return this.playhead();
    const sounding = this.song()?.sequence[at] ?? null;

    return sounding !== null && sounding === this.pattern()?.id ? this.playhead() : null;
  });
  protected readonly usedBy = computed(() => {
    const inst = this.instrument();
    return inst ? this.library.usedBy(inst.id) : { patterns: [], sfx: [] };
  });

  constructor() {
    // A write to the shared document, so the host does it and the others watch it arrive. Idempotent
    // by construction: it does nothing once every pattern has a number.
    effect(() => {
      if (this.session.isHost() && this.library.patterns().size > 0) {
        untracked(() => {
          this.library.reconcilePatternSlots();
        });
      }
    });
    // The column rather than the bar: the bar comes and goes with the pattern, and this is the box
    // the bar's own container queries measure.
    effect((onCleanup) => {
      const el = this.column()?.nativeElement;
      if (!el) return;
      const ro = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width;
        if (w !== undefined) this.tightBar.set(w < BAR_TIGHT_MAX);
      });
      ro.observe(el);
      onCleanup(() => {
        ro.disconnect();
      });
    });
    const game = this.session.game;
    this.undo = new Y.UndoManager(
      [game.instruments, game.patterns, game.sfx, game.songs, game.samples],
      { trackedOrigins: new Set([LOCAL_ORIGIN, null]), captureTimeout: 300 },
    );
    const onStack = (): void => {
      this.canUndo.set(this.undo.canUndo());
      this.canRedo.set(this.undo.canRedo());
    };
    this.undo.on('stack-item-added', onStack);
    this.undo.on('stack-item-popped', onStack);
    this.undo.on('stack-cleared', onStack);
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(this.raf);
      this.engine.destroy();
      this.backend.destroy();
      this.undo.destroy();
      this.library.destroy();
      this.session.setCursor(null);
    });
  }

  /**
   * From a preset or from scratch, asked in a dialog.
   *
   * A preset is heard there through the preview under an id of its own: nothing reaches the
   * document until the choice is made, so nobody else in the session hears the browsing.
   */
  protected addInstrument(): void {
    const base = defaultInstrument('__preset__', 'preset');
    this.dialogs
      .open<NewInstrumentDialog, NewInstrumentDialogData, NewInstrumentResult>(
        NewInstrumentDialog,
        {
          width: '640px',
          ariaLabel: this.transloco.translate('editor.sound.newInstrument'),
          data: {
            play: (settings, note) => {
              void this.ready().then(() => {
                this.engine.preview({ ...base, ...settings }, note, 0.6);
              });
            },
          },
        },
      )
      .closed.subscribe((r: NewInstrumentResult) => {
        if (!r) return;
        const inst =
          r.kind === 'preset'
            ? this.library.addInstrument({ name: r.preset.name, settings: r.preset.settings })
            : this.library.addInstrument();
        this.sound.selectInstrument(inst.id);
      });
  }

  protected duplicateInstrument(id: string): void {
    const copy = this.library.duplicateInstrument(id);
    if (copy) this.sound.selectInstrument(copy.id);
  }

  protected editInstrument(id: string): void {
    const inst = this.library.instruments().get(id);
    if (!inst) return;
    this.dialogs
      .open<InstrumentDialog, InstrumentDialogData, InstrumentDialogResult | undefined>(
        InstrumentDialog,
        { data: { name: inst.name, colour: inst.colour, palette: this.palette() } },
      )
      .closed.subscribe((r: InstrumentDialogResult | undefined) => {
        if (r) this.library.updateInstrument(id, { name: r.name, colour: r.colour });
      });
  }

  protected removeInstrument(id: string): void {
    const inst = this.library.instruments().get(id);
    if (!inst) return;
    const remove = (): void => {
      this.library.removeInstrument(id);
      if (this.sound.instrumentId() === id) this.sound.selectInstrument(null);
    };
    // An unused instrument goes without a word: undo brings it back whole. One with notes takes
    // them out of every pattern it plays in, and that is worth a look first.
    const { patterns, sfx } = this.library.usedBy(id);
    if (patterns.length === 0) {
      remove();
      return;
    }
    this.dialogs
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
        data: {
          title: this.transloco.translate('editor.sound.removeInstrumentTitle', {
            name: inst.name,
          }),
          message: this.transloco.translate('editor.sound.removeInstrumentMessage', {
            patterns: patterns.length,
            sfx: sfx.length,
          }),
          confirmLabel: this.transloco.translate('editor.sound.removeInstrumentConfirm'),
          danger: true,
        },
      })
      .closed.subscribe((ok) => {
        if (ok) remove();
      });
  }

  /**
   * The empty pattern standing in for a number the document holds nothing at.
   *
   * Held rather than made afresh on every read: the roll is handed this object and writes into it,
   * and a new one each time would throw away what was being drawn. It reaches the document the
   * first time anything is written to it — see {@link writePattern}.
   */
  private blankAt(slot: number): Pattern {
    const held = this.blanks.get(slot);
    if (held) return held;
    const made = blankPattern(slot);
    this.blanks.set(slot, made);
    return made;
  }

  /**
   * Writes to the pattern being shown, putting it in the document first when it was only a blank.
   */
  private writePattern(p: Pattern, patch: Partial<Pattern>): void {
    if (this.library.patterns().has(p.id)) this.library.updatePattern(p.id, patch);
    else this.library.putPattern({ ...p, ...patch });
  }

  /**
   * Empties the pattern in front of you, which is the only way one stops being used.
   *
   * It stays in the document rather than being deleted: a music that names it would otherwise be
   * left pointing at nothing, and a silent pattern in a chain is at least a place you can see.
   */
  protected clearPattern(): void {
    const p = this.pattern();
    if (!p || p.notes.length === 0) return;
    this.dialogs
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
        data: {
          title: this.transloco.translate('editor.sound.clearTitle', { n: pad2(p.slot) }),
          message: this.transloco.translate('editor.sound.clearMessage', { n: p.notes.length }),
          confirmLabel: this.transloco.translate('editor.sound.clear'),
          danger: true,
        },
      })
      .closed.subscribe((ok) => {
        if (ok) this.writePattern(p, { notes: [] });
      });
  }

  protected readonly pad = pad2;

  /**
   * Puts a pattern number in one place of the chain, or empties it.
   *
   * The chain holds ids, so a number nothing is stored at is written into the document here: being
   * named by a music is one of the ways a pattern stops being unused.
   */
  protected assignSongPlace(e: { index: number; slot: number | null }): void {
    const sequence = [...(this.song()?.sequence ?? [])];
    while (sequence.length <= e.index) sequence.push(null);
    sequence[e.index] = e.slot === null ? null : this.patternIdAt(e.slot);
    while (sequence.length > 0 && sequence[sequence.length - 1] === null) sequence.pop();
    this.library.setSongSequence(this.sound.songSlot(), sequence);
  }

  private patternIdAt(slot: number): string {
    const found = this.patternList().find((q) => q.slot === slot);
    if (found) return found.id;
    const made = this.blankAt(slot);
    this.library.putPattern(made);
    return made.id;
  }

  protected setBpm(bpm: number): void {
    const p = this.pattern();
    if (p) this.writePattern(p, { bpm });
  }

  /**
   * The slider's own position, from nothing to all of it.
   *
   * Logarithmic, because a step of the same size at either end of the range is a different amount
   * of zoom: half a step to a whole one is the same move as two to four.
   */
  protected readonly zoomAt = computed(
    () => Math.log2(this.sound.zoom() / MIN_ZOOM) / ZOOM_OCTAVES,
  );
  protected readonly zoomLabel = computed(() => {
    const z = this.sound.zoom();
    return Number.isInteger(z) ? String(z) : z.toFixed(2).replace(/0$/, '');
  });

  protected setZoomAt(t: number): void {
    this.sound.setZoom(MIN_ZOOM * Math.pow(2, t * ZOOM_OCTAVES));
  }

  /** A button moves by a whole octave, so it lands where somebody would have aimed the slider. */
  protected stepZoom(delta: number): void {
    this.sound.setZoom(this.sound.zoom() * Math.pow(2, delta));
  }

  /**
   * Looping is not only a setting: something may already be playing, and the graph was told once,
   * when it was asked to start. Told again, it changes its mind mid-take.
   */
  protected setLoop(loop: boolean): void {
    this.sound.setLoop(loop);
    this.engine.setLoop(loop);
  }

  protected snapLabel(off: string): string {
    const n = this.sound.snap();
    return n === 0 ? off : `1/${String(n)}`;
  }

  /** Off, then round the divisions and back to off. */
  protected cycleSnap(): void {
    const order: SnapDivision[] = [0, ...SNAP_DIVISIONS];
    const i = order.indexOf(this.sound.snap());
    this.sound.setSnap(order[(i + 1) % order.length] ?? 0);
  }

  protected setNotes(p: Pattern, notes: Note[]): void {
    this.writePattern(p, { notes });
  }

  /**
   * Shortening a pattern drops what is past its new end, so it asks first -- and only when there is
   * something to lose. A note that merely runs over the edge is shortened rather than dropped: the
   * note was placed inside the pattern, only its tail was not.
   */
  protected setSteps(steps: number): void {
    const p = this.pattern();
    if (!p) return;
    const kept: Note[] = p.notes
      .filter((n) => n.step < steps)
      .map((n) => ({ ...n, length: Math.min(n.length, steps - n.step) }));
    if (kept.length === p.notes.length) {
      this.writePattern(p, { steps, notes: kept });
      return;
    }
    const lost = p.notes.length - kept.length;
    this.dialogs
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
        data: {
          title: this.transloco.translate('editor.sound.shortenTitle'),
          message: this.transloco.translate('editor.sound.shortenMessage', { n: lost }),
          confirmLabel: this.transloco.translate('editor.sound.shorten'),
          danger: true,
        },
      })
      .closed.subscribe((ok) => {
        if (ok) this.writePattern(p, { steps, notes: kept });
      });
  }

  protected toggleSfx(slot: number): void {
    const p = this.pattern();
    if (!p) return;
    const current = this.library.sfx().get(String(slot));
    if (current === p.id) {
      this.library.assignSfx(slot, null);
      return;
    }
    // Putting a blank pattern in a slot is what makes it real: the slot holds an id, and until now
    // this one was only in front of you.
    this.writePattern(p, {});
    this.library.assignSfx(slot, p.id);
  }

  // ---- playback -------------------------------------------------------------

  /**
   * Unlocked, and watched: the scope on this page is the one place a trace is drawn, so the graph
   * is told to report one here and nowhere else.
   */
  private async ready(): Promise<void> {
    await this.engine.unlock();
    this.engine.monitor(true);
  }

  /** The pattern in front of you, from wherever the head stands -- where PAUSE left it, or where
   * it was put in the ruler. */
  protected async play(): Promise<void> {
    const p = this.pattern();
    if (!p) return;
    await this.ready();
    const head = this.playhead() ?? 0;
    this.engine.previewPattern(p, this.sound.loop(), head < p.steps ? head : 0);
    this.playingWhat.set('pattern');
    this.tick();
  }

  protected async playSong(): Promise<void> {
    // The music stops before a hole, so a chain that opens on one has nothing to play.
    if (!this.song()?.sequence[0]) return;
    await this.ready();
    // LOOP belongs to the pattern in the bar above, and putting it out is the plainest way to say
    // it does not apply to the chain you are about to hear.
    this.sound.setLoop(false);
    this.engine.playMusic(this.sound.songSlot(), false, 0);
    this.playingWhat.set('song');
    this.tick();
  }

  /**
   * Stopped for the length of the gesture rather than restarted at every step the head crosses: a
   * drag crosses dozens, and starting the graph over on each one is a stutter, not a scrub.
   */
  protected onSeek(step: number): void {
    if (this.playing()) {
      this.resumeAfterSeek = true;
      this.pause();
    }
    this.playhead.set(step);
  }

  protected onSeekEnd(): void {
    if (!this.resumeAfterSeek) return;
    this.resumeAfterSeek = false;
    void this.play();
  }

  /**
   * Halts where it is; the playhead stays, and so does the place a chain had reached, so PLAY
   * resumes from the same bar and the music grid keeps saying where you are.
   */
  protected pause(): void {
    this.engine.stopMusic(0);
    this.playingWhat.set(null);
    cancelAnimationFrame(this.raf);
  }

  /** Back to the top of whichever of the two is running. */
  protected toStart(): void {
    const was = this.playingWhat();
    this.playhead.set(0);
    if (was === 'song') void this.playSong();
    else if (was === 'pattern') void this.play();
  }

  protected songToStart(): void {
    this.songPosition.set(null);
    void this.playSong();
  }

  /** Ends the take: nothing is playing and nothing is anywhere, so both marks go out. */
  protected stop(): void {
    this.pause();
    this.playhead.set(null);
    this.songPosition.set(null);
  }

  private tick(): void {
    cancelAnimationFrame(this.raf);
    let lastBeat = -1;
    // The graph reports no position for the first frames after it is asked to start, so silence
    // only means the end of the pattern once a position has been seen. The cost is that a start
    // which never arrives leaves the head standing rather than clearing it.
    let begun = false;
    const loop = (): void => {
      const pos = this.engine.musicPosition();
      this.voices.set(Array.from({ length: VOICES }, (_, i) => this.engine.isPlaying(i)));
      if (pos) {
        begun = true;
        this.playhead.set(pos.step);
        // `pattern` is the position in the chain, not a pattern id. Nothing is highlighted while a
        // bare pattern is being auditioned, because no row is playing.
        this.songPosition.set(this.playingWhat() === 'song' ? pos.pattern : null);
        const p = this.pattern();
        if (this.sound.metronome() && p) {
          const beat = Math.floor(pos.step / p.stepsPerBeat);
          if (beat !== lastBeat) {
            lastBeat = beat;
            this.click(beat % 4 === 0);
          }
        }
      } else if (begun && this.playing() && this.playhead() !== null) {
        this.playingWhat.set(null);
        this.playhead.set(null);
        this.songPosition.set(null);
        return;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** A bare square blip on every beat, accented on the downbeat. Never written into the pattern. */
  private click(accent: boolean): void {
    const base = defaultInstrument('__metronome__', 'metronome');
    this.engine.preview(
      {
        ...base,
        osc: 'square',
        volume: accent ? 0.35 : 0.18,
        env: { attack: 0, decay: 0.02, sustain: 0, release: 0.01 },
      },
      accent ? 96 : 84,
      0.03,
    );
  }

  protected audition(e: { instrument: string; pitch: number }): void {
    const inst = this.library.instruments().get(e.instrument);
    if (!inst) return;
    void this.ready().then(() => {
      this.engine.preview(inst, e.pitch, 0.3);
    });
  }

  /**
   * A key of the side keyboard, held for as long as it is pressed.
   *
   * Length zero, so the note settles at the instrument's sustain and waits — an envelope that
   * sustains at nothing still dies away on its own, which is what that instrument does.
   */
  protected holdKey(e: { instrument: string; pitch: number }): void {
    const inst = this.library.instruments().get(e.instrument);
    if (!inst) return;
    const token = ++this.hold;
    void this.ready().then(() => {
      if (token === this.hold) this.engine.preview(inst, e.pitch, 0, HELD_CHANNEL);
    });
  }

  protected releaseKey(): void {
    this.hold++;
    this.engine.stopNote(HELD_CHANNEL);
  }

  /** Presence follows the pointer, not the cell it is over — see `pointer` on the roll. */
  protected onPointer(p: { x: number; y: number } | null): void {
    // Rounded to a hundredth of a step: finer than a screen pixel at any zoom the roll offers,
    // and coarse enough that the service's dedupe still collapses a still pointer.
    this.session.setCursor(
      p
        ? {
            tab: 'sound',
            scope: this.pattern()?.id,
            x: Math.round(p.x * 100) / 100,
            y: Math.round(p.y * 100) / 100,
          }
        : null,
    );
  }

  protected onKey(e: KeyboardEvent): void {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT') return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.undo.redo();
      else this.undo.undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.undo.redo();
    } else if (e.key === ' ') {
      e.preventDefault();
      if (this.playing()) this.stop();
      else void this.play();
    }
  }
}
