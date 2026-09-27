import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  type AudioAnalysis,
  chipInstrument,
  convertMidi,
  encodeSample,
  type Instrument,
  INSTRUMENT_PRESETS,
  MAX_SAMPLE_SECONDS,
  type MidiImport,
  type MidiInstrument,
  type ParsedMidi,
  type Pattern,
  type Quality,
  readMidi,
  scoreImport,
  scoreSample,
  toSampleBytes,
  transcribe,
  writeMidi,
} from '@naucto/engine';
import {
  ButtonDirective,
  CheckboxComponent,
  DialogShellComponent,
  FieldComponent,
  InputDirective,
  NoticeComponent,
} from '@naucto/ui';

export interface MidiImportDialogData {
  /** Song slots with nothing in them, the only places a song import may go. */
  freeSongSlots: number[];
  /** SFX slots with nothing in them. */
  freeSfxSlots: number[];
  /** Pattern slots already taken, which the import steps around. */
  takenPatternSlots: number[];
  maxPatternSlot: number;
}

export type ImportTarget = 'song' | 'sfx' | 'sample';

export type MidiImportResult =
  | { target: 'song' | 'sfx'; slot: number; conversion: MidiImport; patternSlots: number[] }
  | {
      target: 'sample';
      slot: number;
      sample: { id: string; data: string };
      instrument: Instrument;
      pattern: Pattern;
    };

const AUDIO = /\.(mp3|wav|ogg|oga|flac|m4a|aac|webm|opus)$/i;

/**
 * Brings a MIDI file or a recording into the SOUND tab as native, editable sound.
 *
 * A recording is transcribed in the browser — no upload, no model — into notes, then converted
 * like a MIDI file; short sounds can instead become a sample. Either way the estimated quality
 * loss is shown before anything is written. A person's own import is not AI provenance.
 */
@Component({
  selector: 'nc-midi-import-dialog',
  imports: [
    FormsModule,
    TranslocoDirective,
    ButtonDirective,
    CheckboxComponent,
    DialogShellComponent,
    FieldComponent,
    InputDirective,
    NoticeComponent,
  ],
  template: `
    <nc-dialog-shell *transloco="let t" [title]="t('editor.midi.title')">
      <p class="mb-1 text-body text-ink-2">{{ t('editor.midi.blurb') }}</p>
      <input
        type="file"
        accept=".mid,.midi,audio/midi,audio/*,.mp3,.wav,.ogg,.flac,.m4a"
        [attr.aria-label]="t('editor.midi.file')"
        (change)="load($event)"
      />
      @if (busy()) {
        <p role="status" class="mt-1 text-meta text-ink-2">{{ t('editor.midi.analysing') }}</p>
      }
      @if (error()) {
        <nc-notice tone="danger" role="alert" class="mt-1">{{ error() }}</nc-notice>
      }
      @if (parsed(); as p) {
        @if (isAudio()) {
          <div class="mt-1 grid grid-cols-3 gap-1">
            <nc-field
              [label]="t('editor.midi.polyphony')"
              for="audio-voices"
              [hint]="t('editor.midi.polyphonyHint')"
            >
              <select
                ncInput
                id="audio-voices"
                [(ngModel)]="listen"
                (ngModelChange)="retranscribe()"
              >
                @for (n of [1, 2, 3, 4, 5, 6]; track n) {
                  <option [ngValue]="n">{{ n }}</option>
                }
              </select>
            </nc-field>
            <nc-field [label]="t('editor.midi.sensitivity')" for="audio-sensitivity">
              <input
                ncInput
                id="audio-sensitivity"
                type="range"
                min="0"
                max="100"
                [(ngModel)]="sensitivity"
                (change)="retranscribe()"
              />
            </nc-field>
            <nc-checkbox
              class="self-end"
              [checked]="drums"
              (checkedChange)="drums = $event; retranscribe()"
            >
              {{ t('editor.midi.detectDrums') }}
            </nc-checkbox>
          </div>
        }
        <nc-field [label]="t('editor.midi.target')" for="import-target" class="mt-1">
          <select
            ncInput
            id="import-target"
            [ngModel]="target()"
            (ngModelChange)="setTarget($event)"
          >
            <option value="song">{{ t('editor.midi.asSong') }}</option>
            <option value="sfx">{{ t('editor.midi.asSfx') }}</option>
            @if (isAudio()) {
              <option value="sample">{{ t('editor.midi.asSample') }}</option>
            }
          </select>
        </nc-field>
        @if (target() !== 'sample') {
          <h3 class="mt-1.5 label">{{ t('editor.midi.tracks') }}</h3>
          <ul>
            @for (track of p.tracks; track track.index) {
              @if (track.notes.length) {
                <li class="flex flex-wrap items-center gap-1 py-0.25 text-meta">
                  <nc-checkbox
                    [checked]="selected().includes(track.index)"
                    (checkedChange)="toggle(track.index, $event)"
                  >
                    {{ track.name }} · {{ t('editor.midi.notes', { count: track.notes.length }) }}
                    @if (track.percussion) {
                      · {{ t('editor.midi.drums') }}
                    }
                  </nc-checkbox>
                  <select
                    ncInput
                    class="w-[180px]"
                    [attr.aria-label]="t('editor.midi.instrumentFor', { name: track.name })"
                    [ngModel]="voice()[track.index] ?? ''"
                    (ngModelChange)="setVoice(track.index, $event)"
                  >
                    <option value="">{{ t('editor.midi.chipVoice') }}</option>
                    @for (preset of presets; track preset.name) {
                      <option [value]="preset.name">{{ preset.name }} ({{ preset.family }})</option>
                    }
                  </select>
                </li>
              }
            }
          </ul>
          <div class="mt-1 grid grid-cols-3 gap-1">
            <nc-field
              [label]="t('editor.midi.voices')"
              for="midi-voices"
              [hint]="t('editor.midi.voicesHint')"
            >
              <select ncInput id="midi-voices" [(ngModel)]="voices" (ngModelChange)="invalidate()">
                @for (n of [1, 2, 3, 4, 5]; track n) {
                  <option [ngValue]="n">{{ n }}</option>
                }
              </select>
            </nc-field>
            <nc-field [label]="t('editor.midi.reduce')" for="midi-strategy">
              <select
                ncInput
                id="midi-strategy"
                [(ngModel)]="strategy"
                (ngModelChange)="invalidate()"
              >
                <option value="outer">{{ t('editor.midi.outer') }}</option>
                <option value="first">{{ t('editor.midi.first') }}</option>
              </select>
            </nc-field>
            <nc-field [label]="t('editor.midi.bpm')" for="midi-bpm">
              <input
                ncInput
                id="midi-bpm"
                type="number"
                min="40"
                max="240"
                [(ngModel)]="bpm"
                (ngModelChange)="invalidate()"
              />
            </nc-field>
          </div>
        }
        <nc-field
          [label]="t(target() === 'song' ? 'editor.midi.songSlot' : 'editor.midi.sfxSlot')"
          for="midi-slot"
          class="mt-1"
        >
          <select ncInput id="midi-slot" [(ngModel)]="slot">
            @for (s of slots(); track s) {
              <option [ngValue]="s">{{ s }}</option>
            }
          </select>
        </nc-field>
        <div class="mt-1 flex flex-wrap gap-1">
          <button ncButton variant="secondary" size="sm" (click)="convert()">
            {{ t('editor.midi.convert') }}
          </button>
          @if (isAudio()) {
            <button ncButton variant="ghost" size="sm" (click)="downloadMidi()">
              {{ t('editor.midi.download') }}
            </button>
          }
        </div>
        @if (quality(); as q) {
          <div class="mt-1 border border-line p-1 text-meta" data-testid="midi-report">
            <p class="text-ui" data-testid="quality-loss">
              {{ t('editor.midi.loss', { loss: q.loss, fidelity: q.fidelity }) }}
            </p>
            @if (target() !== 'sample') {
              <p class="text-ink-3">
                {{ t('editor.midi.lossParts', { harmony: q.harmony, rhythm: q.rhythm }) }}
              </p>
            }
            @if (conversion(); as c) {
              <p>
                {{
                  t('editor.midi.report', {
                    imported: c.report.importedNotes,
                    source: c.report.sourceNotes,
                    dropped: c.report.droppedNotes,
                    quantized: c.report.quantizedNotes,
                    patterns: c.patterns.length,
                    peak: c.report.peakVoices,
                  })
                }}
              </p>
              @for (warning of c.report.warnings; track warning) {
                <p class="text-ink-3">· {{ warning }}</p>
              }
            }
            @if (sampleBytes(); as bytes) {
              <p>
                {{ t('editor.midi.sampleReport', { bytes: bytes, seconds: maxSampleSeconds }) }}
              </p>
            }
          </div>
        }
      }
      <ng-container footer>
        <button ncButton variant="ghost" (click)="ref.close()">
          {{ t('editor.midi.cancel') }}
        </button>
        <button ncButton variant="primary" [disabled]="!ready()" (click)="import()">
          {{ t('editor.midi.import') }}
        </button>
      </ng-container>
    </nc-dialog-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MidiImportDialog {
  protected readonly data = inject<MidiImportDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<MidiImportResult | undefined>>(DialogRef);
  private readonly i18n = inject(TranslocoService);
  protected readonly presets = INSTRUMENT_PRESETS;
  protected readonly maxSampleSeconds = MAX_SAMPLE_SECONDS;
  protected readonly parsed = signal<ParsedMidi | null>(null);
  protected readonly isAudio = signal(false);
  protected readonly target = signal<ImportTarget>('song');
  protected readonly selected = signal<number[]>([]);
  protected readonly voice = signal<Record<number, string>>({});
  protected readonly conversion = signal<MidiImport | null>(null);
  protected readonly quality = signal<Quality | null>(null);
  protected readonly sampleBytes = signal(0);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected voices = 4;
  protected strategy: 'outer' | 'first' = 'outer';
  protected bpm = 120;
  protected listen = 4;
  protected sensitivity = 50;
  protected drums = true;
  protected slot = this.data.freeSongSlots[0] ?? -1;
  private audio: { channels: Float32Array[]; rate: number } | null = null;
  private analysis: AudioAnalysis | null = null;
  private sample: Int8Array | null = null;
  private name = 'import';

  protected readonly slots = computed(() =>
    this.target() === 'song' ? this.data.freeSongSlots : this.data.freeSfxSlots,
  );
  protected readonly ready = computed(
    () =>
      !!this.quality() && (!!this.conversion() || !!this.sampleBytes()) && this.slots().length > 0,
  );

  protected async load(event: Event): Promise<void> {
    this.error.set('');
    this.parsed.set(null);
    this.invalidate();
    this.audio = null;
    this.analysis = null;
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.name = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'import';
    const bytes = new Uint8Array(await file.arrayBuffer());
    const midi = bytes[0] === 0x4d && bytes[1] === 0x54 && bytes[2] === 0x68 && bytes[3] === 0x64;
    this.isAudio.set(!midi && (AUDIO.test(file.name) || file.type.startsWith('audio/')));
    try {
      if (midi) this.adopt(readMidi(bytes));
      else {
        this.busy.set(true);
        // Chrome decodes anything it can play: mp3, wav, ogg, flac, aac.
        const context = new OfflineAudioContext(1, 1, 44100);
        const decoded = await context.decodeAudioData(bytes.buffer);
        this.audio = {
          channels: Array.from({ length: decoded.numberOfChannels }, (_, i) =>
            decoded.getChannelData(i),
          ),
          rate: decoded.sampleRate,
        };
        // Short recordings are sound effects far more often than songs.
        if (decoded.duration <= 2) this.setTarget('sfx');
        await this.retranscribe();
      }
    } catch (error) {
      this.error.set(
        error instanceof Error && error.message
          ? error.message
          : this.i18n.translate('editor.midi.unreadable'),
      );
    } finally {
      this.busy.set(false);
    }
  }

  private adopt(parsed: ParsedMidi): void {
    this.parsed.set(parsed);
    this.selected.set(parsed.tracks.filter((t) => t.notes.length).map((t) => t.index));
    this.bpm = Math.min(240, Math.max(40, Math.round(parsed.bpm)));
  }

  /** Runs the analysis again with the listening settings; a frame first, so the status shows. */
  protected async retranscribe(): Promise<void> {
    const audio = this.audio;
    if (!audio) return;
    this.busy.set(true);
    this.invalidate();
    await new Promise((resolve) => setTimeout(resolve, 20));
    try {
      const result = transcribe(audio.channels, audio.rate, {
        voices: this.listen,
        sensitivity: this.sensitivity / 100,
        drums: this.drums,
      });
      this.analysis = result.analysis;
      this.adopt(result.midi);
    } catch (error) {
      this.parsed.set(null);
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected setTarget(target: ImportTarget): void {
    this.target.set(target);
    this.slot = this.slots()[0] ?? -1;
    this.invalidate();
  }

  protected invalidate(): void {
    this.conversion.set(null);
    this.quality.set(null);
    this.sampleBytes.set(0);
    this.sample = null;
  }

  protected toggle(index: number, on: boolean): void {
    this.selected.update((list) => (on ? [...list, index] : list.filter((i) => i !== index)));
    this.invalidate();
  }

  protected setVoice(index: number, name: string): void {
    this.voice.update((all) => ({ ...all, [index]: name }));
    this.invalidate();
  }

  private instruments(parsed: ParsedMidi): Record<number, Omit<MidiInstrument, 'id'>> {
    const out: Record<number, Omit<MidiInstrument, 'id'>> = {};
    for (const track of parsed.tracks) {
      const preset = this.presets.find((p) => p.name === this.voice()[track.index]);
      const base = chipInstrument(track.name.slice(0, 40), track.percussion);
      if (preset)
        out[track.index] = {
          ...base,
          ...(preset.settings as Partial<MidiInstrument>),
          name: track.name.slice(0, 40),
        };
    }

    return out;
  }

  /** The first free pattern slots, in order. */
  private freePatternSlots(count: number): number[] {
    const taken = new Set(this.data.takenPatternSlots);
    const out: number[] = [];
    for (let slot = 0; slot <= this.data.maxPatternSlot && out.length < count; slot++)
      if (!taken.has(slot)) out.push(slot);
    if (out.length < count) throw new Error(this.i18n.translate('editor.midi.noSlots'));

    return out;
  }

  protected convert(): void {
    const parsed = this.parsed();
    if (!parsed) return;
    this.error.set('');
    this.invalidate();
    try {
      if (this.target() === 'sample') {
        const audio = this.audio;
        if (!audio || !this.analysis) return;
        this.sample = toSampleBytes(audio.channels, audio.rate);
        this.sampleBytes.set(this.sample.length);
        this.quality.set(scoreSample(this.analysis, this.sample.length / 8000));
        return;
      }
      let conversion = convertMidi(parsed, {
        prefix: `imp-${crypto.randomUUID().slice(0, 8)}`,
        voices: this.target() === 'sfx' ? Math.min(this.voices, 2) : this.voices,
        strategy: this.strategy,
        bpm: this.bpm,
        tracks: this.selected(),
        instruments: this.instruments(parsed),
      });
      if (this.target() === 'sfx') {
        // An effect is one pattern: keep the start of it and say so.
        const first = conversion.patterns[0];
        if (!first) throw new Error(this.i18n.translate('editor.midi.nothing'));
        if (conversion.patterns.length > 1)
          conversion = {
            ...conversion,
            patterns: [first],
            song: { ...conversion.song, sequence: [first.id] },
            report: {
              ...conversion.report,
              warnings: [
                ...conversion.report.warnings,
                this.i18n.translate('editor.midi.sfxTrimmed'),
              ],
            },
          };
      }
      this.conversion.set(conversion);
      this.quality.set(
        this.analysis ? scoreImport(this.analysis, conversion) : this.midiQuality(conversion),
      );
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    }
  }

  /** A MIDI file's loss is what the conversion dropped: notes missing, weighted like an audio score. */
  private midiQuality(conversion: MidiImport): Quality {
    const kept = conversion.report.sourceNotes
      ? conversion.report.importedNotes / conversion.report.sourceNotes
      : 1;
    const onGrid = conversion.report.importedNotes
      ? 1 - (0.5 * conversion.report.quantizedNotes) / conversion.report.importedNotes
      : 1;
    const harmony = Math.round(100 * kept),
      rhythm = Math.round(100 * kept * onGrid);
    const fidelity = Math.round(0.65 * harmony + 0.35 * rhythm);

    return { fidelity, loss: 100 - fidelity, harmony, rhythm };
  }

  protected downloadMidi(): void {
    const parsed = this.parsed();
    if (!parsed) return;
    const chosen = {
      ...parsed,
      tracks: parsed.tracks.filter((t) => this.selected().includes(t.index)),
      bpm: this.bpm,
    };
    const url = URL.createObjectURL(
      new Blob([Uint8Array.from(writeMidi(chosen))], { type: 'audio/midi' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.name}.mid`;
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  protected import(): void {
    try {
      const target = this.target();
      if (target === 'sample') {
        if (!this.sample) return;
        const id = `smp-${crypto.randomUUID().slice(0, 8)}`;
        const instrument: Instrument = {
          ...chipInstrument(this.name, false),
          id: `${id}-i`,
          osc: 'sample',
          sampleId: id,
          sampleRoot: 60,
          env: { attack: 0, decay: 0, sustain: 1, release: 0.01 },
          volume: 0.8,
        };
        const steps = Math.min(
          64,
          Math.max(16, Math.ceil(((this.sample.length / 8000) * 8) / 16) * 16),
        );
        const [patternSlot = 0] = this.freePatternSlots(1);
        this.ref.close({
          target,
          slot: this.slot,
          sample: { id, data: encodeSample(this.sample) },
          instrument,
          pattern: {
            id: `${id}-p`,
            slot: patternSlot,
            name: this.name,
            bpm: 120,
            stepsPerBeat: 4,
            steps,
            notes: [{ step: 0, pitch: 60, length: steps, instrument: instrument.id, volume: 1 }],
          },
        });
        return;
      }
      const conversion = this.conversion();
      if (!conversion) return;
      this.ref.close({
        target,
        slot: this.slot,
        conversion,
        patternSlots: this.freePatternSlots(conversion.patterns.length),
      });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    }
  }
}
