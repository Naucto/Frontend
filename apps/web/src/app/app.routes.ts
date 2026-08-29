import { type Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'ui-kit',
    loadComponent: () => import('./features/ui-kit/ui-kit.page').then((m) => m.UiKitPage),
    title: 'Naucto — UI kit',
  },
];
