import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  ButtonDirective,
  EdgeHandleComponent,
  EmptyStateComponent,
  IconComponent,
  TooltipDirective,
} from '@naucto/ui';

import { SoundHelpComponent } from '../controls/sound-help.component';
import { InstrumentInspectorComponent } from '../instrument-inspector.component';
import { InstrumentListComponent } from '../instrument-list.component';
import { KeyStripComponent } from '../key-strip.component';
import { OscilloscopeComponent } from '../oscilloscope.component';
import { SoundDeck } from '../sound-deck';
import { SoundPeersComponent } from '../sound-peers.component';
import { WaveGlyphComponent } from '../wave-glyph.component';

@Component({
  selector: 'nc-instrument-editor',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    EdgeHandleComponent,
    EmptyStateComponent,
    IconComponent,
    InstrumentInspectorComponent,
    InstrumentListComponent,
    OscilloscopeComponent,
    KeyStripComponent,
    SoundPeersComponent,
    SoundHelpComponent,
    WaveGlyphComponent,
    TooltipDirective,
  ],
  templateUrl: './instrument-editor.component.html',
  host: { class: 'relative flex h-full min-h-0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstrumentEditorComponent {
  protected readonly deck = inject(SoundDeck);
  protected readonly store = this.deck.store;
  protected readonly folded = computed(() => this.store.folded().includes('instruments'));

  protected press(pitch: number): void {
    const inst = this.deck.instrument();
    if (inst) {
      this.deck.holdKey({ instrument: inst.id, pitch });
    }
  }
}
