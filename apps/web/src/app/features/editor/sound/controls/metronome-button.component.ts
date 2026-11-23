import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  ButtonDirective,
  IconComponent,
  PopoverDirective,
  PopoverPanelComponent,
  SegmentedComponent,
  type SegmentOption,
  SliderComponent,
  ToggleButtonComponent,
  ToggleComponent,
} from '@naucto/ui';

import { METRONOME_DIVISIONS, type MetronomeDivision, SoundStore } from '../sound.store';

const DIVISION_LABEL: Record<MetronomeDivision, string> = { 1: '1/4', 2: '1/8', 4: '1/16' };

@Component({
  selector: 'nc-metronome-button',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    IconComponent,
    PopoverDirective,
    PopoverPanelComponent,
    SegmentedComponent,
    SliderComponent,
    ToggleButtonComponent,
    ToggleComponent,
  ],
  templateUrl: './metronome-button.component.html',
  host: { class: 'flex shrink-0 items-center' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetronomeButtonComponent {
  protected readonly store = inject(SoundStore);
  protected readonly divisions: SegmentOption<string>[] = METRONOME_DIVISIONS.map((division) => ({
    value: String(division),
    label: DIVISION_LABEL[division],
  }));
  protected readonly showHelp = signal(false);
  protected readonly division = computed(() => String(this.store.metronomeSettings().division));

  protected setDivision(value: string | undefined): void {
    const division = METRONOME_DIVISIONS.find((each) => String(each) === value);
    if (division) {
      this.store.setMetronomeSettings({ division });
    }
  }
}
