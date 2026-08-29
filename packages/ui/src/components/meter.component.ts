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
  template: `
    <div
      role="meter"
      [attr.aria-valuenow]="total()"
      [attr.aria-valuemax]="max()"
      [attr.aria-label]="label()"
      [class]="trackClass()"
      [class.outline]="over()"
      [class.outline-hot]="over()"
    >
      @for (s of segments(); track s.label) {
        <span [class]="s.color" [style.width.%]="pct(s.value)" [attr.title]="s.label"></span>
      }
    </div>
    @if (legend()) {
      <ul class="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-label text-ink-3">
        @for (s of segments(); track s.label) {
          <li class="flex items-center gap-0.5">
            <span class="inline-block h-1 w-1 rounded-xs" [class]="s.color"></span>
            {{ s.label }}
          </li>
        }
      </ul>
    }
  `,
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
