import type { ActivatedRouteSnapshot, Route } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { pagePath, routeKey } from './route-key';

const snapshot = (...chain: Route[]): ActivatedRouteSnapshot => {
  let node: ActivatedRouteSnapshot | null = null;
  for (const routeConfig of [...chain].reverse()) {
    node = { routeConfig, firstChild: node } as ActivatedRouteSnapshot;
  }
  return { routeConfig: null, firstChild: node } as ActivatedRouteSnapshot;
};

describe('routeKey', () => {
  it('keeps the template, never the values', () => {
    expect(routeKey(snapshot({ path: '' }, { path: 'play/:id' }))).toBe('play/:id');
  });

  it('does not measure the OAuth callbacks', () => {
    expect(routeKey(snapshot({ path: 'oauth' }, { path: 'google/callback' }))).toBeNull();
  });

  it('folds every unknown path into not-found', () => {
    expect(routeKey(snapshot({ path: '' }, { path: '**' }))).toBe('not-found');
  });
});

describe('pagePath', () => {
  it('drops the query and the fragment', () => {
    expect(pagePath('/learn/lua?tab=2#loops')).toBe('/learn/lua');
    expect(pagePath('/hub#top')).toBe('/hub');
    expect(pagePath('/hub')).toBe('/hub');
  });
});
