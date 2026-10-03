import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

/** Discrete slider with one label per step under the track. Value is the step index. */
@Component({
  selector: 'nc-stepper',
  templateUrl: './stepper.component.html',
  host: { class: 'block' },
  styles: `
    /*
     * Fill and ticks are two layers of one background-image: a second declaration would replace the
     * first, not merge with it.
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
        calc(3px - var(--nc-stops, 0px) / 2) center;
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

  /**
   * Distance between two stops, which is what the tick layer tiles by.
   *
   * The thumb travels between its own half-widths rather than edge to edge, so the stops are spaced
   * across the track minus one thumb — and the layer is then pulled back by half a tile, because a
   * tiled radial sits at the middle of its tile and a stop is at the end of one.
   */
  protected readonly stops = computed(() => {
    const steps = Math.max(1, this.options().length - 1);
    return `calc((100% - 6px) / ${String(steps)})`;
  });

  protected onInput(e: Event): void {
    this.value.set(Number((e.target as HTMLInputElement).value));
  }
}
