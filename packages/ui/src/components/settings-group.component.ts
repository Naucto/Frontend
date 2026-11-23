import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * A titled group of settings: a short title at the size of its rows, an optional line under it,
 * then the rows in one block on alternate bands. `danger` sets the title in the hot colour.
 */
@Component({
  selector: 'nc-settings-group',
  templateUrl: './settings-group.component.html',
  host: { class: 'block min-w-0' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsGroupComponent {
  readonly title = input.required<string>();
  readonly hint = input<string>();
  readonly danger = input(false, { transform: booleanAttribute });
}
