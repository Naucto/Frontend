import { type Routes } from '@angular/router';

const EDITOR_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./editor-shell.component'),
    children: [
      { path: '', redirectTo: 'game', pathMatch: 'full' },
      {
        path: 'game',
        loadComponent: () => import('./game/game-tab.page'),
      },
      {
        path: 'code',
        loadComponent: () => import('./code/code-tab.page'),
      },
      {
        path: 'art',
        loadComponent: () => import('./art/art-tab.page'),
      },
      {
        path: 'map',
        loadComponent: () => import('./map/map-tab.page'),
      },
      {
        path: 'sound',
        loadComponent: () => import('./sound/sound-tab.page'),
      },
      {
        path: 'net',
        loadComponent: () => import('./net/net-tab.page'),
      },
    ],
  },
];

export default EDITOR_ROUTES;
