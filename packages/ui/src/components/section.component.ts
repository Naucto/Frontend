import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Label + divider used to split a panel body into groups (STATUS, MONETIZATION, LINEAGE). */
@Component({
  selector: 'nc-section',
  template: `
    <div class="mb-[10px] flex items-center justify-between gap-1">
      <span class="label" [class.text-gold-ink]="tone() === 'gold'">{{ title() }}</span>
      <ng-content select="[actions]" />
    </div>
    <ng-content />
  `,
  host: {
    '[class]':
      'banded()' +
      " ? 'block border-b border-line px-[14px] py-2 last:border-b-0'" +
      " : 'block border-t border-line pt-2 first:border-t-0 first:pt-0'",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionComponent {
  readonly title = input.required<string>();
  readonly tone = input<'default' | 'gold'>('default');
  /** Full-bleed band with its own padding, as the editor inspectors are drawn. */
  readonly banded = input(false, { transform: booleanAttribute });
}
