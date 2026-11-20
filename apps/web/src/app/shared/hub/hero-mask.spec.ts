import { describe, expect, it } from 'vitest';

import { HERO_BLEED, maskAlpha } from './hero-mask';

describe('maskAlpha', () => {
  const width = 1440;
  const height = 836;

  it('shows the whole backdrop along the right edge', () => {
    expect(maskAlpha(width - 10, 100, width, height)).toBe(1);
    expect(maskAlpha(width * 0.6, 300, width, height)).toBe(1);
  });

  it('leaves the text side clear', () => {
    expect(maskAlpha(0, 300, width, height)).toBe(0);
    expect(maskAlpha(width * 0.24, 300, width, height)).toBe(0);
  });

  it('falls away between the two, more with every step to the left', () => {
    const steps = [0.55, 0.45, 0.35, 0.28].map((share) =>
      maskAlpha(width * share, 300, width, height),
    );
    expect(steps[0]).toBeLessThan(1);
    expect([...steps].sort((a, b) => b - a)).toEqual(steps);
    expect(steps[3]).toBeGreaterThan(0);
  });

  it('dissolves under what follows the hero, and is gone at its own bottom', () => {
    const x = width - 10;
    expect(maskAlpha(x, height - HERO_BLEED - 30, width, height)).toBe(1);
    expect(maskAlpha(x, height - HERO_BLEED / 2, width, height)).toBeLessThan(1);
    expect(maskAlpha(x, height - HERO_BLEED / 2, width, height)).toBeGreaterThan(0);
    expect(maskAlpha(x, height - 8, width, height)).toBe(0);
  });
});
