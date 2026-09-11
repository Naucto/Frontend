import { describe, expect, it } from 'vitest';

import { releaseParams } from './releases.queries';

/**
 * The endpoint ignores a parameter it does not know, so a wrong name reads as a catalogue with
 * nothing to filter rather than as an error. These names are the contract, and nothing else in the
 * app would notice them drifting.
 */
describe('releaseParams', () => {
  it('names each filter the way the endpoint reads it', () => {
    expect(releaseParams({ search: 'snake', sort: 'popular', tags: 'arcade' })).toEqual({
      search: 'snake',
      sort: 'popular',
      tags: 'arcade',
    });
  });

  it('leaves out what was not asked for, rather than sending it empty', () => {
    expect(releaseParams({ search: '' })).toEqual({});
    expect(releaseParams({})).toEqual({});
  });
});
