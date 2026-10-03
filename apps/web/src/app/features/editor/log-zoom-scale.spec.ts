import { describe, expect, it } from 'vitest';

import { logZoomScale } from './log-zoom-scale';

describe('logZoomScale', () => {
  const scale = logZoomScale(1, 16);

  it('puts the ends of the range at the ends of the track', () => {
    expect(scale.positionOf(1)).toBe(0);
    expect(scale.positionOf(16)).toBe(1);
  });

  it('spends equal travel on equal ratios', () => {
    expect(scale.positionOf(2)).toBeCloseTo(0.25);
    expect(scale.positionOf(4)).toBeCloseTo(0.5);
    expect(scale.zoomAt(0.75)).toBeCloseTo(8);
  });
});
