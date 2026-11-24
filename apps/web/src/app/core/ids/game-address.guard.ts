import { inject } from '@angular/core';
import { type CanMatchFn, Router } from '@angular/router';
import { projectControllerFindLegacy } from '@naucto/api-client';

import { isId } from './ids';

/** What a link written while projects were numbered holds in place of an id. */
const LEGACY_NUMBER = /^\d+$/;

/**
 * Decides what `/play/:id` and `/edit/:id` are given, before either page is built.
 *
 * An id matches. A number is a link from the time projects were numbered: the server says which
 * project it named, and the navigation is sent on to the same address under that id, with its
 * child path, its query and its fragment. The page is never built on a number, and since the
 * redirect comes out of the guard the numbered address never becomes a history entry. Anything
 * else, and a number no project had, does not match: the address falls through to not-found.
 */
export const gameAddressGuard: CanMatchFn = (_route, segments, snapshot) => {
  const [page = '', id = '', ...rest] = segments.map((segment) => segment.path);
  if (isId(id)) {
    return true;
  }
  if (!LEGACY_NUMBER.test(id)) {
    return false;
  }
  const router = inject(Router);
  return projectControllerFindLegacy({ path: { number: Number(id) } }).then(
    ({ data }) =>
      data
        ? router.createUrlTree([`/${page}`, data.id, ...rest], {
            queryParams: snapshot.queryParams,
            fragment: snapshot.fragment ?? undefined,
          })
        : false,
    () => false,
  );
};
