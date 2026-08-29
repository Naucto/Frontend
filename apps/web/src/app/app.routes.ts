import { type Routes } from '@angular/router';

import { authGuard, desktopOnlyGuard, guestGuard } from './core/auth/auth.guard';

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
    path: 'edit/:id',
    canActivate: [authGuard],
    canMatch: [desktopOnlyGuard],
    loadChildren: () => import('./features/editor/editor.routes').then((m) => m.EDITOR_ROUTES),
    title: 'Editor — Naucto',
  },
  {
    path: '',
    loadComponent: () =>
      import('./features/shell/app-shell.component').then((m) => m.AppShellComponent),
    children: [
      {
        path: 'open-on-desktop',
        loadComponent: () =>
          import('./features/editor/open-on-desktop.page').then((m) => m.OpenOnDesktopPage),
        title: 'Open on a desktop — Naucto',
      },
      { path: '', redirectTo: 'hub', pathMatch: 'full' },
      {
        path: 'hub',
        loadComponent: () => import('./features/hub/hub.page').then((m) => m.HubPage),
        title: 'Naucto',
      },
      {
        path: 'hub/all/:row',
        loadComponent: () => import('./features/hub/see-all.page').then((m) => m.SeeAllPage),
        title: 'Naucto',
      },
      {
        path: 'play/:id',
        loadComponent: () => import('./features/game/game.page').then((m) => m.GamePage),
        title: 'Play — Naucto',
      },
      { path: 'project/:id/play', redirectTo: 'play/:id' },
      {
        path: 'games',
        loadComponent: () => import('./features/games/my-games.page').then((m) => m.MyGamesPage),
        canActivate: [authGuard],
        title: 'My games — Naucto',
      },
      {
        path: 'games/new',
        loadComponent: () => import('./features/games/new-game.page').then((m) => m.NewGamePage),
        canActivate: [authGuard],
        title: 'New game — Naucto',
      },
      {
        path: 'learn',
        loadComponent: () => import('./features/learn/learn.page').then((m) => m.LearnPage),
        title: 'Learn — Naucto',
      },
      {
        path: 'learn/:path',
        loadComponent: () => import('./features/learn/learn.page').then((m) => m.LearnPage),
        title: 'Learn — Naucto',
      },
      {
        path: 'learn/:a/:b',
        loadComponent: () =>
          import('./features/learn/learn-nested.page').then((m) => m.LearnNestedPage),
        title: 'Learn — Naucto',
      },
      {
        path: 'friends',
        loadComponent: () => import('./features/friends/friends.page').then((m) => m.FriendsPage),
        canActivate: [authGuard],
        title: 'Friends — Naucto',
      },
      {
        path: 'u/:username',
        loadComponent: () => import('./features/profile/profile.page').then((m) => m.ProfilePage),
        title: 'Profile — Naucto',
      },
      { path: 'profile/:username', redirectTo: 'u/:username' },
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
