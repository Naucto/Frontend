import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { type Instrument } from '@naucto/engine';
import {
  ButtonDirective,
  IconComponent,
  type PresenceDot,
  PresenceDotsComponent,
  TooltipDirective,
} from '@naucto/ui';

import { WaveGlyphComponent } from './wave-glyph.component';

/** The instruments, listed beside the editors that paint or tune with them. */
@Component({
  selector: 'nc-instrument-list',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    IconComponent,
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
  readonly selectedId = input<string | null>(null);
  readonly palette = input.required<readonly string[]>();
  readonly peersOf = input<(id: string) => readonly PresenceDot[]>(() => []);
  readonly selected = output<string>();
  readonly add = output();
  readonly remove = output<string>();
  readonly duplicate = output<string>();
  readonly edit = output<string>();
}
