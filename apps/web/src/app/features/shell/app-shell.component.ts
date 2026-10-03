import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { SiteFooterComponent } from './site-footer.component';
import { TopBarComponent } from './top-bar.component';

/** Chrome for every non-editor page: top bar, routed content, footer. */
@Component({
  selector: 'nc-app-shell',
  imports: [RouterOutlet, TopBarComponent, SiteFooterComponent],
  templateUrl: './app-shell.component.html',
  host: { class: 'flex min-h-dvh flex-col overflow-x-clip' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class AppShellComponent {}
