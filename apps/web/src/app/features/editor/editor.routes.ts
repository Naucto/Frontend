import { type Routes } from '@angular/router';

export const EDITOR_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./editor-shell.component').then((m) => m.EditorShellComponent),
    children: [
      { path: '', redirectTo: 'game', pathMatch: 'full' },
      {
        path: 'game',
        loadComponent: () => import('./game/game-tab.page').then((m) => m.GameTabPage),
      },
      {
        path: 'code',
        loadComponent: () => import('./code/code-tab.page').then((m) => m.CodeTabPage),
      },
      {
        path: 'art',
        loadComponent: () => import('./placeholder-tab.page').then((m) => m.PlaceholderTabPage),
        data: { tab: 'art' },
      },
      {
        path: 'map',
        loadComponent: () => import('./placeholder-tab.page').then((m) => m.PlaceholderTabPage),
        data: { tab: 'map' },
      },
      {
        path: 'sound',
        loadComponent: () => import('./placeholder-tab.page').then((m) => m.PlaceholderTabPage),
        data: { tab: 'sound' },
      },
      {
        path: 'net',
        loadComponent: () => import('./placeholder-tab.page').then((m) => m.PlaceholderTabPage),
        data: { tab: 'net' },
      },
    ],
  },
];
