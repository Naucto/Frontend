import { colourOf, inkFor } from './palette';

const RESERVED = ['#fafdff', '#ffd100', '#ff2674'];

describe('colourOf', () => {
  it('never hands out a reserved colour', () => {
    for (let i = 0; i < 200; i++) {
      expect(RESERVED).not.toContain(colourOf(i));
      expect(RESERVED).not.toContain(colourOf(`user-${String(i)}`));
    }
  });

  it('gives the same key the same colour every time', () => {
    expect(colourOf('alexis')).toBe(colourOf('alexis'));
    expect(colourOf(42)).toBe(colourOf(42));
  });
});

describe('inkFor', () => {
  it('puts the light ink on a dark fill', () => {
    expect(inkFor('#16171a')).toBe('var(--color-on-accent-dark)');
  });

  it('puts the dark ink on a bright fill', () => {
    expect(inkFor('#ffd100')).toBe('var(--color-on-accent)');
  });

  it('matches a fill regardless of case', () => {
    expect(inkFor('#16171A')).toBe(inkFor('#16171a'));
  });
});
