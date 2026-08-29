import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Visual shell for popover content: raised surface, optional uppercase title row. */
@Component({
  selector: 'nc-popover-panel',
  template: `
    @if (title()) {
      <header class="flex h-4 items-center justify-between border-b border-line px-2">
        <span class="label">{{ title() }}</span>
        <ng-content select="[actions]" />
      </header>
    }
    <ng-content />
  `,
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
}
