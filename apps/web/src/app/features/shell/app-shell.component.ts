import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { SiteFooterComponent } from './site-footer.component';
import { TopBarComponent } from './top-bar.component';

/** Chrome for every non-editor page: top bar, routed content, footer. */
@Component({
  selector: 'nc-app-shell',
  imports: [RouterOutlet, TopBarComponent, SiteFooterComponent],
  template: `
    <nc-top-bar />
    <!-- A column, so a page that has one thing to show can centre it on the height actually left
         between the bar and the footer rather than on a guessed fraction of the window. -->
    <main class="flex w-full flex-1 flex-col px-2 py-2 md:px-3 md:py-3">
      <router-outlet />
    </main>
    <nc-site-footer />
  `,
  host: { class: 'flex min-h-dvh flex-col overflow-x-hidden' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent {}
