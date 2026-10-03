import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Label + control + hint/error/counter wrapper. Put the control in the default slot. */
@Component({
  selector: 'nc-field',
  templateUrl: './field.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldComponent {
  readonly label = input.required<string>();
  readonly for = input<string>();
  readonly hint = input<string>();
  readonly error = input<string>();
  readonly counter = input<string>();
}
