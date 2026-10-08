import { type Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/auth/auth.guard';

/**
 * The literal `false` in a production build, where the builder substitutes it; undefined or an
 * object otherwise. Read through `typeof`: a development bundle does not define it until Angular
 * first runs, which is after this file is evaluated.
 */
declare const ngDevMode: unknown;

export const routes: Routes = [
  {
    path: 'oauth',
    children: [
      {
        path: 'google/callback',
        loadComponent: () => import('./features/auth/oauth-callback/oauth-callback.page'),
        data: { provider: 'google' },
      },
      {
        path: 'callback',
        loadComponent: () => import('./features/auth/oauth-callback/oauth-callback.page'),
        data: { provider: 'github' },
      },
      {
        path: 'microsoft/callback',
        loadComponent: () => import('./features/auth/oauth-callback/oauth-callback.page'),
        data: { provider: 'microsoft' },
      },
    ],
  },
  {
    path: 'edit/:id',
    canActivate: [authGuard],
    loadChildren: () => import('./features/editor/editor.routes'),
    title: 'Editor — Naucto',
  },
  {
    path: '',
    loadComponent: () => import('./features/shell/app-shell.component'),
    children: [
      { path: '', redirectTo: 'hub', pathMatch: 'full' },
      {
        path: 'hub',
        loadComponent: () => import('./features/hub/hub.page'),
        title: 'Naucto',
      },
      {
        path: 'hub/all/:row',
        loadComponent: () => import('./features/hub/see-all.page'),
        title: 'Naucto',
      },
      {
        path: 'play/:id',
        loadComponent: () => import('./features/game/game.page'),
        title: 'Play — Naucto',
      },
      {
        path: 'games',
        loadComponent: () => import('./features/games/my-games.page'),
        canActivate: [authGuard],
        title: 'My games — Naucto',
      },
      {
        path: 'games/new',
        loadComponent: () => import('./features/games/new-game.page'),
        canActivate: [authGuard],
        title: 'New game — Naucto',
      },
      {
        path: 'learn',
        loadComponent: () => import('./features/learn/learn.page'),
        title: 'Learn — Naucto',
      },
      {
        path: 'learn/:path',
        loadComponent: () => import('./features/learn/learn.page'),
        title: 'Learn — Naucto',
      },
      {
        path: 'learn/:a/:b',
        loadComponent: () => import('./features/learn/learn-nested.page'),
        title: 'Learn — Naucto',
      },
      {
        path: 'friends',
        loadComponent: () => import('./features/friends/friends.page'),
        canActivate: [authGuard],
        title: 'Friends — Naucto',
      },
      {
        path: 'u/:username',
        loadComponent: () => import('./features/profile/profile.page'),
        title: 'Profile — Naucto',
      },
      {
        path: 'sign-in',
        loadComponent: () => import('./features/auth/sign-in.page'),
        canActivate: [guestGuard],
        title: 'Sign in — Naucto',
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/settings.page'),
        canActivate: [authGuard],
        title: 'Settings — Naucto',
      },
      {
        path: 'settings/:tab',
        loadComponent: () => import('./features/settings/settings.page'),
        canActivate: [authGuard],
        title: 'Settings — Naucto',
      },
      // The kit's showcase is a development surface. The condition is one the bundler folds, so a
      // production build holds neither the route nor the page's chunk.
      ...(typeof ngDevMode === 'undefined' || ngDevMode
        ? [
            {
              path: 'ui-kit',
              loadComponent: () => import('./features/ui-kit/ui-kit.page'),
              title: 'Naucto — UI kit',
            },
          ]
        : []),
      {
        path: 'privacy',
        loadComponent: () => import('./features/privacy/privacy.page'),
        title: 'Privacy | Naucto',
      },
      {
        path: '**',
        loadComponent: () => import('./features/not-found/not-found.page'),
        title: 'Not found — Naucto',
      },
    ],
  },
];
