import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type BrandName = 'google' | 'github' | 'microsoft';

interface Mark {
  /** viewBox width and height — each mark is drawn on its own pixel grid. */
  grid: [number, number];
  /** `[x, y, width, height, fill]`, taken rect-for-rect from the design. */
  rects: readonly [number, number, number, number, string][];
}

// `currentColor` on GitHub's single-colour mark so it inherits the button's ink.
const MARKS: Record<BrandName, Mark> = {
  google: {
    grid: [8, 8],
    rects: [
      [2, 0, 4, 1, '#ea4335'],
      [1, 1, 1, 1, '#ea4335'],
      [6, 1, 1, 1, '#ea4335'],
      [0, 2, 1, 2, '#ea4335'],
      [0, 4, 1, 2, '#fbbc05'],
      [1, 6, 1, 1, '#fbbc05'],
      [2, 7, 4, 1, '#34a853'],
      [6, 6, 1, 1, '#34a853'],
      [4, 4, 4, 1, '#4285f4'],
      [7, 5, 1, 1, '#4285f4'],
    ],
  },
  github: {
    grid: [10, 8],
    rects: [
      [1, 0, 2, 1, 'currentColor'],
      [7, 0, 2, 1, 'currentColor'],
      [1, 1, 8, 1, 'currentColor'],
      [0, 2, 10, 1, 'currentColor'],
      [0, 3, 2, 1, 'currentColor'],
      [4, 3, 2, 1, 'currentColor'],
      [8, 3, 2, 1, 'currentColor'],
      [0, 4, 10, 1, 'currentColor'],
      [1, 5, 8, 1, 'currentColor'],
      [2, 6, 6, 1, 'currentColor'],
      [4, 7, 2, 1, 'currentColor'],
    ],
  },
  microsoft: {
    grid: [7, 7],
    rects: [
      [0, 0, 3, 3, '#f25022'],
      [4, 0, 3, 3, '#7fba00'],
      [0, 4, 3, 3, '#00a4ef'],
      [4, 4, 3, 3, '#ffb900'],
    ],
  },
};

/**
 * Pixel-art brand mark for the OAuth providers.
 *
 * Separate from `nc-icon` on purpose: the icon kit is one monochrome path on a 24 grid, while these
 * are multi-colour rect grids at their own sizes. Rect data is lifted from the design.
 */
@Component({
  selector: 'nc-brand-mark',
  template: `
    <svg
      [attr.viewBox]="'0 0 ' + mark().grid[0] + ' ' + mark().grid[1]"
      [attr.width]="width()"
      [attr.height]="height()"
      shape-rendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      class="block"
    >
      @for (r of mark().rects; track $index) {
        <rect
          [attr.x]="r[0]"
          [attr.y]="r[1]"
          [attr.width]="r[2]"
          [attr.height]="r[3]"
          [attr.fill]="r[4]"
        />
      }
    </svg>
  `,
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandMarkComponent {
  readonly name = input.required<BrandName>();
  /** Height in pixels; the width follows the mark's own aspect so pixels stay square. */
  readonly size = input(12);

  protected readonly mark = computed(() => MARKS[this.name()]);
  protected readonly height = computed(() => this.size());
  protected readonly width = computed(() => {
    const [w, h] = this.mark().grid;
    return Math.round((this.size() * w) / h);
  });
}
