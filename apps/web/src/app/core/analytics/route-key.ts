import type { ActivatedRouteSnapshot } from '@angular/router';

/** Routes never measured: the OAuth popup closes before anyone sees it. */
const UNMEASURED = new Set(['oauth']);

/**
 * The route template a navigation landed on, as the router declares it, without a leading slash:
 * `play/:id`, never `play/42`. The wildcard is `not-found`. Null for a route that is not measured.
 */
export function routeKey(root: ActivatedRouteSnapshot): string | null {
  const segments: string[] = [];
  for (let node: ActivatedRouteSnapshot | null = root; node; node = node.firstChild) {
    const path = node.routeConfig?.path;
    if (path === '**') {
      return 'not-found';
    }
    if (path) {
      segments.push(path);
    }
  }
  const key = segments.join('/');
  if (!key || UNMEASURED.has(key.split('/')[0] ?? '')) {
    return null;
  }
  return key;
}

/** A URL's path alone, which is what tells one page view from the next. */
export function pagePath(url: string): string {
  const end = url.search(/[?#]/);
  return end === -1 ? url : url.slice(0, end);
}
