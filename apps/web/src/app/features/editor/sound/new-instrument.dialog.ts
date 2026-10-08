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
  const x = (seconds: number): number => (seconds / total) * GRAPH_W;
  const y = (level: number): number => GRAPH_H - 1 - level * (GRAPH_H - 2);
  const attack = env.attack;
  const decayEnd = attack + env.decay;
  const holdEnd = decayEnd + hold;
  const points: [number, number][] = [
    [0, y(0)],
    [x(attack), y(1)],
    [x(decayEnd), y(env.sustain)],
    [x(holdEnd), y(env.sustain)],
    [GRAPH_W, y(0)],
  ];
  return points.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
};

/**
 * A new instrument: from a preset, browsed by family and heard before it is kept, or custom.
 * Nothing here writes to the document: the sound is played through the caller's preview, and the
 * choice comes back as the result.
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
  templateUrl: './new-instrument.dialog.html',
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
    return INSTRUMENT_PRESETS.filter((preset) => shelf === 'all' || preset.family === shelf).map(
      (preset) => ({
        ...preset,
        points: envelopePoints(preset.settings.env),
      }),
    );
  });

  protected choose(preset: InstrumentPresetEntry): void {
    this.chosen.set(preset);
    this.data.play(preset.settings, preset.note);
  }

  protected create(): void {
    const preset = this.chosen();
    if (preset) {
      this.ref.close({ kind: 'preset', preset });
    }
  }
}
