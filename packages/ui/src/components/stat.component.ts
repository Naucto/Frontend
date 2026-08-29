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
 * A count and what it counts. The design draws two arrangements and they are told apart by whether
 * there is room for a word:
 *
 * - **labelled** — `⟨icon⟩ 48 VIEWS`, 7px gap, value in `ink` and the label in `ink-3`. Sidebars.
 * - **compact** — `⟨icon⟩ 48`, 5px gap, the whole pair in one colour. Game cards.
 *
 * Passing a `label` selects the labelled arrangement, so no call site has to say which it wants.
 */
@Component({
  selector: 'nc-stat',
  imports: [IconComponent],
  template: `
    <nc-icon [name]="icon()" [size]="12" />
    <!-- The value only lifts to ink when a label follows it to sit against; on a card the pair is
         one colour, so lifting it there would split a two-part reading into two weights. -->
    <span [class]="label() && tone() !== 'hot' ? 'text-ink' : ''">{{ formatted() }}</span>
    @if (label(); as text) {
      <span>{{ text }}</span>
    }
  `,
  host: {
    class: 'inline-flex items-center font-mono text-label uppercase tracking-button',
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
  /** Profile totals are abbreviated (`1.2k`); card and game-page counts are grouped (`1 008`). */
  readonly compact = input(false, { transform: booleanAttribute });

  protected readonly formatted = computed(() => {
    const value = this.value();
    if (typeof value !== 'number') return value;
    return this.compact() ? formatCompact(value) : formatCount(value);
  });
}
