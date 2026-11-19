import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
} from '@angular/core';

import { RANGE_INPUT, RANGE_THUMB, RANGE_THUMB_SLOT, RANGE_TRACK } from './selection-styles';

/** What the covered part of the track is filled with; `primary` unless the colour says something. */
export type SliderAccent = 'primary' | 'gold' | 'hot' | 'jade' | 'sky' | 'blush' | 'orange';

/** Written out one by one: Tailwind reads the text of the sources, not what they compute to. */
const FILL: Record<SliderAccent, string> = {
  primary: 'bg-primary',
  gold: 'bg-gold',
  hot: 'bg-hot',
  jade: 'bg-jade',
  sky: 'bg-sky',
  blush: 'bg-blush',
  orange: 'bg-orange',
};

/**
 * Horizontal value slider with an optional readout (BPM 124, R 255, LATENCY 80 ms).
 *
 * `compact` is the geometry the design uses where the label is a single letter and the groove is
 * what the row is for — the RGB channels in the palette editor. The default columns are sized for
 * a word (LATENCY, OPACITY) and swallow most of a narrow panel when the label is one character.
 *
 * `hideLabel` keeps the accessible name and drops the printed one, for a groove sitting between two
 * glyphs that already say what it does — a zoom track between its two magnifiers.
 */
@Component({
  selector: 'nc-slider',
  templateUrl: './slider.component.html',
  host: { class: 'flex items-center gap-[14px]' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SliderComponent {
  readonly value = model(0);
  readonly min = input(0);
  readonly max = input(100);
  readonly step = input(1);
  readonly label = input<string>();
  readonly readout = input<string>();
  readonly accent = input<SliderAccent>('primary');
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly compact = input(false, { transform: booleanAttribute });
  readonly hideLabel = input(false, { transform: booleanAttribute });

  protected readonly track = RANGE_TRACK;
  protected readonly range = RANGE_INPUT;
  protected readonly thumbSlot = RANGE_THUMB_SLOT;
  protected readonly thumb = RANGE_THUMB;
  protected readonly fillClass = computed(() => FILL[this.accent()]);

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
