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

/** Fill of the selected segment. Gold is a primary action in this design, never a selection. */
export type SegmentTone = 'raised' | 'ink' | 'orange';

const SELECTED: Record<SegmentTone, string> = {
  raised: 'aria-checked:bg-raised aria-checked:text-ink',
  ink: 'aria-checked:bg-ink-body aria-checked:text-page',
  orange: 'aria-checked:bg-orange aria-checked:text-on-accent',
};

/**
 * Exclusive choice. Two shapes, both drawn in the design:
 *
 * - `framed` (default) — joined buttons inside an inset track.
 * - `chips` — loose pills with no container.
 */
@Component({
  selector: 'nc-segmented',
  templateUrl: './segmented.component.html',
  host: { '[class]': 'fill() ? "flex w-full" : "inline-flex"' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SegmentedComponent<T extends string = string> {
  readonly options = input.required<readonly SegmentOption<T>[]>();
  readonly value = model<T>();
  readonly disabled = input(false);
  readonly label = input<string>();
  readonly variant = input<'framed' | 'chips'>('framed');
  readonly tone = input<SegmentTone>();
  /** Stretch the segments to share the full width, as the publishing rows do. */
  readonly fill = input(false, { transform: booleanAttribute });
  /**
   * Control density: `sm` is for a strip or an inspector row, where the control comes down to the
   * height of what stands beside it.
   */
  readonly size = input<'sm' | 'md'>('md');

  private readonly resolvedTone = computed<SegmentTone>(
    () => this.tone() ?? (this.variant() === 'chips' ? 'ink' : 'raised'),
  );

  private readonly small = computed(() => this.variant() === 'chips' && this.size() === 'sm');
  private readonly shortFrame = computed(() => this.variant() === 'framed' && this.size() === 'sm');

  protected readonly trackClass = computed(() =>
    [
      this.fill() ? 'flex w-full' : 'inline-flex',
      'max-w-full flex-wrap',
      this.variant() === 'chips'
        ? this.small()
          ? 'gap-[3px]'
          : 'gap-[6px]'
        : this.shortFrame()
          ? 'gap-[1px] rounded-sm border border-line bg-inset p-[1px]'
          : 'gap-[3px] rounded-sm border border-line bg-inset p-[3px]',
    ].join(' '),
  );

  protected readonly baseItemClass = computed(() =>
    [
      'cursor-pointer rounded-xs whitespace-nowrap uppercase transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-40',
      this.fill() ? 'flex-1 text-center' : '',
      this.variant() === 'chips'
        ? this.small()
          ? 'inline-flex h-[23px] items-center bg-raised px-[7px] font-mono text-micro tracking-button text-ink-3 hover:text-ink'
          : 'bg-raised px-[11px] py-[6px] font-mono text-label tracking-button text-ink-3 hover:text-ink'
        : this.shortFrame()
          ? 'inline-flex h-(--nc-control-h-xs) items-center justify-center px-1 font-mono text-micro tracking-button text-ink-3 hover:text-ink'
          : 'h-(--nc-control-h) px-1.5 font-mono text-meta tracking-button text-ink-3 hover:text-ink',
    ].join(' '),
  );

  protected itemClass(option: SegmentOption<T>): string {
    return `${this.baseItemClass()} ${SELECTED[option.tone ?? this.resolvedTone()]}`;
  }

  private readonly radios = viewChildren<ElementRef<HTMLButtonElement>>('radio');

  /** The checked radio is the one tab stop; with nothing checked yet, the first one is. */
  protected tabIndexFor(option: SegmentOption<T>, index: number): number {
    if (option.value === this.value()) return 0;
    return this.value() === undefined && index === 0 ? 0 : -1;
  }

  protected onKey(e: KeyboardEvent, index: number): void {
    const opts = this.options();
    let next: number;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % opts.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
      next = (index - 1 + opts.length) % opts.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = opts.length - 1;
    else return;
    const target = opts[next];
    if (!target) return;
    e.preventDefault();
    this.value.set(target.value);
    this.radios()[next]?.nativeElement.focus();
  }
}
