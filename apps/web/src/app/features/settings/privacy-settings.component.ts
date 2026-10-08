import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { userAnalyticsControllerErase, userAnalyticsControllerExport } from '@naucto/api-client';
import {
  ButtonDirective,
  ConfirmDialogComponent,
  DialogService,
  SettingRowComponent,
  ToastService,
} from '@naucto/ui';
import { QueryClient } from '@tanstack/angular-query-experimental';

import { BrowserAccountService } from '../../core/analytics/browser-account.service';
import { unwrap } from '../../core/api/api-errors';
import { FeaturesService } from '../../core/config/features.service';
import { ConsentChoiceComponent } from '../../shared/consent/consent-choice.component';
import { injectMyAnalytics } from '../../shared/queries/analytics.queries';
import { qk } from '../../shared/queries/query-keys';
import { playTime } from './play-time';

/**
 * The usage-analytics choice, and what was counted for the account: shown, downloadable and
 * erasable even once collection is switched off, since the history outlives the switch.
 */
@Component({
  selector: 'nc-privacy-settings',
  imports: [
    TranslocoDirective,
    DatePipe,
    DecimalPipe,
    RouterLink,
    ButtonDirective,
    SettingRowComponent,
    ConsentChoiceComponent,
  ],
  templateUrl: './privacy-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacySettingsComponent {
  protected readonly features = inject(FeaturesService);
  protected readonly stats = injectMyAnalytics();
  protected readonly exporting = signal(false);
  protected readonly erasing = signal(false);

  private readonly account = inject(BrowserAccountService);
  private readonly queries = inject(QueryClient);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  protected duration(ms: number): string {
    const { hours, minutes } = playTime(ms);
    if (hours === 0) {
      return this.transloco.translate('settings.analytics.minutes', { minutes });
    }
    return minutes === 0
      ? this.transloco.translate('settings.analytics.wholeHours', { hours })
      : this.transloco.translate('settings.analytics.hours', { hours, minutes });
  }

  protected async download(): Promise<void> {
    this.exporting.set(true);
    try {
      const data = unwrap(await userAnalyticsControllerExport());
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'naucto-usage-data.json';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      this.toasts.show(this.transloco.translate('settings.analytics.exportFailed'), 'error');
    } finally {
      this.exporting.set(false);
    }
  }

  protected confirmErase(): void {
    this.dialogs
      .open(ConfirmDialogComponent, {
        data: {
          title: this.transloco.translate('settings.analytics.eraseConfirmTitle'),
          message: this.transloco.translate('settings.analytics.eraseConfirmHint'),
          confirmLabel: this.transloco.translate('settings.analytics.eraseButton'),
          danger: true,
        },
      })
      .closed.subscribe((ok) => {
        if (ok) {
          void this.erase();
        }
      });
  }

  private async erase(): Promise<void> {
    this.erasing.set(true);
    try {
      unwrap(await userAnalyticsControllerErase());
      await this.account.afterErase();
      this.toasts.show(this.transloco.translate('settings.analytics.erased'), 'success');
    } catch {
      this.toasts.show(this.transloco.translate('settings.analytics.eraseFailed'), 'error');
    } finally {
      this.erasing.set(false);
      void this.queries.invalidateQueries({ queryKey: qk.myAnalytics() });
    }
  }
}
