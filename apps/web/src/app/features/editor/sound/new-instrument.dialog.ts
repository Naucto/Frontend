import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  type Envelope,
  INSTRUMENT_PRESETS,
  type InstrumentPreset,
  type InstrumentPresetEntry,
  PRESET_FAMILIES,
  type PresetFamily,
} from '@naucto/engine';
import { ButtonDirective, DialogShellComponent, IconComponent } from '@naucto/ui';

import { WaveGlyphComponent } from './wave-glyph.component';

export interface NewInstrumentDialogData {
  /** Sounds a preset before it is kept, at the note the preset is written for. */
  play: (settings: InstrumentPreset, note: number) => void;
}

export type NewInstrumentResult =
  { kind: 'custom' } | { kind: 'preset'; preset: InstrumentPresetEntry } | undefined;

type Shelf = PresetFamily | 'all';

const GRAPH_W = 72;
const GRAPH_H = 20;

/**
 * The envelope as a polyline. Attack, decay and release share the width in proportion to their
 * seconds, with a fixed hold between decay and release so a sustained sound reads as a plateau
 * and a plucked one as a spike.
 */
const envelopePoints = (env: Envelope): string => {
  const hold = 0.25;
  const total = env.attack + env.decay + hold + env.release || 1;
  const x = (t: number): number => (t / total) * GRAPH_W;
  const y = (level: number): number => GRAPH_H - 1 - level * (GRAPH_H - 2);
  const a = env.attack;
  const d = a + env.decay;
  const h = d + hold;
  const points: [number, number][] = [
    [0, y(0)],
    [x(a), y(1)],
    [x(d), y(env.sustain)],
    [x(h), y(env.sustain)],
    [GRAPH_W, y(0)],
  ];
  return points.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
};

/**
 * A new instrument: from a preset, browsed by family and heard before it is kept, or custom.
 *
 * One dialog for both, at one height: the choice and the shelves of presets are steps of the
 * same box, so choosing does not swap one window for another. A name says less about a sound
 * than the shape of its wave and its envelope do, and nothing at all next to hearing it, so a
 * card plays on click. Nothing here writes to the document: the sound is played through the
 * caller's preview, and the choice comes back as the result.
 */
@Component({
  selector: 'nc-new-instrument-dialog',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    DialogShellComponent,
    IconComponent,
    WaveGlyphComponent,
  ],
  template: `
    <nc-dialog-shell
      *transloco="let t"
      [title]="t('editor.sound.newInstrument')"
      [lead]="
        t(step() === 'choice' ? 'editor.sound.newInstrumentLead' : 'editor.sound.presetsLead')
      "
    >
      <div class="h-[min(56vh,420px)]">
        @if (step() === 'choice') {
          <div class="grid h-full grid-cols-2 content-center gap-2 px-2">
            <button
              type="button"
              class="flex flex-col items-start gap-1 rounded-sm border border-line p-2 text-left hover:border-gold hover:bg-raised"
              (click)="step.set('preset')"
            >
              <nc-icon name="music" [size]="24" class="text-gold-ink" />
              <span class="text-ui text-ink">{{ t('editor.sound.fromPreset') }}</span>
              <span class="text-meta leading-[1.5] text-ink-3">
                {{ t('editor.sound.fromPresetHint') }}
              </span>
            </button>
            <button
              type="button"
              class="flex flex-col items-start gap-1 rounded-sm border border-line p-2 text-left hover:border-gold hover:bg-raised"
              (click)="ref.close({ kind: 'custom' })"
            >
              <nc-icon name="sliders" [size]="24" class="text-ink-3" />
              <span class="text-ui text-ink">{{ t('editor.sound.custom') }}</span>
              <span class="text-meta leading-[1.5] text-ink-3">
                {{ t('editor.sound.customHint') }}
              </span>
            </button>
          </div>
        } @else {
          <div class="flex h-full gap-2">
            <div
              role="tablist"
              [attr.aria-label]="t('editor.sound.families')"
              class="flex w-[104px] shrink-0 flex-col gap-0.5"
            >
              @for (s of shelves; track s) {
                <button
                  type="button"
                  role="tab"
                  [attr.aria-selected]="shelf() === s"
                  class="rounded-sm border px-1 py-0.75 text-left font-mono text-label tracking-tag uppercase"
                  [class]="
                    shelf() === s
                      ? 'border-gold bg-raised text-ink'
                      : 'border-transparent text-ink-3 hover:bg-raised hover:text-ink'
                  "
                  (click)="shelf.set(s)"
                >
                  {{ t('editor.sound.family.' + s) }}
                </button>
              }
            </div>
            <div
              role="radiogroup"
              [attr.aria-label]="t('editor.sound.presets')"
              class="grid h-full min-w-0 flex-1 grid-cols-2 content-start gap-1 overflow-y-auto pr-0.5"
            >
              @for (p of shown(); track p.name) {
                <!-- Clicking a card plays it, since the sound is what is being chosen; clicking
                     the chosen one again plays it again. -->
                <button
                  type="button"
                  role="radio"
                  [attr.aria-checked]="chosen()?.name === p.name"
                  [attr.aria-label]="p.name"
                  class="flex flex-col gap-0.75 rounded-sm border p-1 text-left"
                  [class]="
                    chosen()?.name === p.name
                      ? 'border-gold bg-raised'
                      : 'border-line hover:border-line-strong hover:bg-raised'
                  "
                  (click)="choose(p)"
                >
                  <span class="flex w-full items-center gap-1">
                    <nc-wave-glyph
                      [type]="p.settings.osc"
                      [width]="24"
                      [class]="chosen()?.name === p.name ? 'text-gold-ink' : 'text-ink-3'"
                    />
                    <span class="min-w-0 flex-1 truncate text-ui text-ink">{{ p.name }}</span>
                    <svg
                      [attr.width]="graphW"
                      [attr.height]="graphH"
                      [attr.viewBox]="'0 0 ' + graphW + ' ' + graphH"
                      aria-hidden="true"
                      class="shrink-0 text-jade"
                    >
                      <polyline
                        [attr.points]="p.points"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.5"
                      />
                    </svg>
                  </span>
                  <span class="text-meta leading-[1.5] text-ink-3">{{ p.blurb }}</span>
                </button>
              }
            </div>
          </div>
        }
      </div>
      <ng-container footer>
        @if (step() === 'preset') {
          <button ncButton variant="ghost" (click)="step.set('choice')">
            {{ t('editor.sound.back') }}
          </button>
          <span class="flex-1"></span>
        }
        <button ncButton variant="ghost" (click)="ref.close()">
          {{ t('editor.code.cancel') }}
        </button>
        @if (step() === 'preset') {
          <button ncButton variant="primary" [disabled]="!chosen()" (click)="create()">
            {{ t('editor.sound.create') }}
          </button>
        }
      </ng-container>
    </nc-dialog-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewInstrumentDialog {
  protected readonly data = inject<NewInstrumentDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<NewInstrumentResult>>(DialogRef);
  protected readonly graphW = GRAPH_W;
  protected readonly graphH = GRAPH_H;
  protected readonly shelves: readonly Shelf[] = ['all', ...PRESET_FAMILIES];

  protected readonly step = signal<'choice' | 'preset'>('choice');
  protected readonly shelf = signal<Shelf>('all');
  protected readonly chosen = signal<InstrumentPresetEntry | null>(null);
  protected readonly shown = computed(() => {
    const shelf = this.shelf();
    return INSTRUMENT_PRESETS.filter((p) => shelf === 'all' || p.family === shelf).map((p) => ({
      ...p,
      points: envelopePoints(p.settings.env),
    }));
  });

  protected choose(p: InstrumentPresetEntry): void {
    this.chosen.set(p);
    this.data.play(p.settings, p.note);
  }

  protected create(): void {
    const preset = this.chosen();
    if (preset) this.ref.close({ kind: 'preset', preset });
  }
}
