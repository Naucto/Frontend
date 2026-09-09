import { UpperCasePipe } from '@angular/common';
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
import { TranslocoDirective } from '@jsverse/transloco';
import {
  defaultInstrument,
  type Instrument,
  LOCAL_ORIGIN,
  midiToNoteName,
  type Note,
  type Pattern,
  SoundEngine,
  VOICES,
  WebAudioBackend,
} from '@naucto/engine';
import {
  ButtonDirective,
  DialogService,
  EmptyStateComponent,
  IconComponent,
  PanelColumnComponent,
  PopoverDirective,
  PopoverPanelComponent,
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
import { MAX_ZOOM, MIN_ZOOM, SNAP_DIVISIONS, type SnapDivision, SoundStore } from './sound.store';
import { SoundLibrary } from './sound-library';
import { VoicesLaneComponent } from './voices-lane.component';

const ZOOM_OCTAVES = Math.log2(MAX_ZOOM / MIN_ZOOM);

const STEP_OPTIONS = [
  { value: '16', label: '16' },
  { value: '32', label: '32' },
  { value: '64', label: '64' },
];

/** The tempos worth a chip; anything else is reachable by holding one and typing is not a thing. */
const BPM_OPTIONS = [90, 100, 110, 120, 124, 140, 160].map((n) => ({
  value: String(n),
  label: String(n),
}));

/** SOUND tab: instruments on the left, the piano roll in the middle, the inspector on the right. */
@Component({
  selector: 'nc-sound-tab-page',
  imports: [
    UpperCasePipe,
    TranslocoDirective,
    ButtonDirective,
    EmptyStateComponent,
    IconComponent,
    PanelColumnComponent,
    PopoverDirective,
    PopoverPanelComponent,
    SliderComponent,
    ToggleButtonComponent,
    InstrumentInspectorComponent,
    InstrumentListComponent,
    PianoRollComponent,
    OscilloscopeComponent,
    VoicesLaneComponent,
  ],
  template: `
    <div *transloco="let t" class="grid h-full grid-cols-[237px_minmax(0,1fr)_auto]">
      <aside class="min-h-0 border-r border-line bg-panel">
        <nc-instrument-list
          [list]="instrumentList()"
          [selectedId]="sound.instrumentId()"
          [palette]="palette()"
          [sfx]="library.sfx()"
          [patternId]="sound.patternId()"
          (selected)="sound.selectInstrument($event)"
          (add)="addInstrument()"
          (remove)="removeInstrument($event)"
          (duplicate)="duplicateInstrument($event)"
          (edit)="editInstrument($event)"
          (sfxToggle)="toggleSfx($event)"
        />
      </aside>

      <section class="flex min-h-0 flex-col">
        @if (pattern(); as p) {
          <header
            class="flex h-(--nc-bar-h) shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-panel px-2"
          >
            <button ncButton variant="secondary" size="sm" [ncPopover]="patterns">
              {{ t('editor.sound.pattern') | uppercase }} {{ patternIndex() }}
              <nc-icon name="chevron-down" [size]="24" />
            </button>
            <ng-template #patterns>
              <nc-popover-panel [title]="t('editor.sound.patterns')">
                <input
                  type="text"
                  [value]="p.name"
                  [attr.aria-label]="t('editor.sound.patternName')"
                  (change)="renamePattern($event)"
                  class="mb-1 w-full rounded-xs border border-line bg-inset px-1 py-0.5 text-ui text-ink outline-none focus:border-gold"
                />
                @for (q of patternList(); track q.id) {
                  <button
                    type="button"
                    class="flex w-full items-center gap-1 px-1 py-0.5 text-left text-body hover:bg-raised"
                    [class.text-gold-ink]="q.id === p.id"
                    (click)="sound.selectPattern(q.id)"
                  >
                    {{ q.name }}
                    <span class="label ml-auto text-ink-4">{{ q.notes.length }}</span>
                  </button>
                }
                <div class="mt-1 flex gap-1 border-t border-line pt-1">
                  <button ncButton variant="ghost" size="sm" (click)="addPattern()">
                    <nc-icon name="plus" [size]="24" />
                    {{ t('editor.sound.newPattern') }}
                  </button>
                  <button
                    ncButton
                    variant="ghost"
                    size="sm"
                    [disabled]="patternList().length < 2"
                    (click)="removePattern()"
                  >
                    <nc-icon name="trash" [size]="24" />
                    {{ t('editor.sound.removePattern') }}
                  </button>
                </div>
              </nc-popover-panel>
            </ng-template>
            <span class="flex-1"></span>
            <!-- Play, pause and an explicit stop that rewinds — pausing on the last bar and
                 pressing play again should not be the only way back to the start. -->
            <span class="flex items-center gap-0.5 rounded-sm border border-line bg-inset p-0.5">
              @if (playing()) {
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
            <!-- Label and value share one sunken box, as the sheet draws them: the pair reads as
                 something you can type into, and it fits where a strip of presets or a well with a
                 label beside it did not. Each is as wide as what it holds. -->
            <div class="shrink-0">
              <button
                type="button"
                class="flex h-4 items-center gap-1.25 rounded-xs border border-line bg-inset px-1.25 whitespace-nowrap"
                [ncPopover]="bpmMenu"
                [attr.aria-label]="t('editor.sound.bpm')"
              >
                <span class="label text-ink-3">{{ t('editor.sound.bpm') }}</span>
                <span class="font-mono text-body text-ink">{{ p.bpm }}</span>
              </button>
              <ng-template #bpmMenu>
                <nc-popover-panel>
                  @for (o of bpmOptions; track o.value) {
                    <button
                      type="button"
                      class="flex w-full items-center px-1 py-0.5 text-left font-mono text-body hover:bg-raised"
                      [class]="String(p.bpm) === o.value ? 'text-gold-ink' : 'text-ink'"
                      (click)="setBpm(o.value)"
                    >
                      {{ o.label }}
                    </button>
                  }
                </nc-popover-panel>
              </ng-template>
            </div>
            <div class="shrink-0">
              <button
                type="button"
                class="flex h-4 items-center gap-1.25 rounded-xs border border-line bg-inset px-1.25 whitespace-nowrap"
                [ncPopover]="stepMenu"
                [attr.aria-label]="t('editor.sound.steps')"
              >
                <span class="label text-ink-3">{{ t('editor.sound.steps') }}</span>
                <span class="font-mono text-body text-ink">{{ p.steps }}</span>
              </button>
              <ng-template #stepMenu>
                <nc-popover-panel>
                  @for (o of stepOptions; track o.value) {
                    <button
                      type="button"
                      class="flex w-full items-center px-1 py-0.5 text-left font-mono text-body hover:bg-raised"
                      [class]="String(p.steps) === o.value ? 'text-gold-ink' : 'text-ink'"
                      (click)="setSteps(o.value)"
                    >
                      {{ o.label }}
                    </button>
                  }
                </nc-popover-panel>
              </ng-template>
            </div>
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
  protected readonly library = new SoundLibrary(this.session.game);
  protected readonly undo: Y.UndoManager;
  protected readonly stepOptions = STEP_OPTIONS;
  protected readonly bpmOptions = BPM_OPTIONS;
  protected readonly String = String;
  private readonly backend = new WebAudioBackend();
  private readonly engine = new SoundEngine(this.backend, this.session.game);
  protected readonly playing = signal(false);
  /** Handed to the scope as a getter so it can pull at frame rate without a signal per frame. */
  protected readonly peaks = (): Float32Array => this.engine.peaks();
  protected readonly playhead = signal<number | null>(null);
  private resumeAfterSeek = false;
  protected readonly voices = signal<boolean[]>(Array.from({ length: VOICES }, () => false));
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
  protected readonly pattern = computed<Pattern | null>(() => {
    if (!this.instrumentList().length) return null;
    const id = this.sound.patternId();
    return (id ? this.library.patterns().get(id) : null) ?? this.patternList()[0] ?? null;
  });
  protected readonly patternIndex = computed(() => {
    const p = this.pattern();
    const i = p ? this.patternList().findIndex((q) => q.id === p.id) : 0;
    return String(Math.max(0, i)).padStart(2, '0');
  });
  protected readonly usedBy = computed(() => {
    const inst = this.instrument();
    this.library.patterns();
    this.library.sfx();
    return inst ? this.library.usedBy(inst.id) : { patterns: [], sfx: [] };
  });

  constructor() {
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
    // Keep the selection pointing at something that exists.
    effect(() => {
      const inst = this.instrument();
      const pat = this.pattern();
      untracked(() => {
        if (inst && inst.id !== this.sound.instrumentId()) this.sound.selectInstrument(inst.id);
        if (pat && pat.id !== this.sound.patternId()) this.sound.selectPattern(pat.id);
      });
    });
  }

  // ---- library --------------------------------------------------------------

  protected addInstrument(): void {
    const inst = this.library.addInstrument();
    if (!this.library.patterns().size) this.library.addPattern();
    this.sound.selectInstrument(inst.id);
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

  protected addPattern(): void {
    this.sound.selectPattern(this.library.addPattern().id);
  }

  protected removePattern(): void {
    const p = this.pattern();
    if (!p || this.patternList().length < 2) return;
    this.library.removePattern(p.id);
    this.sound.selectPattern(null);
  }

  protected renamePattern(e: Event): void {
    const p = this.pattern();
    const name = (e.target as HTMLInputElement).value.trim();
    if (p && name) this.library.updatePattern(p.id, { name });
  }

  protected setBpm(v: string | undefined): void {
    const p = this.pattern();
    const bpm = Number(v);
    if (p && bpm >= 40 && bpm <= 240) this.library.updatePattern(p.id, { bpm });
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
    this.library.updatePattern(p.id, { notes });
  }

  protected setSteps(v: string | undefined): void {
    const p = this.pattern();
    const steps = Number(v);
    if (!p || !(steps === 16 || steps === 32 || steps === 64)) return;
    const notes: Note[] = p.notes
      .filter((n) => n.step < steps)
      .map((n) => ({ ...n, length: Math.min(n.length, steps - n.step) }));
    this.library.updatePattern(p.id, { steps, notes });
  }

  protected toggleSfx(slot: number): void {
    const p = this.pattern();
    if (!p) return;
    const current = this.library.sfx().get(String(slot));
    this.library.assignSfx(slot, current === p.id ? null : p.id);
  }

  // ---- playback -------------------------------------------------------------

  protected async play(): Promise<void> {
    const p = this.pattern();
    if (!p) return;
    await this.engine.unlock();
    // From wherever the head stands, which is where PAUSE left it or where it was put in the ruler.
    this.engine.previewPattern(p, this.sound.loop(), this.playhead() ?? 0);
    this.playing.set(true);
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
    this.playing.set(false);
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
    // only means the end of the pattern once a position has been seen. A start that never arrives
    // therefore leaves the head where it is — which STOP answers, and a vanished head does not.
    let begun = false;
    const loop = (): void => {
      const pos = this.engine.musicPosition();
      this.voices.set(Array.from({ length: VOICES }, (_, i) => this.engine.isPlaying(i)));
      if (pos) {
        begun = true;
        this.playhead.set(pos.step);
        const p = this.pattern();
        if (this.sound.metronome() && p) {
          const beat = Math.floor(pos.step / p.stepsPerBeat);
          if (beat !== lastBeat) {
            lastBeat = beat;
            this.click(beat % 4 === 0);
          }
        }
      } else if (begun && this.playing() && this.playhead() !== null) {
        this.playing.set(false);
        this.playhead.set(null);
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
