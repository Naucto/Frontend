import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface MeterSegment {
  label: string;
  value: number;
  /** Tailwind background class, e.g. 'bg-sky'. */
  color: string;
}

/** Stacked segmented bar against a ceiling (GAME SIZE: sprites / music / map / code vs 1 MB). */
@Component({
  selector: 'nc-meter',
  templateUrl: './meter.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MeterComponent {
  readonly segments = input.required<readonly MeterSegment[]>();
  readonly max = input.required<number>();
  readonly label = input<string>();
  readonly legend = input(true);
  /** `md` is the 16px track of the size budget; `sm` the 12px inline bar. */
  readonly size = input<'sm' | 'md'>('sm');

  protected readonly total = computed(() =>
    this.segments().reduce((sum, segment) => sum + segment.value, 0),
  );
  protected readonly over = computed(() => this.total() > this.max());
  protected readonly trackClass = computed(() =>
    [
      'flat-sm bevel-fill-inset flex w-full gap-[3px]',
      this.size() === 'md' ? 'h-[16px] p-[3px]' : 'h-[12px]',
      this.over() ? 'bevel-edge-hot' : '',
    ].join(' '),
  );
  /** Segments with nothing in them are left out, so the pixel between two bars is never doubled. */
  protected readonly filled = computed(() =>
    this.segments().filter((segment) => segment.value > 0),
  );
  protected pct(value: number): number {
    return Math.min(100, (value / Math.max(this.max(), this.total())) * 100);
  }
}
