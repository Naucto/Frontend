import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonDirective, IconComponent, TooltipDirective } from '@naucto/ui';

import { ThemeService } from '../../core/theme/theme.service';

/**
 * Dark or light, from the chrome. It shows the theme in force, so someone following their system
 * sees which of the two they are in; pressing it pins the other, and Settings is where `system` is
 * given back.
 */
@Component({
  selector: 'nc-theme-switch',
  imports: [TranslocoDirective, ButtonDirective, IconComponent, TooltipDirective],
  templateUrl: './theme-switch.component.html',
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeSwitchComponent {
  protected readonly theme = inject(ThemeService);
}
