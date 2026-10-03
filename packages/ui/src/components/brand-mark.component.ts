import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** A multi-colour mark drawn as rects on its own pixel grid. */
export interface PixelMark {
  /** viewBox width and height — each mark is drawn on its own pixel grid. */
  grid: readonly [number, number];
  /** `[x, y, width, height, fill]`; `currentColor` inherits the surrounding ink. */
  rects: readonly (readonly [number, number, number, number, string])[];
}

/**
 * Pixel-art brand mark: a third party's logo, which the caller owns and passes in.
 *
 * Separate from `nc-icon` on purpose: the icon kit is one monochrome path on a 24 grid, while these
 * are multi-colour rect grids at their own sizes.
 */
@Component({
  selector: 'nc-brand-mark',
  templateUrl: './brand-mark.component.html',
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandMarkComponent {
  readonly mark = input.required<PixelMark>();
  /** Height in pixels; the width follows the mark's own aspect so pixels stay square. */
  readonly size = input(12);

  protected readonly height = computed(() => this.size());
  protected readonly width = computed(() => {
    const [width, height] = this.mark().grid;
    return Math.round((this.size() * width) / height);
  });
}
