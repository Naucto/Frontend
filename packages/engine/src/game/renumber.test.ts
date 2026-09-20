import { describe, expect, it } from 'vitest';

import { remapSprites, rewriteSpriteNumbers, survives } from './renumber';

const sheet = (
  id: string,
  width: number,
  height: number,
  base: number,
): { id: string; width: number; height: number; base: number } => ({
  id,
  width,
  height,
  base,
});

describe('remapSprites', () => {
  /**
   * The picture stays where it is and the grid re-flows over it: at sixteen columns the cell below
   * the first is number 16, and at twenty-four columns the same cell is number 24.
   */
  it('follows a cell to its new number when a sheet widens', () => {
    const moves = remapSprites([sheet('a', 128, 128, 0)], [sheet('a', 192, 128, 0)]);

    expect(moves.get(16)).toBe(24);
    expect(moves.get(17)).toBe(25);
    // The first row is where it was, so it is not in the map at all.
    expect(moves.has(0)).toBe(false);
    expect(moves.has(15)).toBe(false);
  });

  it('drops the cells that fall outside the new shape', () => {
    const moves = remapSprites([sheet('a', 128, 128, 0)], [sheet('a', 64, 128, 0)]);

    // Eight columns wide now, so column 8 and past it are gone: 24 was row 1 column 8.
    expect(moves.has(24)).toBe(false);
    // What is left re-flows: row 1 column 0 was 16 and is now 8.
    expect(moves.get(16)).toBe(8);
  });

  /** Numbers run on from one sheet to the next, so resizing one moves every sheet after it. */
  it('shifts the sheets that come after the one that changed', () => {
    const before = [sheet('a', 128, 128, 0), sheet('b', 64, 64, 256)];
    const after = [sheet('a', 64, 128, 0), sheet('b', 64, 64, 128)];
    const moves = remapSprites(before, after);

    expect(moves.get(256)).toBe(128);
    expect(moves.get(257)).toBe(129);
  });

  it('says which numbers survive at all', () => {
    const before = [sheet('a', 128, 128, 0)];
    const after = [sheet('a', 64, 128, 0)];

    expect(survives(16, before, after)).toBe(true);
    expect(survives(24, before, after)).toBe(false);
  });
});

describe('rewriteSpriteNumbers', () => {
  const moves = new Map([
    [16, 24],
    [3, 5],
  ]);

  it('rewrites the argument each call keeps its sprite number in', () => {
    const out = rewriteSpriteNumbers(
      'gfx.draw_sprite(16, 0, 0)\nmap.set(1, 2, 16)\nmap.flag(3)\n',
      moves,
    );

    expect(out.text).toBe('gfx.draw_sprite(24, 0, 0)\nmap.set(1, 2, 24)\nmap.flag(5)\n');
    expect(out.changed).toBe(3);
    expect(out.unsure).toBe(0);
  });

  /** `map.set(tx, ty, n)` keeps its number third: rewriting the first would move tiles about. */
  it('leaves the coordinates of a call alone', () => {
    const out = rewriteSpriteNumbers('map.set(16, 16, 1)', moves);

    expect(out.text).toBe('map.set(16, 16, 1)');
    expect(out.changed).toBe(0);
  });

  it('counts what it cannot know, rather than guessing', () => {
    const out = rewriteSpriteNumbers('gfx.draw_sprite(n + 1, 0, 0)', moves);

    expect(out.text).toBe('gfx.draw_sprite(n + 1, 0, 0)');
    expect(out.changed).toBe(0);
    expect(out.unsure).toBe(1);
  });

  it('does not read a call out of a string or a comment', () => {
    const source = '-- gfx.draw_sprite(16, 0, 0)\nprint("gfx.draw_sprite(16)")\n';
    const out = rewriteSpriteNumbers(source, moves);

    expect(out.text).toBe(source);
    expect(out.changed).toBe(0);
  });

  it('is not fooled by a longer name ending in one it knows', () => {
    const out = rewriteSpriteNumbers('my_sprite(16)', moves);

    expect(out.text).toBe('my_sprite(16)');
    expect(out.changed).toBe(0);
  });

  it('keeps a nested call whole', () => {
    const out = rewriteSpriteNumbers('gfx.draw_sprite(16, math.floor(x), 0)', moves);

    expect(out.text).toBe('gfx.draw_sprite(24, math.floor(x), 0)');
    expect(out.changed).toBe(1);
  });

  /** A file being typed has an unclosed bracket most of the time; it is left exactly as it is. */
  it('leaves an unfinished call alone', () => {
    const source = 'gfx.draw_sprite(16, ';
    const out = rewriteSpriteNumbers(source, moves);

    expect(out.text).toBe(source);
    expect(out.changed).toBe(0);
  });
});
