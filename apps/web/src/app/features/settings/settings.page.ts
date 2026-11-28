import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { TabsComponent } from '@naucto/ui';

import { FeaturesService } from '../../core/config/features.service';
import { ControlsComponent } from '../../shared/controls/controls.component';
import { AccountSettingsComponent } from './account-settings.component';
import { AssistantSettingsComponent } from './assistant-settings.component';
import { EditorSettingsComponent } from './editor-settings.component';
import { PrivacySettingsComponent } from './privacy-settings.component';
import { StandingSettingsComponent } from './standing-settings.component';

type Tab = 'account' | 'editor' | 'controls' | 'assistant' | 'privacy' | 'standing';
const TABS: Tab[] = ['account', 'editor', 'controls', 'assistant', 'privacy', 'standing'];

@Component({
  selector: 'nc-settings-page',
  imports: [
    TranslocoDirective,
    TabsComponent,
    AccountSettingsComponent,
    AssistantSettingsComponent,
    ControlsComponent,
    EditorSettingsComponent,
    PrivacySettingsComponent,
    StandingSettingsComponent,
  ],
  templateUrl: './settings.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SettingsPage {
  readonly tab = input<string>();
  private readonly router = inject(Router);
  private readonly features = inject(FeaturesService);
  /** The standing is part of moderation, and shows only where moderation is on. */
  private readonly offered = computed(() =>
    TABS.filter((tab) => tab !== 'standing' || this.features.moderation()),
  );
  protected readonly current = computed<Tab>(() =>
    this.offered().includes(this.tab() as Tab) ? (this.tab() as Tab) : 'account',
  );
  private readonly i18n = inject(TranslocoService);
  protected readonly tabs = computed(() =>
    this.offered().map((value) => ({ value, label: this.i18n.translate(`settings.${value}`) })),
  );

  protected go(tab: Tab | undefined): void {
    if (tab) {
      void this.router.navigate(['/settings', tab]);
    }
  }
}
