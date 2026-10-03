import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type Instrument } from '@naucto/engine';
import {
  ButtonDirective,
  HelpDotComponent,
  IconComponent,
  type SlotCell,
  SlotGridComponent,
  slotRange,
  TooltipDirective,
} from '@naucto/ui';

import { WaveGlyphComponent } from './wave-glyph.component';

const COLUMNS = 4;

/** Left column of the SOUND tab: the instruments and the bank of sound effects. */
@Component({
  selector: 'nc-instrument-list',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    IconComponent,
    HelpDotComponent,
    TooltipDirective,
    SlotGridComponent,
    WaveGlyphComponent,
  ],
  templateUrl: './instrument-list.component.html',
  host: { class: 'block min-h-0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstrumentListComponent {
  readonly list = input.required<Instrument[]>();
  readonly selectedId = input<string | null>(null);
  readonly palette = input.required<readonly string[]>();
  readonly sfx = input.required<Map<string, string>>();
  readonly patternId = input<string | null>(null);
  readonly selected = output<string>();
  readonly add = output();
  readonly remove = output<string>();
  readonly duplicate = output<string>();
  readonly edit = output<string>();
  readonly sfxToggle = output<number>();
  private readonly transloco = inject(TranslocoService);

  /**
   * The bank, which reaches as far as the highest slot anybody has used and one row further.
   *
   * There is no last slot: a game may put a sound effect at any number it likes, and the row of
   * free cells at the end is where the next one goes.
   */
  protected readonly cells = computed<SlotCell[]>(() => {
    const assigned = this.sfx();
    const current = this.patternId();
    const taken = [...assigned.keys()]
      .map(Number)
      .filter((slot) => Number.isInteger(slot) && slot >= 0);
    return slotRange(taken, COLUMNS).map((slot) => {
      const pid = assigned.get(String(slot));
      return {
        n: slot,
        state: !pid ? 'empty' : pid === current ? 'current' : 'filled',
        label: this.transloco.translate('editor.sound.sfxSlot', { n: slot }),
      };
    });
  });
}
