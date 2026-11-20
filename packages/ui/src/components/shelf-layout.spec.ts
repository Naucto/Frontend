import { flyoutPlacement, shelfLayout, shelfPlace } from './shelf-layout';

describe('shelfLayout', () => {
  it('fits as many items as keep their least width, and pages the rest', () => {
    expect(shelfLayout(1100, 14)).toEqual({ per: 4, itemWidth: 263, pages: 4 });
    expect(shelfLayout(1296, 24)).toEqual({ per: 5, itemWidth: 246, pages: 5 });
  });

  it('never shows fewer than two, however narrow the track', () => {
    expect(shelfLayout(198, 5)).toEqual({ per: 2, itemWidth: 91, pages: 3 });
  });

  it('is one page for a list that fits, and for none at all', () => {
    expect(shelfLayout(1100, 3).pages).toBe(1);
    expect(shelfLayout(1100, 0).pages).toBe(1);
  });
});

describe('a shelf several rows high', () => {
  it('holds a page of rows times as many items, at the same width', () => {
    expect(shelfLayout(1100, 14, 2)).toEqual({ per: 4, itemWidth: 263, pages: 2 });
    expect(shelfLayout(1100, 16, 2).pages).toBe(2);
    expect(shelfLayout(1100, 17, 2).pages).toBe(3);
    expect(shelfLayout(1100, 17, 4).pages).toBe(2);
    expect(shelfLayout(198, 9, 3)).toEqual({ per: 2, itemWidth: 91, pages: 2 });
  });

  it('fills each page row by row before the next page starts', () => {
    const places = Array.from({ length: 10 }, (_, index) => shelfPlace(index, 4, 2));
    expect(places.map(({ page }) => page)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 1]);
    expect(places.map(({ row }) => row)).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 0, 0]);
    expect(places.map(({ column }) => column)).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0, 1]);
  });

  it('is the plain row when there is one', () => {
    expect(shelfPlace(9, 4, 1)).toEqual({ page: 2, row: 0, column: 1 });
  });
});

describe('flyoutPlacement', () => {
  it('opens to the right of the first column, the text at its widest', () => {
    expect(flyoutPlacement(1100, 263, 0)).toEqual({
      side: 'right',
      gutter: 34,
      rise: 37,
      width: 263 + 2 * 34 + 32 + 380,
      left: -50,
    });
  });

  it('opens to the left of the last column, ending past the item by a gutter', () => {
    const placement = flyoutPlacement(1100, 263, 3);
    expect(placement.side).toBe('left');
    expect(placement.left + placement.width).toBe(3 * 279 + 263 + 16 + 34);
  });

  it('stays on the right while the right has at least as much room as the left', () => {
    expect(flyoutPlacement(1100, 263, 1).side).toBe('right');
    expect(flyoutPlacement(1100, 263, 2).side).toBe('left');
  });

  it('gives the text what a narrow track leaves it, into the peek', () => {
    const placement = flyoutPlacement(198, 91, 0);
    expect(placement.side).toBe('right');
    expect(placement.width).toBe(91 + 2 * 17 + 32 + (198 - 91 - 17 + 38));
  });
});
