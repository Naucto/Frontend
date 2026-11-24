import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  signal,
} from '@angular/core';

import { closedBy } from './disabled-scope.directive';
import { RANGE_INPUT, RANGE_THUMB, RANGE_THUMB_SLOT, RANGE_TRACK } from './selection-styles';

const KEY_STEPS: Record<string, number> = {
  ArrowRight: 1,
  ArrowUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1,
  Home: -Infinity,
  End: Infinity,
};

/**
 * Discrete slider with one label per step under the track. Value is the step index.
 *
 * The thumb follows the pointer between two stops and settles on the nearest when let go, so the
 * range underneath is continuous and the keys are stepped by hand.
 */
@Component({
  selector: 'nc-stepper',
  templateUrl: './stepper.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StepperComponent {
  readonly value = model(0);
  readonly options = input.required<readonly string[]>();
  readonly label = input<string>();
  readonly disabled = input(false, { transform: booleanAttribute });
  protected readonly closed = closedBy(() => this.disabled());

  protected readonly track = RANGE_TRACK;
  protected readonly range = RANGE_INPUT;
  protected readonly thumbSlot = RANGE_THUMB_SLOT;
  protected readonly thumb = RANGE_THUMB;

  /** Where the thumb is held between two stops, while it is. */
  protected readonly drag = signal<number | null>(null);
  protected readonly last = computed(() => Math.max(1, this.options().length - 1));
  protected readonly position = computed(() => this.drag() ?? this.value());

  protected percent(step: number): number {
    return (step / this.last()) * 100;
  }

  protected onInput(event: Event): void {
    const held = Number((event.target as HTMLInputElement).value);
    this.drag.set(held);
    this.value.set(Math.round(held));
  }

  protected onKey(event: KeyboardEvent): void {
    const step = KEY_STEPS[event.key];
    if (step === undefined) {
      return;
    }
    event.preventDefault();
    this.drag.set(null);
    this.value.set(Math.max(0, Math.min(this.last(), this.value() + step)));
  }
}
