import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * A titled group of settings: a short title at the size of its rows, an optional line under it,
 * then the rows in one framed block on alternate bands. `danger` sets the title in the hot colour.
 * `unframed` is for content that brings its own frame (a notice, a table), which a second frame
 * around it would only double.
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
  readonly unframed = input(false, { transform: booleanAttribute });
}
