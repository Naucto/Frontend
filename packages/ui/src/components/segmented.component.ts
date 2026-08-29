import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
} from '@angular/core';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
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
 * - `framed` (default) — joined buttons inside an inset track: DRAFT / PUBLIC, join policy.
 * - `chips` — loose pills with no container: hub filters, profile shelves, sheet bands, sort strips.
 */
@Component({
  selector: 'nc-segmented',
  template: `
    <div role="radiogroup" [attr.aria-label]="label()" [class]="trackClass()">
      @for (o of options(); track o.value) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="o.value === value()"
          [disabled]="disabled()"
          (click)="value.set(o.value)"
          [class]="itemClass()"
        >
          {{ o.label }}
        </button>
      }
    </div>
  `,
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
   * Chip density, and `chips` only — the framed track is 26 everywhere the design draws it, so
   * there is no small framed variant to offer. `sm` is the ART sheet band: 20 tall on 7px of
   * padding, against the 24 a page-level filter gets.
   */
  readonly size = input<'sm' | 'md'>('md');

  private readonly resolvedTone = computed<SegmentTone>(
    () => this.tone() ?? (this.variant() === 'chips' ? 'ink' : 'raised'),
  );

  private readonly small = computed(() => this.variant() === 'chips' && this.size() === 'sm');

  protected readonly trackClass = computed(() =>
    [
      this.fill() ? 'flex w-full' : 'inline-flex',
      'max-w-full flex-wrap',
      this.variant() === 'chips'
        ? this.small()
          ? 'gap-[3px]'
          : 'gap-[6px]'
        : 'gap-[3px] rounded-sm border border-line bg-inset p-[3px]',
    ].join(' '),
  );

  protected readonly itemClass = computed(() =>
    [
      'cursor-pointer rounded-xs whitespace-nowrap uppercase transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-40',
      this.fill() ? 'flex-1 text-center' : '',
      this.variant() === 'chips'
        ? this.small()
          ? 'bg-raised px-[7px] py-[3px] font-mono text-micro tracking-button text-ink-3 hover:text-ink'
          : 'bg-raised px-[11px] py-[6px] font-mono text-label tracking-button text-ink-3 hover:text-ink'
        : 'h-[26px] px-1.5 font-mono text-meta tracking-button text-ink-3 hover:text-ink',
      SELECTED[this.resolvedTone()],
    ].join(' '),
  );
}
