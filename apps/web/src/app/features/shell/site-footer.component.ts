import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { ENGINE_VERSION } from '@naucto/engine/version';
import { IconComponent, LogoComponent } from '@naucto/ui';

import { ThemeService } from '../../core/theme/theme.service';

/** Hub/learn pages only — never rendered in the editor. */
@Component({
  selector: 'nc-site-footer',
  imports: [RouterLink, TranslocoDirective, IconComponent, LogoComponent],
  templateUrl: './site-footer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteFooterComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly engineVersion = ENGINE_VERSION;
}
