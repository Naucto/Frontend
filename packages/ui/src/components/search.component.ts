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

/**
 * How tall the box is. `md` is the top bar's — the design draws it 43px on 9/13 of padding, the
 * tallest control in that bar and deliberately taller than the 38px buttons beside it. `sm` is the
 * one the editor's toolbars carry, sized to sit inside a 38px strip.
 */
export type SearchSize = 'sm' | 'md';

const SIZE: Record<SearchSize, { host: string; input: string; icon: string }> = {
  sm: {
    host: 'h-[26px] gap-1 px-[10px]',
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
  template: `
    <nc-icon name="search" [size]="12" [class]="chrome().icon" />
    <input
      #input
      type="search"
      [placeholder]="placeholder()"
      [value]="value()"
      [attr.aria-label]="placeholder()"
      (input)="onInput($event)"
      (keydown.enter)="submitted.emit(value())"
      class="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-4"
      [class]="chrome().input"
    />
    @if (hint()) {
      <kbd
        class="rounded-xs border border-line px-[5px] py-[2px] font-mono text-[10px] leading-[normal] text-ink-4"
      >
        {{ hint() }}
      </kbd>
    }
  `,
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

  protected onInput(e: Event): void {
    this.value.set((e.target as HTMLInputElement).value);
  }
}
