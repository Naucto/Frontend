import { colourOf, hashOf, inkFor } from './palette';

const RESERVED = ['#fafdff', '#ffd100', '#ff2674'];

describe('hashOf', () => {
  /** Pinned: a look drawn from it must not change with a release, a reload or a browser. */
  it('gives a text the same whole number every time, and on every load', () => {
    expect(hashOf('')).toBe(0);
    expect(hashOf('alexis')).toBe(1415071800);
    expect(hashOf('7c9e6679-7425-40de-944b-e07fc1f90ae7')).toBe(1406935180);
    expect(hashOf('7c9e6679-7425-40de-944b-e07fc1f90ae7')).toBe(
      hashOf('7c9e6679-7425-40de-944b-e07fc1f90ae7'),
    );
  });

  it('is never negative nor fractional, so it indexes a list as it stands', () => {
    for (let i = 0; i < 200; i++) {
      const hash = hashOf(`${String(i)}-0000-4000-8000-${String(i * 7919)}`);
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('colourOf', () => {
  it('never hands out a reserved colour', () => {
    for (let i = 0; i < 200; i++) {
      expect(RESERVED).not.toContain(colourOf(`user-${String(i)}`));
    }
  });

  it('gives the same key the same colour every time', () => {
    expect(colourOf('alexis')).toBe(colourOf('alexis'));
    expect(colourOf('7c9e6679-7425-40de-944b-e07fc1f90ae7')).toBe(
      colourOf('7c9e6679-7425-40de-944b-e07fc1f90ae7'),
    );
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

  it('reads a colour outside the palette by its luminance', () => {
    expect(inkFor('#21171a')).toBe('var(--color-on-accent-dark)');
    expect(inkFor('#e8e0c0')).toBe('var(--color-on-accent)');
  });

  it('keeps the dark ink on what is no hex colour', () => {
    expect(inkFor('transparent')).toBe('var(--color-on-accent)');
  });
});
