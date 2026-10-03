import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  encodeSample,
  type FilterType,
  type Instrument,
  MAX_SAMPLE_SECONDS,
  midiToNoteName,
  type OscType,
  type Pattern,
  SAMPLE_RATE,
  toSampleBytes,
} from '@naucto/engine';
import {
  ButtonDirective,
  ChipComponent,
  HelpDotComponent,
  IconComponent,
  SegmentedComponent,
  SliderComponent,
} from '@naucto/ui';

import { PresenceSurfaceComponent } from '../work-session/presence-surface.component';
import { EnvelopeGraphComponent } from './envelope-graph.component';
import { pad2 } from './sound-library';
import { WaveGlyphComponent } from './wave-glyph.component';

const OSCS: { value: OscType; label: string }[] = [
  { value: 'square', label: 'Square' },
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Tri' },
  { value: 'saw', label: 'Saw' },
  { value: 'noise', label: 'Noise' },
  { value: 'sample', label: 'PCM' },
];

/**
 * Longest attack, decay or release an instrument may be given, in seconds.
 *
 * A pad wants a second or more to open, and the slider's square curve keeps the short end usable:
 * half the travel is still under a quarter of the range.
 */
const ENV_MAX = 3;

const FILTERS = [
  { value: 'off', label: 'Off' },
  { value: 'lp', label: 'LP' },
  { value: 'hp', label: 'HP' },
  { value: 'bp', label: 'BP' },
];

/** Right panel of the SOUND tab: everything about one instrument. */
@Component({
  selector: 'nc-instrument-inspector',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    ChipComponent,
    HelpDotComponent,
    IconComponent,
    SegmentedComponent,
    SliderComponent,
    EnvelopeGraphComponent,
    WaveGlyphComponent,
    PresenceSurfaceComponent,
  ],
  templateUrl: './instrument-inspector.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstrumentInspectorComponent {
  readonly inst = input.required<Instrument>();
  readonly palette = input.required<readonly string[]>();
  readonly usedBy = input.required<{ patterns: Pattern[]; sfx: number[] }>();
  readonly patched = output<Partial<Instrument>>();
  /** Base64 PCM keyed by sample id — the game document's own `samples` map. */
  readonly samples = input.required<Map<string, string>>();
  /** Emitted with the encoded PCM (or null to drop it); the library owns the document write. */
  readonly sampleChange = output<string | null>();
  protected readonly oscs = OSCS;
  protected readonly ENV_MAX = ENV_MAX;
  protected readonly filters = FILTERS;
  protected readonly envKeys = ['attack', 'decay', 'sustain', 'release'] as const;
  protected readonly maxSampleSeconds = MAX_SAMPLE_SECONDS;
  protected readonly sampleError = signal<{
    key: string;
    params?: Record<string, unknown>;
  } | null>(null);
  protected readonly sampleName = computed(() => this.inst().sampleId ?? null);
  /** "0.6 s · 4.8 KB" — what the sample costs, since the budget is the reason it is capped. */
  protected readonly sampleMeta = computed(() => {
    const id = this.inst().sampleId;
    const encoded = id ? this.samples().get(id) : undefined;
    if (!encoded) return '';
    const bytes = Math.floor((encoded.length * 3) / 4);
    return `${(bytes / SAMPLE_RATE).toFixed(1)} s · ${(bytes / 1024).toFixed(1)} KB`;
  });

  protected noteName(midi: number): string {
    return midiToNoteName(midi);
  }

  /** Left/up and right/down cycle the oscillator, wrapping at the ends. */
  protected onOscKey(e: KeyboardEvent): void {
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const at = OSCS.findIndex((o) => o.value === this.inst().osc);
    const next = OSCS[(at + step + OSCS.length) % OSCS.length];
    if (next) this.patched.emit({ osc: next.value });
  }

  /**
   * Decoded by the browser, so any format it can play is accepted, then normalised to the console's
   * sample format.
   */
  protected async onSampleFile(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.sampleError.set(null);
    try {
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
      const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) =>
        decoded.getChannelData(i),
      );
      const pcm = toSampleBytes(channels, decoded.sampleRate);
      void ctx.close();
      if (!pcm.length) {
        this.sampleError.set({ key: 'editor.sound.sampleEmpty' });
        return;
      }
      if (decoded.duration > MAX_SAMPLE_SECONDS) {
        this.sampleError.set({
          key: 'editor.sound.sampleTrimmed',
          params: { seconds: MAX_SAMPLE_SECONDS },
        });
      }
      this.sampleChange.emit(encodeSample(pcm));
    } catch {
      this.sampleError.set({ key: 'editor.sound.sampleUndecodable' });
    }
  }

  protected clearSample(): void {
    this.sampleChange.emit(null);
  }

  /** "+3 st" reads as a pitch offset; a bare number reads as anything. */
  protected semis(n: number): string {
    return `${n > 0 ? '+' : ''}${String(n)} st`;
  }

  protected ms(seconds: number): string {
    return seconds ? `${String(Math.round(seconds * 1000))} ms` : 'OFF';
  }

  protected vib(patch: Partial<Instrument['vibrato']>): void {
    this.patched.emit({ vibrato: { ...this.inst().vibrato, ...patch } });
  }
  protected env(patch: Partial<Instrument['env']>): void {
    this.patched.emit({ env: { ...this.inst().env, ...patch } });
  }
  protected filter(patch: Partial<Instrument['filter']>): void {
    this.patched.emit({ filter: { ...this.inst().filter, ...patch } });
  }
  protected arp(rate: number): void {
    this.patched.emit({ arp: { rate } });
  }
  protected asFilter(v: string | undefined): FilterType {
    return v === 'lp' || v === 'hp' || v === 'bp' ? v : 'off';
  }
  protected pct(v: number): string {
    return `${String(Math.round(v * 100))}%`;
  }
  protected dec(v: number): string {
    return v.toFixed(2);
  }
  protected hz(v: number): string {
    return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
  }
  protected db(v: number): string {
    return v <= 0 ? '-inf' : `${(20 * Math.log10(v)).toFixed(0)} dB`;
  }
  protected panLabel(v: number): string {
    return Math.abs(v) < 0.05
      ? 'C'
      : v < 0
        ? `L${String(Math.round(-v * 100))}`
        : `R${String(Math.round(v * 100))}`;
  }
  protected readonly pad = pad2;
  protected envReadout(k: 'attack' | 'decay' | 'sustain' | 'release'): string {
    const v = this.inst().env[k];
    if (k === 'sustain') return this.pct(v);
    return v >= 1 ? `${v.toFixed(2)} s` : `${String(Math.round(v * 1000))} ms`;
  }
  /** Seconds → 0..100 on a square curve so short times get room. */
  protected toSlider(seconds: number, max: number): number {
    return Math.sqrt(Math.max(0, seconds) / max) * 100;
  }
  protected fromSlider(v: number, max: number): number {
    return Math.round((v / 100) ** 2 * max * 1000) / 1000;
  }
  protected cutToSlider(hz: number): number {
    return (Math.log(Math.max(100, hz) / 100) / Math.log(120)) * 100;
  }
  protected cutFromSlider(v: number): number {
    return Math.round(100 * Math.pow(120, v / 100));
  }
}
