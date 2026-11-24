import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ActionInput } from '@naucto/engine';
import { KeycapComponent, type KeycapSize, MarkComponent, PadCapComponent } from '@naucto/ui';

import { legendOf } from './input-legend';

/** One input an action is plugged with, as the key or the gamepad control a player presses. */
@Component({
  selector: 'nc-input-cap',
  imports: [KeycapComponent, MarkComponent, PadCapComponent, TranslocoPipe],
  templateUrl: './input-cap.component.html',
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InputCapComponent {
  readonly input = input.required<ActionInput>();
  readonly size = input<KeycapSize>('md');
  protected readonly legend = computed(() => legendOf(this.input()));
}
