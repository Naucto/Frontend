import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

/** Discrete slider with one label per step under the track (sprite size 1×1…8×8, brush). Value is the step index. */
@Component({
  selector: 'nc-stepper',
  template: `
    <input
      type="range"
      min="0"
      [max]="options().length - 1"
      step="1"
      [value]="value()"
      [attr.aria-label]="label()"
      [attr.aria-valuetext]="options()[value()]"
      (input)="onInput($event)"
      class="nc-range h-[4px] w-full cursor-pointer appearance-none rounded-xs bg-line-soft"
      [style.--nc-stops]="stops()"
    />
    <div class="mt-[7px] flex justify-between">
      @for (o of options(); track $index) {
        <button
          type="button"
          class="cursor-pointer font-mono text-label text-ink-4 transition-colors duration-100 hover:text-ink"
          [class.text-gold-ink]="$index === value()"
          (click)="value.set($index)"
        >
          {{ o }}
        </button>
      }
    </div>
  `,
  host: { class: 'block' },
  styles: `
    /*
     * Fill and ticks are two layers of one background, not two rules: they used to be declared
     * separately and the second background-image simply replaced the first, so the tick per step —
     * the whole point of a stepper over a slider — never painted.
     */
    .nc-range {
      background-image:
        linear-gradient(var(--nc-gold), var(--nc-gold)),
        radial-gradient(circle at center, var(--nc-line-strong) 0 2px, transparent 2px);
      background-repeat: no-repeat, repeat-x;
      background-size:
        var(--nc-fill, 0%) 100%,
        var(--nc-stops, 100%) 4px;
      background-position:
        left center,
        2px center;
    }
    .nc-range::-webkit-slider-thumb {
      appearance: none;
      width: 6px;
      height: 12px;
      background: var(--nc-gold);
      border-radius: 1px;
    }
    .nc-range::-moz-range-thumb {
      width: 6px;
      height: 12px;
      border: 0;
      background: var(--nc-gold);
      border-radius: 1px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StepperComponent {
  readonly value = model(0);
  readonly options = input.required<readonly string[]>();
  readonly label = input<string>();

  /** Tick spacing: one dot per step, so the groove shows where the stops are. */
  protected readonly stops = computed(() => {
    const steps = Math.max(1, this.options().length - 1);
    return `calc((100% - 4px) / ${String(steps)})`;
  });

  protected onInput(e: Event): void {
    this.value.set(Number((e.target as HTMLInputElement).value));
  }
}
