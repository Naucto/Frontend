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
    <main class="w-full flex-1 px-2 py-2 md:px-3 md:py-3">
      <router-outlet />
    </main>
    <nc-site-footer />
  `,
  host: { class: 'flex min-h-dvh flex-col overflow-x-hidden' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent {}
