import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { PanelComponent, TabsComponent } from '@naucto/ui';

import { AccountSettingsComponent } from './account-settings.component';

type Tab = 'account' | 'editor' | 'controls' | 'privacy';
const TABS: Tab[] = ['account', 'editor', 'controls', 'privacy'];

@Component({
  selector: 'nc-settings-page',
  imports: [TranslocoDirective, PanelComponent, TabsComponent, AccountSettingsComponent],
  template: `
    <section *transloco="let t" class="mx-auto w-full max-w-[880px]">
      <nc-panel [padded]="false">
        <h1 class="px-2.75 pt-2.5 text-title text-ink">{{ t('settings.title') }}</h1>
        <nc-tabs
          [tabs]="tabs()"
          [value]="current()"
          (valueChange)="go($event)"
          [label]="t('settings.title')"
          class="mt-1.75 block px-2.75"
        />
        <div class="px-2.75 py-2.5">
          @switch (current()) {
            @case ('account') {
              <nc-account-settings />
            }
            @default {
              <p class="text-body text-ink-2">{{ t('settings.soon') }}</p>
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
