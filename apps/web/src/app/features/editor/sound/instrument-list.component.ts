import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { type Instrument } from '@naucto/engine';
import {
  ButtonDirective,
  ChangeChipComponent,
  MarkComponent,
  type PresenceDot,
  PresenceDotsComponent,
  TooltipDirective,
} from '@naucto/ui';

import { DiffStore } from '../diff/diff.store';
import { WaveGlyphComponent } from './wave-glyph.component';

/** The instruments, listed beside the editors that paint or tune with them. */
@Component({
  selector: 'nc-instrument-list',
  imports: [
    ChangeChipComponent,
    TranslocoDirective,
    ButtonDirective,
    MarkComponent,
    PresenceDotsComponent,
    TooltipDirective,
    WaveGlyphComponent,
  ],
  templateUrl: './instrument-list.component.html',
  host: { class: 'block min-h-0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstrumentListComponent {
  readonly list = input.required<Instrument[]>();
  protected readonly diff = inject(DiffStore);
  readonly selectedId = input<string | null>(null);
  readonly palette = input.required<readonly string[]>();
  readonly peersOf = input<(id: string) => readonly PresenceDot[]>(() => []);
  readonly selected = output<string>();
  readonly add = output();
  readonly remove = output<string>();
  readonly duplicate = output<string>();
  readonly edit = output<string>();
}
