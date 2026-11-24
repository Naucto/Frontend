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
  // A stacking context of its own: a backdrop a page sets at z -1, as the hub does, lies under
  // everything the shell holds, and nothing beside `main` has to be stacked over it.
  host: { class: 'isolate flex min-h-dvh flex-col overflow-x-clip' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class AppShellComponent {}
