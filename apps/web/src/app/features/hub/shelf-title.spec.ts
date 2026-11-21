import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { beforeEach, describe, expect, it } from 'vitest';

import { testProviders } from '../../testing/providers';
import { shelfTag, shelfTitle } from './shelf-title';

describe('a shelf key', () => {
  let transloco: TranslocoService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: testProviders() });
    transloco = TestBed.inject(TranslocoService);
    transloco.setActiveLang('en');
    return new Promise<void>((resolve) => {
      transloco.load('en').subscribe(() => {
        resolve();
      });
    });
  });

  it('names its tag, when it is a tag shelf', () => {
    expect(shelfTag('tag:two-player')).toBe('two-player');
    expect(shelfTag('popular')).toBeNull();
  });

  it('titles a tag shelf by its tag, capitalised, and the others by their name', () => {
    expect(shelfTitle('tag:two-player', transloco)).toBe('Two-player');
    expect(shelfTitle('trending', transloco)).toBe('Trending this week');
    expect(shelfTitle('friends', transloco)).toBe('Your friends play');
  });
});
