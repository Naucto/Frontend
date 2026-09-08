import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent, type IconName } from '@naucto/ui';

/**
 * One action on a zone you own, surfacing on hover.
 *
 * It also appears on keyboard focus, because a control only a mouse can find is a control half the
 * people using this cannot reach. Its parent carries `group` and `relative`; the chip places
 * itself against that corner.
 */
@Component({
  selector: 'nc-edit-chip',
  imports: [IconComponent],
  template: `
    <button
      type="button"
      class="flex size-[26px] items-center justify-center rounded-xs border border-line-strong bg-panel/85 text-ink opacity-0 transition-opacity group-hover:opacity-100 hover:bg-raised focus-visible:opacity-100"
      [attr.aria-label]="label()"
      [attr.title]="label()"
    >
      <nc-icon [name]="icon()" [size]="12" />
    </button>
  `,
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditChipComponent {
  readonly label = input.required<string>();
  readonly icon = input<IconName>('edit');
}
