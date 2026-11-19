import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  signal,
} from '@angular/core';

import { mark } from './selection-styles';

/**
 * A choice that stands on its own, against a switch, which turns something on.
 *
 * The box is drawn rather than taken from the glyph set: its mark is a square that fills in steps.
 */
@Component({
  selector: 'nc-checkbox',
  templateUrl: './checkbox.component.html',
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckboxComponent {
  readonly checked = model(false);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly label = input<string>();

  private readonly pressed = signal(false);
  protected readonly markClass = computed(() => mark(this.checked(), this.pressed()));

  protected toggle(): void {
    this.pressed.set(true);
    this.checked.set(!this.checked());
  }
}
