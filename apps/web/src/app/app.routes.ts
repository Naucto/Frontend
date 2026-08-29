import { type Routes } from '@angular/router';

import { authGuard, guestGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'oauth',
    children: [
      {
        path: 'google/callback',
        loadComponent: () =>
          import('./features/auth/oauth-callback/oauth-callback.page').then(
            (m) => m.OAuthCallbackPage,
          ),
        data: { provider: 'google' },
      },
      {
        path: 'callback',
        loadComponent: () =>
          import('./features/auth/oauth-callback/oauth-callback.page').then(
            (m) => m.OAuthCallbackPage,
          ),
        data: { provider: 'github' },
      },
      {
        path: 'microsoft/callback',
        loadComponent: () =>
          import('./features/auth/oauth-callback/oauth-callback.page').then(
            (m) => m.OAuthCallbackPage,
          ),
        data: { provider: 'microsoft' },
      },
    ],
  },
  {
    path: '',
    loadComponent: () =>
      import('./features/shell/app-shell.component').then((m) => m.AppShellComponent),
    children: [
      { path: '', redirectTo: 'hub', pathMatch: 'full' },
      {
        path: 'hub',
        loadComponent: () => import('./features/hub/hub.page').then((m) => m.HubPage),
        title: 'Naucto',
      },
      {
        path: 'sign-in',
        loadComponent: () => import('./features/auth/sign-in.page').then((m) => m.SignInPage),
        canActivate: [guestGuard],
        title: 'Sign in — Naucto',
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.page').then((m) => m.SettingsPage),
        canActivate: [authGuard],
        title: 'Settings — Naucto',
      },
      {
        path: 'settings/:tab',
        loadComponent: () =>
          import('./features/settings/settings.page').then((m) => m.SettingsPage),
        canActivate: [authGuard],
        title: 'Settings — Naucto',
      },
      {
        path: 'ui-kit',
        loadComponent: () => import('./features/ui-kit/ui-kit.page').then((m) => m.UiKitPage),
        title: 'Naucto — UI kit',
      },
      {
        path: '**',
        loadComponent: () =>
          import('./features/not-found/not-found.page').then((m) => m.NotFoundPage),
        title: 'Not found — Naucto',
      },
    ],
  },
];
