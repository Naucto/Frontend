import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { PanelComponent, TabsComponent } from '@naucto/ui';

import { AccountSettingsComponent } from './account-settings.component';
import { ControlsSettingsComponent } from './controls-settings.component';
import { EditorSettingsComponent } from './editor-settings.component';

// PRIVACY is gone: its three rows (friend code, who can join, delete account) moved to ACCOUNT,
// where the artboard draws them, and nothing was left on the tab but a placeholder.
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
  template: `
    <section *transloco="let t" class="mx-auto w-full max-w-[1000px]">
      <nc-panel [padded]="false">
        <h1 class="px-2.75 pt-2.75 text-title text-ink">{{ t('settings.title') }}</h1>
        <!-- No padding on the host: the panel variant already insets the tabs by the same 2.75,
             so setting it here too indented them twice as far as the title above and pulled the
             rule in from both panel edges. -->
        <nc-tabs
          [tabs]="tabs()"
          [value]="current()"
          (valueChange)="go($event)"
          [label]="t('settings.title')"
          class="mt-2 block"
        />
        <div class="px-2.75 py-2.75">
          @switch (current()) {
            @case ('account') {
              <nc-account-settings />
            }
            @case ('editor') {
              <nc-editor-settings />
            }
            @case ('controls') {
              <nc-controls-settings />
            }
          }
        </div>
      </nc-panel>
    </section>
  `,
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
