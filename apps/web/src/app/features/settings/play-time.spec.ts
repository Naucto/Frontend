import { describe, expect, it } from 'vitest';

import { playTime } from './play-time';

describe('playTime', () => {
  it('splits a running time into hours and minutes, dropping seconds', () => {
    expect(playTime(0)).toEqual({ hours: 0, minutes: 0 });
    expect(playTime(59_999)).toEqual({ hours: 0, minutes: 0 });
    expect(playTime(45 * 60_000)).toEqual({ hours: 0, minutes: 45 });
    expect(playTime((3 * 60 + 12) * 60_000 + 30_000)).toEqual({ hours: 3, minutes: 12 });
  });

  it('treats a negative time as none', () => {
    expect(playTime(-5)).toEqual({ hours: 0, minutes: 0 });
  });
});
