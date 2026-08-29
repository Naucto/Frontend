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
  EmptyStateComponent,
  IconComponent,
  LcdComponent,
  PopoverDirective,
  PopoverPanelComponent,
  SegmentedComponent,
  ToggleButtonComponent,
} from '@naucto/ui';
import * as Y from 'yjs';

import { WorkSessionService } from '../work-session/work-session.service';
import { InstrumentInspectorComponent } from './instrument-inspector.component';
import { InstrumentListComponent } from './instrument-list.component';
import { OscilloscopeComponent } from './oscilloscope.component';
import { PianoRollComponent } from './piano-roll.component';
import { SNAP_DIVISIONS, type SnapDivision, SoundStore } from './sound.store';
import { SoundLibrary } from './sound-library';
import { VoicesLaneComponent } from './voices-lane.component';

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
    LcdComponent,
    PopoverDirective,
    PopoverPanelComponent,
    SegmentedComponent,
    ToggleButtonComponent,
    InstrumentInspectorComponent,
    InstrumentListComponent,
    PianoRollComponent,
    OscilloscopeComponent,
    VoicesLaneComponent,
  ],
  providers: [SoundStore],
  template: `
    <div
      *transloco="let t"
      class="grid h-full grid-cols-[236px_minmax(0,1fr)_236px] xl:grid-cols-[236px_minmax(0,1fr)_420px]"
    >
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
          (sfxToggle)="toggleSfx($event)"
        />
      </aside>

      <section class="flex min-h-0 flex-col">
        @if (pattern(); as p) {
          <header
            class="flex h-5 shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-panel px-2"
          >
            <button ncButton variant="secondary" size="sm" [ncPopover]="patterns">
              {{ t('editor.sound.pattern') | uppercase }} {{ patternIndex() }}
              <nc-icon name="chevron-down" [size]="12" />
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
                    <nc-icon name="plus" [size]="12" />
                    {{ t('editor.sound.newPattern') }}
                  </button>
                  <button
                    ncButton
                    variant="ghost"
                    size="sm"
                    [disabled]="patternList().length < 2"
                    (click)="removePattern()"
                  >
                    <nc-icon name="trash" [size]="12" />
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
                  <nc-icon name="pause" [size]="12" />
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
                  <nc-icon name="play" [size]="12" class="text-hot-ink" />
                </button>
              }
              <button
                ncButton
                variant="ghost"
                size="sm"
                iconOnly
                [attr.aria-label]="t('editor.sound.stop')"
                (click)="stop()"
                [disabled]="!playing() && playhead() === null"
              >
                <nc-icon name="stop" [size]="12" />
              </button>
            </span>
            <nc-toggle-button [checked]="sound.loop()" (checkedChange)="sound.setLoop($event)">
              <nc-icon name="repeat" [size]="12" />
              {{ t('editor.sound.loop') }}
            </nc-toggle-button>
            <nc-toggle-button
              [checked]="sound.metronome()"
              (checkedChange)="sound.setMetronome($event)"
              accent="jade"
            >
              <nc-icon name="metronome" [size]="12" />
              {{ t('editor.sound.metronome') }}
            </nc-toggle-button>
            <span class="flex-1"></span>
            <!-- BPM and STEPS are chip rows like every other exclusive choice in the design; the
                 bespoke number input this used to be broke the "compose the kit" rule. -->
            <!-- The chip rows wrap by default, which is right on a shelf header and wrong in a
                 40px strip: they have to keep their line and let the strip scroll instead. -->
            <div class="flex shrink-0 items-center gap-0.5">
              <span class="label">{{ t('editor.sound.bpm') }}</span>
              <nc-segmented
                variant="chips"
                [options]="bpmOptions"
                [value]="String(p.bpm)"
                (valueChange)="setBpm($event)"
                [label]="t('editor.sound.bpm')"
              />
            </div>
            <div class="flex shrink-0 items-center gap-0.5">
              <span class="label">{{ t('editor.sound.steps') }}</span>
              <nc-segmented
                variant="chips"
                [options]="stepOptions"
                [value]="String(p.steps)"
                (valueChange)="setSteps($event)"
                [label]="t('editor.sound.steps')"
              />
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
              <nc-icon name="undo" [size]="12" />
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
              <nc-icon name="redo" [size]="12" />
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
            (notesChange)="library.setNotes(p.id, $event)"
            (audition)="audition($event)"
            (hover)="onHover($event)"
          />
          <nc-voices-lane
            [pattern]="p"
            [instruments]="library.instruments()"
            [palette]="palette()"
            [zoom]="sound.zoom()"
            [stepWidth]="roll.stepW()"
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

      <aside class="flex min-h-0 flex-col overflow-auto border-l border-line bg-panel">
        <!-- The scope earns the top of the panel: it is the only place you see what the synth is
             actually doing, as opposed to what the pattern says it should. -->
        <nc-oscilloscope class="h-4 shrink-0 border-b border-line" [peaks]="peaks" />
        <div class="flex h-5 shrink-0 items-center gap-1 border-b border-line px-1.5">
          <nc-lcd class="w-[140px]" [minHeight]="24">
            <span class="flex items-center gap-0.5 whitespace-nowrap">
              @for (v of voices(); track $index) {
                <span
                  class="inline-block h-1.5 w-1"
                  [class]="v ? 'bg-lcd-ink' : 'bg-lcd-ink/25'"
                ></span>
              }
              <span class="ml-1">{{ t('editor.sound.liveOut') }}</span>
            </span>
          </nc-lcd>
          <!-- One button carrying its current resolution, not six chips: the row is 340px and
               the chips wrapped onto a second line, out of the bar and over the scope. -->
          <nc-toggle-button
            [checked]="sound.snap() !== 0"
            (checkedChange)="cycleSnap()"
            [label]="t('editor.sound.snap')"
          >
            <nc-icon name="grid" [size]="12" />
            {{ t('editor.sound.snap') }} {{ snapLabel() }}
          </nc-toggle-button>
          <span class="flex-1"></span>
          <button
            ncButton
            variant="ghost"
            size="sm"
            [attr.aria-label]="t('editor.sound.zoom')"
            (click)="sound.toggleZoom()"
          >
            <nc-icon name="zoom-in" [size]="12" />
            ×{{ sound.zoom() }}
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
            (duplicate)="duplicateInstrument(inst.id)"
          />
        } @else {
          <p class="label m-auto max-w-[220px] text-center text-ink-4">
            {{ t('editor.sound.noInstrument') }}
          </p>
        }
      </aside>
    </div>
  `,
  host: { class: 'block h-full', '(keydown)': 'onKey($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SoundTabPage {
  protected readonly session = inject(WorkSessionService);
  protected readonly sound = inject(SoundStore);
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

  /** The resolution the button is showing: `OFF`, or `1/8` for a division of 8. */
  protected readonly snapLabel = computed(() => {
    const n = this.sound.snap();
    return n === 0 ? 'OFF' : `1/${String(n)}`;
  });

  /** Off, then round the divisions and back to off — one control instead of six chips. */
  protected cycleSnap(): void {
    const order: SnapDivision[] = [0, ...SNAP_DIVISIONS];
    const i = order.indexOf(this.sound.snap());
    this.sound.setSnap(order[(i + 1) % order.length] ?? 0);
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
    this.engine.previewPattern(p, this.sound.loop());
    this.playing.set(true);
    this.tick();
  }

  /** Halts where it is; the playhead stays so PLAY resumes from the same bar. */
  protected pause(): void {
    this.engine.stopMusic(0);
    this.playing.set(false);
    cancelAnimationFrame(this.raf);
  }

  /** Halts and rewinds. */
  protected stop(): void {
    this.pause();
    this.playhead.set(null);
  }

  private tick(): void {
    cancelAnimationFrame(this.raf);
    let lastBeat = -1;
    const loop = (): void => {
      const pos = this.engine.musicPosition();
      this.voices.set(Array.from({ length: VOICES }, (_, i) => this.engine.isPlaying(i)));
      if (!pos && this.playing() && this.playhead() !== null) {
        this.playing.set(false);
        this.playhead.set(null);
        return;
      }
      if (pos) {
        this.playhead.set(pos.step);
        const p = this.pattern();
        if (this.sound.metronome() && p) {
          const beat = Math.floor(pos.step / p.stepsPerBeat);
          if (beat !== lastBeat) {
            lastBeat = beat;
            this.click(beat % 4 === 0);
          }
        }
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

  protected onHover(cell: { step: number; pitch: number } | null): void {
    this.session.setCursor(cell ? { tab: 'sound', x: cell.step, y: cell.pitch } : null);
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
