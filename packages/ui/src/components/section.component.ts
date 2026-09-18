import { booleanAttribute, ChangeDetectionStrategy, Component, input, model } from '@angular/core';

import { IconComponent } from './icon.component';

/** Label + divider used to split a panel body into groups (STATUS, MONETIZATION, LINEAGE). */
@Component({
  selector: 'nc-section',
  imports: [IconComponent],
  template: `
    <!-- As tall as a help dot whether or not one is projected, so stacked sections keep one
         rhythm instead of stepping 6px wherever a heading happens to explain itself. -->
    <div class="flex min-h-[18px] items-center justify-between gap-1">
      @if (collapsible()) {
        <button
          type="button"
          class="label flex items-center gap-0.5 hover:text-ink"
          [class.text-gold-ink]="tone() === 'gold'"
          [attr.aria-expanded]="open()"
          (click)="open.set(!open())"
        >
          <nc-icon [name]="open() ? 'chevron-down' : 'chevron-right'" [size]="12" />
          {{ title() }}
        </button>
      } @else {
        <span class="label" [class.text-gold-ink]="tone() === 'gold'">{{ title() }}</span>
      }
      <ng-content select="[actions]" />
    </div>
    <!-- Hidden rather than removed, so what is projected keeps its state across a fold. The cost
         is that a ResizeObserver inside a folded section reads 0: content that measures itself
         belongs in a section that does not fold. -->
    <div class="mt-[10px]" [hidden]="collapsible() && !open()">
      <ng-content />
    </div>
  `,
  host: {
    '[class]':
      'banded()' +
      " ? 'relative block border-b border-line px-[14px] py-1.5 last:border-b-0'" +
      " : 'block border-t border-line pt-2 first:border-t-0 first:pt-0'",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionComponent {
  readonly title = input.required<string>();
  readonly tone = input<'default' | 'gold'>('default');
  /** Full-bleed band with its own padding, as the editor inspectors are drawn. */
  readonly banded = input(false, { transform: booleanAttribute });
  /** The heading becomes the fold button; the actions stay reachable either way. */
  readonly collapsible = input(false, { transform: booleanAttribute });
  readonly open = model(true);
}
