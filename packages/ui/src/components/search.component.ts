import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';

import { IconComponent } from './icon.component';
import { WELL } from './input.directive';
import { KeycapComponent } from './keycap.component';
import { MarkComponent } from './mark.component';

/**
 * How tall the box is: `md` is the top bar's, `sm` the one an editor toolbar carries. Only `md` has
 * the room for the key that names its shortcut.
 */
export type SearchSize = 'sm' | 'md';

const SIZE: Record<SearchSize, { host: string; input: string }> = {
  sm: { host: 'h-(--nc-h-sm) gap-1 px-[9px]', input: 'text-micro' },
  md: { host: 'h-[42px] gap-1.5 pr-[10px] pl-[14px]', input: 'font-ui text-small' },
};

/** Search box with the magnifier and a keyboard hint ("/"). Emits `submitted` on Enter. */
@Component({
  selector: 'nc-search',
  imports: [IconComponent, KeycapComponent, MarkComponent],
  templateUrl: './search.component.html',
  host: {
    class: `${WELL} flex items-center text-ink-3 not-focus-within:hover:text-ink-2 focus-within:text-gold-ink`,
    '[class]': 'chrome().host',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchComponent {
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');
  readonly value = model('');
  readonly placeholder = input('Search');
  readonly size = input<SearchSize>('md');
  protected readonly chrome = computed(() => SIZE[this.size()]);
  /** One key, or the keys of a chord in the order they are held. */
  readonly hint = input<string | readonly string[]>('/');
  protected readonly keys = computed(() => {
    const hint = this.hint();
    return typeof hint === 'string' ? (hint ? [hint] : []) : hint;
  });
  /** The id of the listbox the box fills: with one, the field is a combobox. */
  readonly list = input<string>();
  /** Whether that listbox is on screen. */
  readonly expanded = input(false);
  readonly submitted = output<string>();
  /** Put the caret in the box — a keyboard shortcut somewhere else has no other way in. */
  focus(): void {
    this.input().nativeElement.focus({ preventScroll: true });
    this.input().nativeElement.select();
  }

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }
}
