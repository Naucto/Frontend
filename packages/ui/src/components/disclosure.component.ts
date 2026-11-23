import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

import { IconComponent } from './icon.component';

/** `row` is a line of a list or a form, set in small capitals; `title` is a section's own title. */
export type DisclosureVariant = 'row' | 'title';

const TITLE_ROW =
  'raised-sm bevel-bare flex w-full cursor-pointer items-center gap-0.5 text-left select-none ' +
  'hover:bevel-lit hover:bevel-fill-raised hover:text-active-ink active:bevel-down';

const VARIANTS: Record<DisclosureVariant, string> = {
  row: `${TITLE_ROW} h-(--nc-h-md) px-[3px] font-ui text-label tracking-label text-ink-3 uppercase`,
  title: `${TITLE_ROW} min-h-(--nc-h-lg) -ml-[3px] px-[3px] font-display text-title text-ink`,
};

let nextId = 0;

/**
 * A title that shows or hides what is under it. The title is the button, with a chevron that
 * points at the content when it is shown; anything projected as `[lead]` stands between the two.
 * Hidden content stays in the page, so a field inside it keeps what was typed.
 *
 * With a `level`, the title is a heading of that level, so the page's outline keeps it.
 */
@Component({
  selector: 'nc-disclosure',
  imports: [IconComponent],
  templateUrl: './disclosure.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DisclosureComponent {
  readonly title = input.required<string>();
  readonly open = model(false);
  readonly variant = input<DisclosureVariant>('row');
  readonly level = input<number>();

  protected readonly regionId = `nc-disclosure-${String(nextId++)}`;
  protected readonly buttonClass = computed(() => VARIANTS[this.variant()]);
}
