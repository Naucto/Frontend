import { type Routes } from '@angular/router';

import { ArtStore } from './art/art.store';
import { MapStore } from './map/map.store';
import { SoundStore } from './sound/sound.store';
import { ClipboardStore } from './state/clipboard.store';

export const EDITOR_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./editor-shell.component').then((m) => m.EditorShellComponent),
    /**
     * A tab's state belongs to the editing session, not to the tab's own lifetime.
     *
     * Provided on each page, these were destroyed and rebuilt on every navigation: turning the flag
     * overlay off, going to CODE and coming back turned it on again, and so did the grid, the onion,
     * the zoom, the tool in hand and the sprite being worked on. Provided here they live exactly as
     * long as the project is open, and are gone when it is closed.
     */
    providers: [ArtStore, ClipboardStore, MapStore, SoundStore],
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
        loadComponent: () => import('./art/art-tab.page').then((m) => m.ArtTabPage),
      },
      {
        path: 'map',
        loadComponent: () => import('./map/map-tab.page').then((m) => m.MapTabPage),
      },
      {
        path: 'sound',
        loadComponent: () => import('./sound/sound-tab.page').then((m) => m.SoundTabPage),
      },
      {
        path: 'net',
        loadComponent: () => import('./net/net-tab.page').then((m) => m.NetTabPage),
      },
    ],
  },
];
