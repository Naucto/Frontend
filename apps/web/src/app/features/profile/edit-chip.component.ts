import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent, type IconName } from '@naucto/ui';

/**
 * One action on a zone you own.
 *
 * Expects a parent that both places it and opens the group it hides behind — it has no box of its
 * own. It comes out for a keyboard too, because a control only a mouse can find is a control half
 * the people using this cannot reach.
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
