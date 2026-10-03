import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { type OscType } from '@naucto/engine';

/** Traced from the artboard: three full cycles of each wave. */
const PATHS: Record<OscType, string> = {
  square: 'M0 12h1V3h8v9h8V3h8v9h9',
  sine: 'M0 9c2-6 5-7 8-4s5 8 8 8 6-5 9-8 6-2 9 1',
  triangle: 'M0 12l8-9 9 9 8-9 9 9',
  saw: 'M0 12l8-9v9l9-9v9l8-9v9l9-9',
  noise: 'M0 8l2 4 2-7 2 9 2-6 2 3 2-8 2 7 2-4 2 6 2-9 2 5 2-3 2 8 2-6 2 2 2-5',
  sample: 'M0 10l3-4 3 6 3-8 3 5 3-2 3 4 3-7 3 3 3 2 3-5 3 6',
};

const BOX_W = 34;
const BOX_H = 15;

/**
 * An oscillator's wave shape, stroked in `currentColor` so it takes the colour of whatever holds
 * it.
 */
@Component({
  selector: 'nc-wave-glyph',
  templateUrl: './wave-glyph.component.html',
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WaveGlyphComponent {
  readonly type = input.required<OscType>();
  readonly width = input(BOX_W);
  protected readonly height = computed(() => Math.round((this.width() * BOX_H) / BOX_W));
  protected readonly path = computed(() => PATHS[this.type()]);
}
