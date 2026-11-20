import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { SuspensionBandComponent } from '../../shared/moderation/suspension-band.component';
import { CommandPaletteShortcutDirective } from './command-palette-shortcut.directive';
import { SiteFooterComponent } from './site-footer.component';
import { TopBarComponent } from './top-bar.component';

/** Chrome for every non-editor page: top bar, routed content, footer. */
@Component({
  selector: 'nc-app-shell',
  imports: [RouterOutlet, TopBarComponent, SiteFooterComponent, SuspensionBandComponent],
  templateUrl: './app-shell.component.html',
  hostDirectives: [CommandPaletteShortcutDirective],
  host: { class: 'flex min-h-dvh flex-col overflow-x-clip' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class AppShellComponent {}
