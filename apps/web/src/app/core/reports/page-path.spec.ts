import { describe, expect, it } from 'vitest';

import { pagePath } from './page-path';

describe('pagePath', () => {
  it('keeps the path and drops the query and fragment', () => {
    expect(pagePath('/play/42?from=hub#top')).toBe('/play/42');
  });

  it('drops the characters the server refuses', () => {
    expect(pagePath('/u/zoë')).toBe('/u/zo');
    expect(pagePath('hub')).toBe('/hub');
  });
});
