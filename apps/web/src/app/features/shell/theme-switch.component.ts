import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { SegmentedComponent, type SegmentOption } from '@naucto/ui';

import { ThemeService } from '../../core/theme/theme.service';

type Theme = 'dark' | 'light';

/**
 * Dark or light, from the chrome. It shows the theme in force, so someone following their system
 * sees which of the two they are in; choosing one here pins it, and Settings is where `system` is
 * given back.
 */
@Component({
  selector: 'nc-theme-switch',
  imports: [SegmentedComponent],
  templateUrl: './theme-switch.component.html',
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeSwitchComponent {
  protected readonly theme = inject(ThemeService);
  private readonly i18n = inject(TranslocoService);

  protected readonly label = computed(() => this.i18n.translate('account.theme'));
  protected readonly options = computed<SegmentOption<Theme>[]>(() => [
    { value: 'dark', label: this.i18n.translate('settings.themes.dark') },
    { value: 'light', label: this.i18n.translate('settings.themes.light') },
  ]);
}
