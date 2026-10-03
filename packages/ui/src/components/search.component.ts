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

/** How tall the box is: `md` is the top bar's, `sm` the one an editor toolbar carries. */
export type SearchSize = 'sm' | 'md';

const SIZE: Record<SearchSize, { host: string; input: string; icon: string }> = {
  sm: {
    host: 'h-[31px] gap-1 px-[10px]',
    input: 'font-mono text-[11px]',
    icon: 'text-ink-4',
  },
  md: {
    host: 'gap-2.5 px-[13px] py-[9px]',
    input: 'font-ui text-body',
    icon: 'text-ink-3',
  },
};

/** Search box with the magnifier and a keyboard hint ("/"). Emits `submitted` on Enter. */
@Component({
  selector: 'nc-search',
  imports: [IconComponent],
  templateUrl: './search.component.html',
  host: {
    '[class]':
      '"flex items-center rounded-sm border border-line bg-inset focus-within:border-gold " + chrome().host',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchComponent {
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');
  readonly value = model('');
  readonly placeholder = input('Search');
  readonly size = input<SearchSize>('md');
  protected readonly chrome = computed(() => SIZE[this.size()]);
  readonly hint = input<string>('/');
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
