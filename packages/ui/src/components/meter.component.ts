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
  /** `md` is the 12px pill of the size budget; `sm` the 4px inline bar. */
  readonly size = input<'sm' | 'md'>('sm');

  protected readonly trackClass = computed(() =>
    [
      'flex w-full overflow-hidden bg-line-soft',
      this.size() === 'md' ? 'h-1.5 rounded-full' : 'h-[4px] rounded-xs',
      this.over() ? 'outline outline-hot' : '',
    ].join(' '),
  );
  protected readonly total = computed(() => this.segments().reduce((a, s) => a + s.value, 0));
  protected readonly over = computed(() => this.total() > this.max());
  protected pct(v: number): number {
    return Math.min(100, (v / Math.max(this.max(), this.total())) * 100);
  }
}
