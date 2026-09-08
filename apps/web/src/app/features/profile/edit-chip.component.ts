import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '@naucto/ui';

/**
 * The pencil that surfaces on a zone you own.
 *
 * It appears on hover and on keyboard focus, because a control only a mouse can find is a control
 * half the people using this cannot reach. Its parent carries `group` and `relative`; the chip
 * places itself against that corner.
 */
@Component({
  selector: 'nc-edit-chip',
  imports: [IconComponent],
  template: `
    <button
      type="button"
      class="flex items-center gap-1 rounded-xs border border-line-strong bg-panel/85 px-[10px] py-[5px] label text-ink opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      [attr.aria-label]="label()"
      [attr.title]="label()"
    >
      <nc-icon name="edit" [size]="12" />
      @if (caption()) {
        <span>{{ caption() }}</span>
      }
    </button>
  `,
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditChipComponent {
  readonly label = input.required<string>();
  /** Shown beside the pencil where the zone is large enough to carry a word. */
  readonly caption = input<string>();
}
