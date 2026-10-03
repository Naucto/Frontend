import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Visual shell for popover content: raised surface, optional uppercase title row. */
@Component({
  selector: 'nc-popover-panel',
  templateUrl: './popover-panel.component.html',
  host: {
    role: 'dialog',
    class:
      'block min-w-[240px] rounded-md border border-line-strong bg-panel shadow-[0_4px_0_var(--nc-inset)]',
    '[attr.aria-label]': 'title()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PopoverPanelComponent {
  readonly title = input<string>();
  /** Keep the title with this off: the panel's accessible name comes from it, not from the row. */
  readonly header = input(true);
}
