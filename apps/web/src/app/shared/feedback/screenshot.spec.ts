import { describe, expect, it } from 'vitest';

import { fitWithin, SCREENSHOT_MAX_EDGE } from './screenshot';

describe('fitWithin', () => {
  it('brings the longest edge within the limit, keeping the shape', () => {
    expect(fitWithin(3840, 2160)).toEqual({ width: SCREENSHOT_MAX_EDGE, height: 1080 });
    expect(fitWithin(1000, 4000)).toEqual({ width: 480, height: SCREENSHOT_MAX_EDGE });
  });

  it('never enlarges a small image', () => {
    expect(fitWithin(960, 540)).toEqual({ width: 960, height: 540 });
  });
});
