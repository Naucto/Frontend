import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

import { formatCompact, formatCount } from '../format';
import { type IconName } from '../icons/paths';
import { IconComponent } from './icon.component';

/**
 * A count and what it counts, in two arrangements: **labelled** (`⟨icon⟩ 48 VIEWS`), where the
 * value lifts to ink against its label, and **bare** (`⟨icon⟩ 48`), the pair in one colour. Passing
 * a `label` selects the labelled one, so no call site has to say which it wants.
 */
@Component({
  selector: 'nc-stat',
  imports: [IconComponent],
  template: `
    <nc-icon [name]="icon()" [size]="12" />
    <span [class]="label() && tone() !== 'hot' ? 'text-ink' : ''">{{ formatted() }}</span>
    @if (label(); as text) {
      <span>{{ text }}</span>
    }
  `,
  host: {
    class: 'inline-flex items-center font-mono text-label uppercase tracking-data',
    '[class]':
      '(tone() === "hot" ? "text-hot-ink" : "text-ink-3") + (label() ? " gap-[7px]" : " gap-[5px]")',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatComponent {
  readonly icon = input.required<IconName>();
  readonly value = input.required<string | number>();
  readonly label = input<string>();
  /** `hot` tints the whole stat, as the like count is drawn. */
  readonly tone = input<'neutral' | 'hot'>('neutral');
  /** Abbreviate the count (`1.2k`) instead of grouping it (`1 008`). */
  readonly compact = input(false, { transform: booleanAttribute });

  protected readonly formatted = computed(() => {
    const value = this.value();
    if (typeof value !== 'number') return value;
    return this.compact() ? formatCompact(value) : formatCount(value);
  });
}
