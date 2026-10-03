import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { PanelComponent, TabsComponent } from '@naucto/ui';

import { AccountSettingsComponent } from './account-settings.component';
import { ControlsSettingsComponent } from './controls-settings.component';
import { EditorSettingsComponent } from './editor-settings.component';

type Tab = 'account' | 'editor' | 'controls';
const TABS: Tab[] = ['account', 'editor', 'controls'];

@Component({
  selector: 'nc-settings-page',
  imports: [
    TranslocoDirective,
    PanelComponent,
    TabsComponent,
    AccountSettingsComponent,
    ControlsSettingsComponent,
    EditorSettingsComponent,
  ],
  templateUrl: './settings.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage {
  readonly tab = input<string>();
  private readonly router = inject(Router);
  protected readonly current = computed<Tab>(() =>
    TABS.includes(this.tab() as Tab) ? (this.tab() as Tab) : 'account',
  );
  private readonly i18n = inject(TranslocoService);
  protected readonly tabs = computed(() =>
    TABS.map((value) => ({ value, label: this.i18n.translate(`settings.${value}`) })),
  );

  protected go(tab: Tab | undefined): void {
    if (tab) void this.router.navigate(['/settings', tab]);
  }
}
