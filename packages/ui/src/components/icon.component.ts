import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { ICON_PATHS, type IconName } from '../icons/paths';

export type IconSize = 12 | 24 | 48;

/**
 * Glyph edges snap to device pixels only at a whole device-pixel ratio; at a fractional one
 * (browser zoom) snapping thickens some strokes and thins others within one glyph, so they are
 * smoothed instead.
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
