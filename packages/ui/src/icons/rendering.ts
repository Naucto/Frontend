import { signal } from '@angular/core';

/**
 * Glyph edges snap to device pixels only at a whole device-pixel ratio; at a fractional one
 * (browser zoom) snapping thickens some strokes and thins others within one glyph, so they are
 * smoothed instead.
 */
export const glyphRendering = signal('crispEdges');

if (typeof window !== 'undefined') {
  const follow = (): void => {
    const ratio = window.devicePixelRatio;
    glyphRendering.set(Number.isInteger(ratio) ? 'crispEdges' : 'geometricPrecision');
    window
      .matchMedia(`(resolution: ${String(ratio)}dppx)`)
      .addEventListener('change', follow, { once: true });
  };
  follow();
}
