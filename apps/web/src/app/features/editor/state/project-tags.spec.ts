import { describe, expect, it } from 'vitest';

import { parseTags } from './project-tags';

describe('parseTags', () => {
  it('reads a JSON array as its entries, as strings', () => {
    expect(parseTags('["rpg", 3]')).toEqual(['rpg', '3']);
  });

  it('reads an empty text, a non-array or broken JSON as no tags', () => {
    expect(parseTags('')).toEqual([]);
    expect(parseTags('{"a":1}')).toEqual([]);
    expect(parseTags('["rp')).toEqual([]);
  });
});
