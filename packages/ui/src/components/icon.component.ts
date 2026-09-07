import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { ICON_PATHS, type IconName } from '../icons/paths';

export type IconSize = 12 | 24 | 48;

/**
 * How the glyphs are rasterised, which is not one answer.
 *
 * They are drawn on a 24 grid and shown at halves and doubles of it, so on a screen whose device
 * ratio is a whole number every edge of every glyph lands on a device pixel and snapping them is
 * exactly right. At a fractional ratio — which is what a browser zoom produces — no such alignment
 * exists, and snapping each edge to the nearest pixel then thickens some strokes and thins others
 * within the same glyph. Smoothing is the lesser of the two there: it loses the hard edge, but it
 * loses it evenly.
 *
 * One signal for every icon on the page, because the answer is the screen's and not each glyph's.
 */
const rendering = signal('crispEdges');

if (typeof window !== 'undefined') {
  const follow = (): void => {
    const ratio = window.devicePixelRatio;
    rendering.set(Number.isInteger(ratio) ? 'crispEdges' : 'geometricPrecision');
    window
      .matchMedia(`(resolution: ${String(ratio)}dppx)`)
      .addEventListener('change', follow, { once: true });
  };
  follow();
}

@Component({
  selector: 'nc-icon',
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="currentColor"
      [attr.shape-rendering]="rendering()"
      aria-hidden="true"
      focusable="false"
    >
      <path [attr.d]="d()" />
    </svg>
  `,
  host: { class: 'inline-flex shrink-0 items-center justify-center leading-none' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input<IconSize>(24);
  protected readonly d = computed(() => ICON_PATHS[this.name()]);
  protected readonly rendering = rendering;
}
