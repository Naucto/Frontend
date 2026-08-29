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
import { WaveGlyphComponent } from './wave-glyph.component';

const OSCS: { value: OscType; label: string }[] = [
  { value: 'square', label: 'Square' },
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Tri' },
  { value: 'saw', label: 'Saw' },
  { value: 'noise', label: 'Noise' },
  { value: 'sample', label: 'PCM' },
];
/** Palette slots offered as instrument colours: gold, sky, orange, blush, jade, hot. */
const COLOURS = [4, 11, 3, 6, 13, 7];
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
  template: `
    <div *transloco="let t" class="relative">
      <!-- Shared: everyone editing this instrument sees the same envelope and the same filter, so
           where a peer's pointer is says what they are about to change. -->
      <nc-presence-surface surface="sound:inspector" mode="shared" />
      <div class="flex items-center gap-1 border-b border-line p-1.5">
        <nc-wave-glyph [type]="inst().osc" [width]="26" [style.color]="palette()[inst().colour]" />
        <input
          type="text"
          [value]="inst().name"
          maxlength="16"
          spellcheck="false"
          [attr.aria-label]="t('editor.sound.name')"
          (change)="rename($event)"
          class="min-w-0 flex-1 bg-transparent text-ui text-ink outline-none focus:text-gold-ink"
        />
        <button ncButton variant="ghost" size="sm" (click)="duplicate.emit()">
          {{ t('editor.sound.duplicate') }}
        </button>
      </div>

      <div class="flex items-center gap-1 border-b border-line p-1.5">
        <span class="label text-ink-3">{{ t('editor.sound.colour') }}</span>
        <span class="flex-1"></span>
        @for (c of colours; track c) {
          <!-- 22px, and the selection is an outline *outside* the swatch: an inset border eats
               the very colour you are choosing. -->
          <button
            type="button"
            class="h-[22px] w-[22px] rounded-xs outline-offset-2"
            [class]="inst().colour === c ? 'outline-2 outline-ink' : ''"
            [style.background]="palette()[c]"
            [attr.aria-label]="t('editor.sound.colourN', { n: c })"
            [attr.aria-pressed]="inst().colour === c"
            (click)="patched.emit({ colour: c })"
          ></button>
        }
      </div>

      <section class="border-b border-line p-1.5">
        <div class="mb-1 flex items-center justify-between">
          <span class="label text-ink-3">{{ t('editor.sound.oscillator') }}</span>
          <nc-help-dot [text]="t('editor.sound.oscHelp')" />
        </div>
        <div class="grid grid-cols-3 gap-0.5" role="radiogroup">
          @for (o of oscs; track o.value) {
            <button
              type="button"
              role="radio"
              [attr.aria-checked]="inst().osc === o.value"
              class="flex h-[55px] flex-col items-center justify-center gap-0.5 rounded-xs border border-line bg-inset text-ink-3 hover:text-ink aria-checked:border-gold aria-checked:bg-line aria-checked:text-gold-ink"
              (click)="patched.emit({ osc: o.value })"
            >
              <nc-wave-glyph [type]="o.value" [width]="44" />
              <!-- Type utilities, not the label class: that one hardcodes its own colour, so the
                   selected card's gold never reached the word and only the border changed. -->
              <span class="font-mono text-micro tracking-wide uppercase">{{ o.label }}</span>
            </button>
          }
        </div>
        <div class="mt-1 grid gap-0.5">
          @if (inst().osc === 'square') {
            <nc-slider
              label="DUTY"
              [min]="5"
              [max]="95"
              [value]="inst().duty * 100"
              [readout]="pct(inst().duty)"
              (valueChange)="patched.emit({ duty: $event / 100 })"
            />
          }
          @if (inst().osc === 'sample') {
            <!-- PCM: pick a file, and the engine mono-mixes and resamples it down to the
                 console's own 8-bit / 8kHz budget. Anything longer than the budget is cut. -->
            <div class="rounded-sm border border-line bg-inset p-1">
              <div class="flex items-center gap-1">
                <label ncButton variant="secondary" size="sm" class="cursor-pointer">
                  {{ sampleName() ? t('editor.sound.replaceSample') : t('editor.sound.addSample') }}
                  <input
                    type="file"
                    accept="audio/*"
                    class="sr-only"
                    (change)="onSampleFile($event)"
                  />
                </label>
                <span class="flex-1"></span>
                @if (sampleName()) {
                  <span class="label">{{ sampleMeta() }}</span>
                  <button
                    ncButton
                    variant="ghost"
                    size="sm"
                    iconOnly
                    [attr.aria-label]="t('editor.sound.removeSample')"
                    (click)="clearSample()"
                  >
                    <nc-icon name="close" [size]="12" />
                  </button>
                }
              </div>
              @if (sampleError(); as err) {
                <p class="mt-0.5 text-meta text-hot-ink">{{ err }}</p>
              } @else if (!sampleName()) {
                <p class="mt-0.5 text-meta text-ink-4">
                  {{ t('editor.sound.sampleHint', { seconds: maxSampleSeconds }) }}
                </p>
              }
            </div>
            <nc-slider
              label="ROOT"
              [min]="24"
              [max]="95"
              [value]="inst().sampleRoot ?? 60"
              [readout]="noteName(inst().sampleRoot ?? 60)"
              (valueChange)="patched.emit({ sampleRoot: $event })"
            />
          }
          <!-- Detune sits with the oscillator because it is a property of the tone, not of the
               note: every note this instrument plays is shifted by it. -->
          <nc-slider
            label="DETUNE"
            [min]="-12"
            [max]="12"
            [value]="inst().detune"
            [readout]="semis(inst().detune)"
            accent="sky"
            (valueChange)="patched.emit({ detune: $event })"
          />
          <nc-slider
            label="GLIDE"
            [max]="500"
            [step]="5"
            [value]="inst().glide * 1000"
            [readout]="ms(inst().glide)"
            accent="sky"
            (valueChange)="patched.emit({ glide: $event / 1000 })"
          />
        </div>
      </section>

      <section class="border-b border-line p-1.5">
        <div class="mb-1 flex items-center justify-between">
          <span class="label text-ink-3">{{ t('editor.sound.envelope') }}</span>
          <nc-help-dot [text]="t('editor.sound.envHelp')" />
        </div>
        <nc-envelope-graph [env]="inst().env" (envChange)="env($event)" />
        <div class="mt-1 grid grid-cols-4 gap-1 text-center">
          @for (k of envKeys; track k) {
            <div>
              <div class="font-mono text-meta text-ink">{{ envReadout(k) }}</div>
              <div class="label text-ink-4">{{ k }}</div>
            </div>
          }
        </div>
        <div class="mt-1 grid gap-0.5">
          <nc-slider
            label="A"
            compact
            [min]="0"
            [max]="100"
            [value]="toSlider(inst().env.attack, 1)"
            (valueChange)="env({ attack: fromSlider($event, 1) })"
            accent="jade"
          />
          <nc-slider
            label="D"
            compact
            [min]="0"
            [max]="100"
            [value]="toSlider(inst().env.decay, 1)"
            (valueChange)="env({ decay: fromSlider($event, 1) })"
            accent="jade"
          />
          <nc-slider
            label="S"
            compact
            [min]="0"
            [max]="100"
            [value]="inst().env.sustain * 100"
            (valueChange)="env({ sustain: $event / 100 })"
            accent="jade"
          />
          <nc-slider
            label="R"
            compact
            [min]="0"
            [max]="100"
            [value]="toSlider(inst().env.release, 2)"
            (valueChange)="env({ release: fromSlider($event, 2) })"
            accent="jade"
          />
        </div>
      </section>

      <section class="border-b border-line p-1.5">
        <div class="mb-1 flex items-center justify-between">
          <span class="label text-ink-3">{{ t('editor.sound.modFilter') }}</span>
          <nc-help-dot [text]="t('editor.sound.modHelp')" />
        </div>
        <div class="grid gap-0.5">
          <nc-slider
            label="VIB"
            [min]="0"
            [max]="100"
            [value]="inst().vibrato.depth * 100"
            [readout]="dec(inst().vibrato.depth)"
            accent="hot"
            (valueChange)="vib({ depth: $event / 100 })"
          />
          <nc-slider
            label="RATE"
            [min]="1"
            [max]="20"
            [value]="inst().vibrato.rate"
            [readout]="inst().vibrato.rate + ' Hz'"
            accent="hot"
            (valueChange)="vib({ rate: $event })"
          />
          <nc-slider
            label="ARP"
            [min]="0"
            [max]="30"
            [value]="inst().arp.steps.length ? inst().arp.rate : 0"
            [readout]="inst().arp.steps.length ? inst().arp.rate + ' Hz' : 'OFF'"
            accent="hot"
            (valueChange)="arp($event)"
          />
          <div class="flex items-center gap-1.5">
            <span class="label w-[6ch] shrink-0">FILT</span>
            <nc-segmented
              [options]="filters"
              [value]="inst().filter.type"
              (valueChange)="filter({ type: asFilter($event) })"
              size="sm"
            />
          </div>
          <nc-slider
            label="CUT"
            [min]="0"
            [max]="100"
            [value]="cutToSlider(inst().filter.cutoff)"
            [readout]="hz(inst().filter.cutoff)"
            accent="sky"
            (valueChange)="filter({ cutoff: cutFromSlider($event) })"
          />
          <nc-slider
            label="RES"
            [min]="0"
            [max]="100"
            [value]="inst().filter.resonance * 100"
            [readout]="dec(inst().filter.resonance)"
            accent="sky"
            (valueChange)="filter({ resonance: $event / 100 })"
          />
        </div>
      </section>

      <section class="border-b border-line p-1.5">
        <div class="mb-1 flex items-center justify-between">
          <span class="label text-ink-3">{{ t('editor.sound.mix') }}</span>
          <nc-help-dot [text]="t('editor.sound.mixHelp')" />
        </div>
        <div class="grid gap-0.5">
          <nc-slider
            label="VOL"
            [min]="0"
            [max]="100"
            [value]="inst().volume * 100"
            [readout]="db(inst().volume)"
            (valueChange)="patched.emit({ volume: $event / 100 })"
          />
          <nc-slider
            label="PAN"
            [min]="-100"
            [max]="100"
            [value]="inst().pan * 100"
            [readout]="panLabel(inst().pan)"
            (valueChange)="patched.emit({ pan: $event / 100 })"
          />
        </div>
      </section>

      <section class="p-1.5">
        <div class="mb-1 flex items-center justify-between">
          <span class="label text-ink-3">{{ t('editor.sound.usedBy') }}</span>
          <span class="label text-ink-4">
            {{
              t('editor.sound.usedByCount', { p: usedBy().patterns.length, s: usedBy().sfx.length })
            }}
          </span>
        </div>
        <div class="flex flex-wrap gap-0.5">
          @for (p of usedBy().patterns; track p.id) {
            <nc-chip>{{ p.name }}</nc-chip>
          }
          @for (s of usedBy().sfx; track s) {
            <nc-chip>SFX {{ pad(s) }}</nc-chip>
          }
          @if (!usedBy().patterns.length) {
            <span class="text-meta text-ink-4">{{ t('editor.sound.unused') }}</span>
          }
        </div>
      </section>
    </div>
  `,
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstrumentInspectorComponent {
  readonly inst = input.required<Instrument>();
  readonly palette = input.required<readonly string[]>();
  readonly usedBy = input.required<{ patterns: Pattern[]; sfx: number[] }>();
  readonly patched = output<Partial<Instrument>>();
  readonly duplicate = output();
  /** Base64 PCM keyed by sample id — the game document's own `samples` map. */
  readonly samples = input.required<Map<string, string>>();
  /** Emitted with the encoded PCM (or null to drop it); the library owns the document write. */
  readonly sampleChange = output<{ id: string; pcm: string | null }>();
  protected readonly oscs = OSCS;
  protected readonly colours = COLOURS;
  protected readonly filters = FILTERS;
  protected readonly envKeys = ['attack', 'decay', 'sustain', 'release'] as const;
  protected readonly envValues = computed(() => this.inst().env);
  protected readonly maxSampleSeconds = MAX_SAMPLE_SECONDS;
  protected readonly sampleError = signal<string | null>(null);
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

  /**
   * Decode with the browser, then hand the engine's codec the raw channels. `decodeAudioData`
   * takes anything Chrome can play — wav, mp3, ogg — so the author does not have to convert
   * first, and everything is normalised to the console's own 8-bit / 8kHz shape on the way in.
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
        this.sampleError.set('That file decoded to nothing.');
        return;
      }
      if (decoded.duration > MAX_SAMPLE_SECONDS) {
        this.sampleError.set(
          `Trimmed to the first ${String(MAX_SAMPLE_SECONDS)} s — that is the whole budget.`,
        );
      }
      const id = this.inst().sampleId ?? `${this.inst().id}-pcm`;
      this.sampleChange.emit({ id, pcm: encodeSample(pcm) });
      this.patched.emit({ sampleId: id, sampleRoot: this.inst().sampleRoot ?? 60 });
    } catch {
      this.sampleError.set('Could not decode that file.');
    }
  }

  protected clearSample(): void {
    const id = this.inst().sampleId;
    if (id) this.sampleChange.emit({ id, pcm: null });
    this.patched.emit({ sampleId: undefined });
  }

  protected rename(e: Event): void {
    const name = (e.target as HTMLInputElement).value.trim();
    if (name) this.patched.emit({ name });
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
    this.patched.emit({ arp: rate > 0 ? { steps: [0, 4, 7], rate } : { steps: [], rate: 15 } });
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
  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }
  protected envReadout(k: 'attack' | 'decay' | 'sustain' | 'release'): string {
    const v = this.inst().env[k];
    return k === 'sustain' ? this.pct(v) : `${String(Math.round(v * 1000))} ms`;
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
