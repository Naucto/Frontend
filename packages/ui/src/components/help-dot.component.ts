import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { TooltipDirective, tooltipPlainText } from './tooltip.directive';

/**
 * The small "?" square next to section labels; shows its text as a tooltip.
 *
 * Quiet on purpose: gold is what a screen leads with, and one of these sits beside every section
 * heading. Spending the loudest colour on the most repeated and least urgent mark on a panel leaves
 * nothing to lead with.
 */
@Component({
  selector: 'nc-help-dot',
  imports: [TooltipDirective],
  template: `
    <button
      type="button"
      [ncTooltip]="text()"
      [tooltipTitle]="title()"
      [attr.aria-label]="plain()"
      class="inline-flex h-[18px] w-[18px] items-center justify-center rounded-sm border border-line-strong bg-line font-mono text-label text-ink-3 hover:bg-raised hover:text-ink"
    >
      ?
    </button>
  `,
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HelpDotComponent {
  /** Paragraphs apart by a blank line, identifiers in backticks — see `tooltipParagraphs`. */
  readonly text = input.required<string>();
  /** The section the dot sits beside, so the bubble says what it is about before it says more. */
  readonly title = input<string>();
  protected readonly plain = computed(() => tooltipPlainText(this.text()));
}
