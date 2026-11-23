import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  type ElementRef,
  input,
  model,
  viewChildren,
} from '@angular/core';

import { CELL, CELL_ON, joined } from './selection-styles';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /**
   * Fill this one takes when chosen, for a control whose options are not equivalent.
   *
   * One tone for the whole control says which of several equals is current. Where the options are
   * states rather than equals, the colour carries the state, and only some states have one.
   */
  tone?: SegmentTone;
}

/**
 * Fill of the selected segment. `raised` is the plain selection, which is the primary fill;
 * `orange` is a state that has a colour of its own.
 */
export type SegmentTone = 'raised' | 'orange';

const SELECTED: Record<SegmentTone, string> = {
  raised: CELL_ON.primary,
  orange: CELL_ON.orange,
};

/**
 * Exclusive choice, as one row of joined cells. Two type settings:
 *
 * - `framed` (default) — a setting among a form's others.
 * - `chips` — a filter over a list, set a step smaller.
 *
 * `fill` stretches either across the width it is given.
 */
@Component({
  selector: 'nc-segmented',
  templateUrl: './segmented.component.html',
  host: { '[class]': 'fill() ? "flex w-full" : "inline-flex max-w-full"' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SegmentedComponent<T extends string = string> {
  readonly options = input.required<readonly SegmentOption<T>[]>();
  readonly value = model<T>();
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly label = input<string>();
  readonly variant = input<'framed' | 'chips'>('framed');
  /** Stretch the segments to share the full width, as the publishing rows do. */
  readonly fill = input(false, { transform: booleanAttribute });
  /** `sm` is for a strip or an inspector row, where the control stands a step lower. */
  readonly size = input<'sm' | 'md'>('md');

  private readonly baseItemClass = computed(() =>
    [
      CELL,
      'inline-flex items-center justify-center font-ui whitespace-nowrap uppercase text-ink-3 data-on:cursor-default',
      this.fill() ? 'min-w-0 flex-1 px-[6px]' : '',
      this.size() === 'sm'
        ? `h-(--nc-h-xs) text-label tracking-button ${this.fill() ? '' : 'px-[10px]'}`
        : this.variant() === 'chips'
          ? `h-(--nc-h-sm) text-label tracking-tag ${this.fill() ? '' : 'px-[12px]'}`
          : `h-(--nc-h-sm) text-meta tracking-button ${this.fill() ? '' : 'px-[14px]'}`,
    ].join(' '),
  );

  protected itemClass(option: SegmentOption<T>, first: boolean, last: boolean): string {
    return `${this.baseItemClass()} ${SELECTED[option.tone ?? 'raised']} ${joined(first, last)}`;
  }

  private readonly radios = viewChildren<ElementRef<HTMLButtonElement>>('radio');

  /** The checked radio is the one tab stop; with nothing checked yet, the first one is. */
  protected tabIndexFor(option: SegmentOption<T>, index: number): number {
    if (option.value === this.value()) {
      return 0;
    }
    return this.value() === undefined && index === 0 ? 0 : -1;
  }

  protected onKey(event: KeyboardEvent, index: number): void {
    const opts = this.options();
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (index + 1) % opts.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (index - 1 + opts.length) % opts.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = opts.length - 1;
        break;
      default:
        return;
    }
    const target = opts[next];
    if (!target) {
      return;
    }
    event.preventDefault();
    this.value.set(target.value);
    this.radios()[next]?.nativeElement.focus();
  }
}
