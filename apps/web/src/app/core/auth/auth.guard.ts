import { inject } from '@angular/core';
import { type CanActivateFn, type CanMatchFn, Router } from '@angular/router';

import { AuthStore } from './auth.store';

/** Redirects anonymous users to /sign-in, keeping the target in ?next=. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthStore);
  if (auth.isAuthenticated()) return true;
  return inject(Router).createUrlTree(['/sign-in'], { queryParams: { next: state.url } });
};

/** Keeps signed-in users away from sign-in/register. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthStore);
  return auth.isAuthenticated() ? inject(Router).createUrlTree(['/hub']) : true;
};

/** The editor needs a desktop-sized viewport for now (phone layouts are a later milestone). */
export const desktopOnlyGuard: CanMatchFn = () =>
  typeof window === 'undefined' ? true : window.innerWidth >= 1024;
