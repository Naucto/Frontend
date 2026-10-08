import type { ActivatedRouteSnapshot, Route, Routes } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { routes } from './app.routes';
import { routeKey } from './core/analytics/route-key';
import editorRoutes from './features/editor/editor.routes';

/** The backend's `ROUTE_PATTERN` and `ROUTE_MAX_LENGTH`: a key it refuses loses the whole batch. */
const ROUTE_PATTERN = /^(?:not-found|[a-z0-9_-]+(?:\/(?::[a-zA-Z]+|[a-z0-9_-]+))*)$/;
const ROUTE_MAX_LENGTH = 80;

/** Every chain of route configs a navigation can end on, with the editor's lazy children. */
const chains = (list: Routes, parents: Route[] = []): Route[][] =>
  list.flatMap((route) => {
    if (route.redirectTo !== undefined) {
      return [];
    }
    const chain = [...parents, route];
    const children = route.path === 'edit/:id' ? editorRoutes : route.children;
    return children ? chains(children, chain) : [chain];
  });

const snapshot = (chain: Route[]): ActivatedRouteSnapshot => {
  let node: ActivatedRouteSnapshot | null = null;
  for (const routeConfig of [...chain].reverse()) {
    node = { routeConfig, firstChild: node } as ActivatedRouteSnapshot;
  }
  return { routeConfig: null, firstChild: node } as ActivatedRouteSnapshot;
};

describe('app routes', () => {
  it('names every routed page with a key the backend accepts', () => {
    const keys = chains(routes)
      .map((chain) => routeKey(snapshot(chain)))
      .filter((key): key is string => key !== null);

    expect(keys).toContain('play/:id');
    expect(keys).toContain('edit/:id/code');
    expect(keys).toContain('not-found');
    for (const key of keys) {
      expect(key).toMatch(ROUTE_PATTERN);
      expect(key.length).toBeLessThanOrEqual(ROUTE_MAX_LENGTH);
    }
  });
});
