import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent, type IconName } from '@naucto/ui';

/**
 * One action on a zone you own. Expects a `group` parent that places it — its host has no box — and
 * shows on that parent's hover or on its own keyboard focus.
 */
@Component({
  selector: 'nc-edit-chip',
  imports: [IconComponent],
  templateUrl: './edit-chip.component.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditChipComponent {
  readonly label = input.required<string>();
  readonly icon = input<IconName>('edit');
}
