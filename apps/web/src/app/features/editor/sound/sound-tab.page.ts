import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  defaultInstrument,
  defaultPattern,
  type Instrument,
  LOCAL_ORIGIN,
  midiToNoteName,
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
import { OscilloscopeComponent } from './oscilloscope.component';
import { PianoRollComponent } from './piano-roll.component';
import { SongListComponent } from './song-list.component';
import { MAX_ZOOM, MIN_ZOOM, SNAP_DIVISIONS, type SnapDivision, SoundStore } from './sound.store';
import { SoundLibrary } from './sound-library';
import { VoicesLaneComponent } from './voices-lane.component';

const ZOOM_OCTAVES = Math.log2(MAX_ZOOM / MIN_ZOOM);

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
    InstrumentInspectorComponent,
    InstrumentListComponent,
    SongListComponent,
    PianoRollComponent,
    OscilloscopeComponent,
    VoicesLaneComponent,
  ],
  template: `
    <div *transloco="let t" class="grid h-full grid-cols-[237px_minmax(0,1fr)_auto]">
      <!-- A column, not a stack: the instrument list takes what is left after the two banks, so
           they keep their place at the bottom however many instruments there are. The banks stand
           at a fixed height, so on a screen too short for all three the column scrolls rather than
           cutting a row of the last one in half. -->
      <aside class="flex min-h-0 flex-col overflow-y-auto border-r border-line bg-panel">
        <!-- A floor rather than nothing: left free to shrink it would give up every one of its
             rows to the banks below before the column ever scrolled. -->
        <nc-instrument-list
          class="min-h-[120px] flex-1"
          [list]="instrumentList()"
          [selectedId]="sound.instrumentId()"
          [palette]="palette()"
          [sfx]="library.sfx()"
          [patternId]="pattern()?.id ?? null"
          (selected)="sound.selectInstrument($event)"
          (add)="addInstrument()"
          (remove)="removeInstrument($event)"
          (duplicate)="duplicateInstrument($event)"
          (edit)="editInstrument($event)"
          (sfxToggle)="toggleSfx($event)"
        />
        <nc-song-list
          class="shrink-0"
          [slot]="sound.songSlot()"
          [song]="song()"
          [patterns]="library.patterns()"
          [playingIndex]="songPosition()"
          [playing]="playingWhat() === 'song'"
          (slotChange)="sound.selectSong($event)"
          [maxSlot]="PATTERN_MAX"
          (assign)="assignSongPlace($event)"
          (started)="playSong()"
          (paused)="pause()"
        />
      </aside>

      <section class="flex min-h-0 flex-col">
        @if (pattern(); as p) {
          <header
            class="flex h-(--nc-bar-h) shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-panel px-2"
          >
            <!-- A number you type or step, not a menu: the design says so in its own words for
                 BPM and STEPS, and a pattern is the same kind of thing. The arrows walk the
                 patterns that exist, skipping the numbers nothing is at. -->
            <nc-number-field
              class="shrink-0"
              [label]="t('editor.sound.pattern')"
              [value]="p.slot"
              [max]="PATTERN_MAX"
              (requested)="sound.selectPattern($event)"
            />
            <!-- Nothing adds or deletes a pattern, so there is one button here and not two: a
                 pattern with nothing in it is one nobody is using, and emptying it is the whole of
                 what "get rid of this one" can mean. -->
            <button
              ncButton
              variant="ghost"
              size="sm"
              iconOnly
              [attr.aria-label]="t('editor.sound.clearPattern', { n: pad(p.slot) })"
              [disabled]="!p.notes.length"
              (click)="clearPattern()"
            >
              <nc-icon name="trash" [size]="24" />
            </button>
            <span class="flex-1"></span>
            <!-- Play, pause and an explicit stop that rewinds — pausing on the last bar and
                 pressing play again should not be the only way back to the start. -->
            <span class="flex items-center gap-0.5 rounded-sm border border-line bg-inset p-0.5">
              @if (playingWhat() === 'pattern') {
                <button
                  ncButton
                  variant="ghost"
                  size="sm"
                  iconOnly
                  [attr.aria-label]="t('editor.sound.pause')"
                  (click)="pause()"
                >
                  <nc-icon name="pause" [size]="24" />
                </button>
              } @else {
                <button
                  ncButton
                  variant="ghost"
                  size="sm"
                  iconOnly
                  [attr.aria-label]="t('editor.sound.play')"
                  (click)="play()"
                >
                  <nc-icon name="play" [size]="24" class="text-hot-ink" />
                </button>
              }
              <!-- Back to the top without stopping, which is what you want when you are listening
                   to a bar again rather than putting the pattern down. Stopping also returns to the
                   start, so without this the only way back was to end the take. -->
              <button
                ncButton
                variant="ghost"
                size="sm"
                iconOnly
                [attr.aria-label]="t('editor.sound.toStart')"
                (click)="toStart()"
                [disabled]="playhead() === null"
              >
                <nc-icon name="prev" [size]="24" />
              </button>
              <button
                ncButton
                variant="ghost"
                size="sm"
                iconOnly
                [attr.aria-label]="t('editor.sound.stop')"
                (click)="stop()"
                [disabled]="!playing() && playhead() === null"
              >
                <nc-icon name="stop" [size]="24" />
              </button>
            </span>
            <nc-toggle-button [checked]="sound.loop()" (checkedChange)="sound.setLoop($event)">
              <nc-icon name="repeat" [size]="24" />
              {{ t('editor.sound.loop') }}
            </nc-toggle-button>
            <nc-toggle-button
              [checked]="sound.metronome()"
              (checkedChange)="sound.setMetronome($event)"
              accent="jade"
            >
              <nc-icon name="metronome" [size]="24" />
              {{ t('editor.sound.metronome') }}
            </nc-toggle-button>
            <span class="flex-1"></span>
            <!-- Number fields, not menus of blessed values: the sheet says so in its own words,
                 "type a value or step with the arrows. Not a dropdown." A strip of seven tempos
                 read as the only seven anyone was allowed. -->
            <nc-number-field
              class="shrink-0"
              [label]="t('editor.sound.bpm')"
              [value]="p.bpm"
              [min]="BPM_MIN"
              [max]="BPM_MAX"
              (requested)="setBpm($event)"
            />
            <nc-number-field
              class="shrink-0"
              [label]="t('editor.sound.steps')"
              [value]="p.steps"
              [min]="STEP_SIZE"
              [max]="STEP_MAX"
              [step]="STEP_SIZE"
              (requested)="setSteps($event)"
            />
            <button
              ncButton
              variant="ghost"
              size="sm"
              iconOnly
              [attr.aria-label]="t('editor.undo')"
              (click)="undo.undo()"
              [disabled]="!canUndo()"
            >
              <nc-icon name="undo" [size]="24" />
            </button>
            <button
              ncButton
              variant="ghost"
              size="sm"
              iconOnly
              [attr.aria-label]="t('editor.redo')"
              (click)="undo.redo()"
              [disabled]="!canRedo()"
            >
              <nc-icon name="redo" [size]="24" />
            </button>
          </header>
          <nc-piano-roll
            #roll
            class="min-h-0 flex-1"
            [pattern]="p"
            [instruments]="library.instruments()"
            [palette]="palette()"
            [instrumentId]="sound.instrumentId()"
            [snap]="sound.snap()"
            [zoom]="sound.zoom()"
            [playhead]="playhead()"
            [collaborators]="session.collaborators()"
            [label]="t('editor.sound.pianoRoll')"
            (notesChange)="setNotes(p, $event)"
            (audition)="audition($event)"
            (keyPressed)="holdKey($event)"
            (keyReleased)="releaseKey()"
            (pointer)="onPointer($event)"
            (seek)="onSeek($event)"
            (seekEnd)="onSeekEnd()"
          />
          <nc-voices-lane
            [pattern]="p"
            [instruments]="library.instruments()"
            [palette]="palette()"
            [stepWidth]="roll.stepW()"
            [scrollLeft]="roll.scrollX()"
            [playhead]="playhead()"
            [active]="voices()"
            [label]="t('editor.sound.voices')"
          />
        } @else {
          <div class="flex flex-1 items-center justify-center">
            <nc-empty-state
              icon="music"
              [title]="t('editor.sound.emptyTitle')"
              [hint]="t('editor.sound.emptyHint')"
            >
              <button ncButton variant="primary" (click)="addInstrument()">
                <nc-icon name="plus" [size]="12" />
                {{ t('editor.sound.addInstrument') }}
              </button>
            </nc-empty-state>
          </div>
        }
      </section>

      <nc-panel-column [width]="PANEL_WIDTH">
        <!-- The strip first, then the scope. All three columns head with a 40px row, and a scope
             above this one pushed its head below the other two — three heads at three heights on a
             screen the design gives one baseline. The scope keeps the top of what it belongs to:
             it is the only place you see what the synth is doing rather than what the pattern says
             it should. -->
        <div actions class="flex min-w-0 flex-1 items-center gap-1">
          <!-- One button carrying its current resolution, not six chips: the row is 340px and
               the chips wrapped onto a second line, out of the bar and over the scope. Controlled,
               because a press means "next resolution" and only the store knows whether the answer
               is still lit — left to itself the button would put its own lamp out on every press. -->
          <nc-toggle-button
            [controlled]="true"
            [checked]="sound.snap() !== 0"
            (activated)="cycleSnap()"
            [label]="t('editor.sound.snap')"
          >
            <nc-icon name="grid" [size]="24" />
            {{ snapLabel(t('editor.sound.snap')) }}
          </nc-toggle-button>
          <!-- On the head row, beside the controls, rather than in a band of its own beneath it:
               it is a reading and not a section, and given a band it took the height of one. It
               takes the height and the outline of the control beside it, so the row reads as one
               set of things rather than a control and a stripe. -->
          <nc-oscilloscope
            class="h-(--nc-control-h) w-[88px] shrink-0 border border-line"
            [peaks]="peaks"
          />
          <span class="flex-1"></span>
          <button
            ncButton
            variant="ghost"
            size="sm"
            iconOnly
            class="shrink-0"
            [attr.aria-label]="t('editor.sound.zoomOut')"
            (click)="stepZoom(-1)"
          >
            <nc-icon name="zoom-out" [size]="24" />
          </button>
          <nc-slider
            class="w-[88px] min-w-[32px] shrink"
            [min]="0"
            [max]="1"
            [step]="0.001"
            [value]="zoomAt()"
            (valueChange)="setZoomAt($event)"
            [label]="t('editor.sound.zoom')"
            compact
            hideLabel
          />
          <button
            ncButton
            variant="ghost"
            size="sm"
            iconOnly
            class="shrink-0"
            [attr.aria-label]="t('editor.sound.zoomIn')"
            (click)="stepZoom(1)"
          >
            <nc-icon name="zoom-in" [size]="24" />
          </button>
          <button
            type="button"
            class="control-type w-[38px] shrink-0 text-right font-mono text-ink-3 hover:text-ink"
            [attr.aria-label]="t('editor.sound.zoomReset')"
            (click)="sound.setZoom(1)"
          >
            ×{{ zoomLabel() }}
          </button>
        </div>
        @if (instrument(); as inst) {
          <nc-instrument-inspector
            [inst]="inst"
            [palette]="palette()"
            [usedBy]="usedBy()"
            [samples]="library.samples()"
            (patched)="library.updateInstrument(inst.id, $event)"
            (sampleChange)="library.setSample($event.id, $event.pcm)"
          />
        } @else {
          <p class="label m-auto max-w-[220px] text-center text-ink-4">
            {{ t('editor.sound.noInstrument') }}
          </p>
        }
      </nc-panel-column>
    </div>
  `,
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
  protected readonly String = String;
  private readonly backend = new WebAudioBackend();
  private readonly engine = new SoundEngine(this.backend, this.session.game);
  /**
   * Which of the two transports is running.
   *
   * A chain and the pattern in front of you are two things to listen to, and a single button could
   * not be both: a pattern that a music happens to use would have no way to be heard on its own.
   */
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
  private readonly paletteVersion = signal(0);
  private raf = 0;

  protected readonly palette = computed(() => {
    this.paletteVersion();
    return this.session.game.palette;
  });
  protected readonly instrumentList = computed(() => [...this.library.instruments().values()]);
  protected readonly patternList = computed(() => [...this.library.patterns().values()]);
  protected readonly instrument = computed<Instrument | null>(() => {
    const id = this.sound.instrumentId();
    return (id ? this.library.instruments().get(id) : null) ?? this.instrumentList()[0] ?? null;
  });
  /**
   * The pattern at the number in the field, made up on the spot when the document holds none.
   *
   * Every number is a pattern and most of them hold nothing; a pattern that holds nothing is one
   * nobody is using, so there is nothing to create. The blank one is kept rather than rebuilt each
   * time the signal is read, because the roll edits the object it is handed.
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
  protected readonly usedBy = computed(() => {
    const inst = this.instrument();
    this.library.patterns();
    this.library.sfx();
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
    const game = this.session.game;
    this.undo = new Y.UndoManager([game.instruments, game.patterns, game.sfx], {
      trackedOrigins: new Set([LOCAL_ORIGIN, null]),
      captureTimeout: 300,
    });
    const onStack = (): void => {
      this.canUndo.set(this.undo.canUndo());
      this.canRedo.set(this.undo.canRedo());
    };
    this.undo.on('stack-item-added', onStack);
    this.undo.on('stack-item-popped', onStack);
    const unsubPalette = game.onPaletteChange(() => {
      this.paletteVersion.update((v) => v + 1);
    });
    inject(DestroyRef).onDestroy(() => {
      unsubPalette();
      cancelAnimationFrame(this.raf);
      this.engine.destroy();
      this.backend.destroy();
      this.undo.destroy();
      this.library.destroy();
      this.session.setCursor(null);
    });
    // Keep the selection pointing at an instrument that exists. The pattern needs no such care:
    // its number always names one.
    effect(() => {
      const inst = this.instrument();
      untracked(() => {
        if (inst && inst.id !== this.sound.instrumentId()) this.sound.selectInstrument(inst.id);
      });
    });
  }

  // ---- library --------------------------------------------------------------

  protected addInstrument(): void {
    this.sound.selectInstrument(this.library.addInstrument().id);
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
    this.library.removeInstrument(id);
    if (this.sound.instrumentId() === id) this.sound.selectInstrument(null);
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
    const made = defaultPattern(crypto.randomUUID().slice(0, 8), slot, `pattern ${pad(slot)}`);
    this.blanks.set(slot, made);
    return made;
  }

  /**
   * Writes to the pattern being shown, putting it in the document if it was not there yet.
   *
   * `updatePattern` alone cannot do it: it patches a pattern the document already holds, and a
   * blank one is not held anywhere until somebody writes into it.
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
          title: this.transloco.translate('editor.sound.clearTitle', { n: pad(p.slot) }),
          message: this.transloco.translate('editor.sound.clearMessage', { n: p.notes.length }),
          confirmLabel: this.transloco.translate('editor.sound.clear'),
          danger: true,
        },
      })
      .closed.subscribe((ok) => {
        if (ok) this.writePattern(p, { notes: [] });
      });
  }

  protected readonly pad = pad;

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

  protected snapLabel(off: string): string {
    const n = this.sound.snap();
    return n === 0 ? off : `1/${String(n)}`;
  }

  /** Off, then round the divisions and back to off — one control instead of a chip each. */
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

  /** The pattern in front of you, from wherever the head stands -- where PAUSE left it, or where
   * it was put in the ruler. */
  protected async play(): Promise<void> {
    const p = this.pattern();
    if (!p) return;
    await this.engine.unlock();
    this.engine.previewPattern(p, this.sound.loop(), this.playhead() ?? 0);
    this.playingWhat.set('pattern');
    this.tick();
  }

  /**
   * The whole chain, which is not the same thing as its patterns one after another: each link has
   * its own tempo and its own length, and where they meet is most of what there is to hear.
   */
  protected async playSong(): Promise<void> {
    await this.engine.unlock();
    this.engine.playMusic(this.sound.songSlot(), this.sound.loop(), 0);
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

  /** Halts where it is; the playhead stays so PLAY resumes from the same bar. */
  protected pause(): void {
    this.engine.stopMusic(0);
    this.playingWhat.set(null);
    cancelAnimationFrame(this.raf);
  }

  protected toStart(): void {
    const running = this.playing();
    this.playhead.set(0);
    if (running) void this.play();
  }

  protected stop(): void {
    this.pause();
    this.playhead.set(null);
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
    void this.engine.unlock().then(() => {
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
    void this.engine.unlock().then(() => {
      this.engine.preview(inst, e.pitch, 0, HELD_CHANNEL);
    });
  }

  protected releaseKey(): void {
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
    } else if (e.key === ' ') {
      e.preventDefault();
      if (this.playing()) this.stop();
      else void this.play();
    }
  }

  protected noteName(pitch: number): string {
    return midiToNoteName(pitch);
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
