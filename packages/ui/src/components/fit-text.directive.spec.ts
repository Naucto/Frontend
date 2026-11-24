import { fitScale } from './fit-text.directive';

describe('fitScale', () => {
  it('leaves a line that fits as it is', () => {
    expect(fitScale(400, 320, 0.62)).toBe(1);
    expect(fitScale(400, 400, 0.62)).toBe(1);
  });

  it('narrows a line just enough to fit', () => {
    expect(fitScale(400, 500, 0.62)).toBe(0.8);
  });

  it('stops at the tightest it may be, past which the line is cut', () => {
    expect(fitScale(400, 1000, 0.62)).toBe(0.62);
  });
});
