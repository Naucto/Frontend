import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Visual shell for popover content: a large flat frame over a pixel shadow, optional title row. */
@Component({
  selector: 'nc-popover-panel',
  templateUrl: './popover-panel.component.html',
  host: {
    role: 'dialog',
    class:
      'flat-lg bevel-fill-panel block min-w-[240px] [filter:drop-shadow(0_6px_0_var(--nc-well))]',
    '[attr.aria-label]': 'title()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PopoverPanelComponent {
  readonly title = input<string>();
  /** Keep the title with this off: the panel's accessible name comes from it, not from the row. */
  readonly header = input(true);
}
