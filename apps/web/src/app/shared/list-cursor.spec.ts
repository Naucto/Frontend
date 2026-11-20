import { arrowStep } from './list-cursor';

describe('arrowStep', () => {
  it('steps down and up, wrapping at both ends', () => {
    expect(arrowStep('ArrowDown', 0, 3)).toBe(1);
    expect(arrowStep('ArrowDown', 2, 3)).toBe(0);
    expect(arrowStep('ArrowUp', 0, 3)).toBe(2);
  });

  it('keeps the cursor of an empty list, and answers for no other key', () => {
    expect(arrowStep('ArrowDown', -1, 0)).toBe(-1);
    expect(arrowStep('Enter', 0, 3)).toBeNull();
  });
});
