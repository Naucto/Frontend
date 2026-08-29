import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { TooltipDirective } from './tooltip.directive';

/** The small "?" square next to section labels; shows its text as a tooltip. */
@Component({
  selector: 'nc-help-dot',
  imports: [TooltipDirective],
  template: `
    <button
      type="button"
      [ncTooltip]="text()"
      [attr.aria-label]="text()"
      class="inline-flex h-[18px] w-[18px] items-center justify-center rounded-sm border border-gold bg-line font-mono text-label text-gold-ink hover:bg-raised"
    >
      ?
    </button>
  `,
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpDotComponent {
  readonly text = input.required<string>();
}
