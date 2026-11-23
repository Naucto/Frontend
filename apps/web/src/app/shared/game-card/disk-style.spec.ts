import { uuidOf } from '@naucto/api-client/testing';
import { BUBBLEGUM_16 } from '@naucto/engine';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { diskBody, diskFinish, type DiskStyle, diskStyleFor } from './disk-style';

describe('diskStyleFor', () => {
  it('keeps the style its author chose', () => {
    const disk: DiskStyle = { color: '#ff80a4', finish: 'holo' };
    expect(diskStyleFor({ id: uuidOf(3), disk })).toBe(disk);
  });

  it('gives an undressed game a plain plastic from the engine palette, the same every time', () => {
    for (let number = 0; number < 40; number++) {
      const { color, finish } = diskStyleFor({ id: uuidOf(number), disk: null });
      expect(finish).toBe('solid');
      expect(BUBBLEGUM_16).toContain(color);
      expect(color).not.toBe('#16171a');
      expect(diskStyleFor({ id: uuidOf(number) }).color).toBe(color);
    }
  });

  /** Pinned: a game's disk is the same colour after a reload, in another browser, next release. */
  it('draws the plastic of an undressed game from its id, the same on every load', () => {
    expect(diskStyleFor({ id: '7c9e6679-7425-40de-944b-e07fc1f90ae7' })).toEqual({
      color: '#68aed4',
      finish: 'solid',
    });
    expect(diskStyleFor({ id: uuidOf(7) }).color).toBe('#bfff3c');
  });

  it('spreads undressed games over the plastics rather than moulding them all alike', () => {
    const colours = new Set(
      Array.from({ length: 40 }, (_, number) => diskStyleFor({ id: uuidOf(number) }).color),
    );
    expect(colours.size).toBeGreaterThan(8);
  });
});

describe('diskBody', () => {
  it('moulds a metal in the metal, whatever colour came with it', () => {
    expect(diskBody({ color: '#68aed4', finish: 'stripes' })).toBe('#68aed4');
    expect(diskBody({ color: '#68aed4', finish: 'gold' })).toBe('#d9a62a');
    expect(diskBody({ color: '#68aed4', finish: 'holo' })).toBe('#c9cdd5');
  });
});

describe('diskFinish', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints nothing on bare plastic', () => {
    expect(diskFinish({ color: '#68aed4', finish: 'solid' }, 240)).toBeNull();
  });

  it('prints a pattern in the second colour, or in the plastic pushed away from its own lightness', () => {
    expect(diskFinish({ color: '#002859', finish: 'stripes', color2: '#ffd100' }, 0)).toContain(
      '#ffd100 0 6px',
    );
    // 22% of the way to white from a dark plastic, to black from a light one.
    expect(diskFinish({ color: '#000000', finish: 'checker' }, 0)).toContain('#383838');
    expect(diskFinish({ color: '#ffffff', finish: 'checker' }, 0)).toContain('#c7c7c7');
    expect(diskFinish({ color: '#000000', finish: 'dots' }, 0)).toContain(
      encodeURIComponent('fill="#383838"'),
    );
  });

  it('lays sparkles over the bands of a metal', () => {
    const gold = diskFinish({ color: '#68aed4', finish: 'gold' }, 0);
    expect(gold).toContain('#ffe58a 0 5%');
    expect(gold).toContain('36px 36px');
    expect(diskFinish({ color: '#68aed4', finish: 'holo' }, 0)).toContain('#a6d3ec 0.00% 16.67%');
  });

  it('waits for the size of the disk before it draws a gradient', () => {
    expect(diskFinish({ color: '#68aed4', finish: 'gradient' }, 0)).toBeNull();
  });

  /** jsdom has no canvas: the cells are counted as they are filled. */
  it('dithers a gradient in whole 3px cells, thin where it starts and solid where it ends', () => {
    const filled = new Map<number, number>();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '',
      fillRect: (x: number) => filled.set(x, (filled.get(x) ?? 0) + 1),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AA');

    // A 132px disk: the finish is 120 by 123, forty cells by forty-one.
    const ramp = diskFinish(
      { color: '#68aed4', finish: 'gradient', color2: '#ff2674', gradDir: 'h' },
      132,
    );
    expect(ramp).toContain('0 0 / 120px 123px no-repeat');
    expect(filled.get(0)).toBeUndefined();
    expect(filled.get(39)).toBe(41);
    const half = filled.get(20) ?? 0;
    expect(half).toBeGreaterThan(41 * 0.4);
    expect(half).toBeLessThan(41 * 0.6);
  });
});
