import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
} from '@angular/core';

/**
 * Horizontal value slider with an optional readout (BPM 124, R 255, LATENCY 80 ms).
 *
 * `compact` is the geometry the design uses where the label is a single letter and the groove is
 * what the row is for — the RGB channels in the palette editor. The default columns are sized for
 * a word (LATENCY, OPACITY) and swallow most of a narrow panel when the label is one character.
 *
 * `hideLabel` keeps the accessible name and drops the printed one, for a groove sitting between two
 * glyphs that already say what it does — a zoom track between its two magnifiers.
 *
 * `min-w-0` on the groove is load-bearing: a range input has an intrinsic width of about 129px and
 * a flex child will not go under its own min-content size, so without it the groove overflows a
 * narrow row.
 */
@Component({
  selector: 'nc-slider',
  templateUrl: './slider.component.html',
  host: { class: 'flex items-center gap-1.5' },
  styles: `
    .nc-range::-webkit-slider-thumb {
      appearance: none;
      width: 6px;
      height: 12px;
      background: var(--nc-accent);
      border-radius: 1px;
    }
    .nc-range::-moz-range-thumb {
      width: 6px;
      height: 12px;
      border: 0;
      background: var(--nc-accent);
      border-radius: 1px;
    }
    .nc-range {
      background-image: linear-gradient(var(--nc-accent), var(--nc-accent));
      background-repeat: no-repeat;
      background-size: var(--nc-fill, 0%) 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SliderComponent {
  readonly value = model(0);
  readonly min = input(0);
  readonly max = input(100);
  readonly step = input(1);
  readonly label = input<string>();
  readonly readout = input<string>();
  readonly accent = input<'gold' | 'hot' | 'jade' | 'sky' | 'blush' | 'orange'>('gold');
  readonly disabled = input(false);
  readonly compact = input(false, { transform: booleanAttribute });
  readonly hideLabel = input(false, { transform: booleanAttribute });

  /** Percentage of the track covered by the accent, derived from value/min/max. */
  protected readonly fill = computed(() => {
    const span = this.max() - this.min();
    if (span <= 0) {
      return 0;
    }
    const pct = ((this.value() - this.min()) / span) * 100;
    return Math.min(100, Math.max(0, pct));
  });

  protected onInput(event: Event): void {
    this.value.set(Number((event.target as HTMLInputElement).value));
  }
}
