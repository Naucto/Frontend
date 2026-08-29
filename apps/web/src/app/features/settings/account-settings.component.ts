import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { unwrap } from '@app/core/api/api-errors';
import { AuthStore } from '@app/core/auth/auth.store';
import { ThemeService } from '@app/core/theme/theme.service';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { userControllerUpdateMyProfile } from '@naucto/api-client';
import {
  InputDirective,
  SegmentedComponent,
  SettingRowComponent,
  ToastService,
  ToggleComponent,
} from '@naucto/ui';

/** ACCOUNT tab: one row per setting, saved as you leave the field. */
@Component({
  selector: 'nc-account-settings',
  imports: [
    TranslocoDirective,
    InputDirective,
    SegmentedComponent,
    SettingRowComponent,
    ToggleComponent,
  ],
  template: `
    <div *transloco="let t">
      <nc-setting-row [title]="t('settings.displayName')" [hint]="t('settings.displayNameHint')">
        <input
          ncInput
          class="w-[200px]"
          [value]="nickname()"
          maxlength="32"
          [attr.aria-label]="t('settings.displayName')"
          [disabled]="saving()"
          (change)="save($event)"
        />
      </nc-setting-row>
      <nc-setting-row [title]="t('settings.theme')" [hint]="t('settings.themeHint')">
        <nc-segmented
          [options]="themes"
          [value]="theme.theme()"
          (valueChange)="setTheme($event)"
          size="sm"
        />
      </nc-setting-row>
      <nc-setting-row [title]="t('settings.reduceMotion')" [hint]="t('settings.reduceMotionHint')">
        <nc-toggle
          [checked]="theme.reduceMotion()"
          (checkedChange)="theme.reduceMotion.set($event)"
          [label]="t('settings.reduceMotion')"
        />
      </nc-setting-row>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountSettingsComponent {
  private readonly auth = inject(AuthStore);
  private readonly toasts = inject(ToastService);
  protected readonly theme = inject(ThemeService);
  private readonly transloco = inject(TranslocoService);
  protected readonly nickname = signal(this.auth.user()?.nickname ?? '');
  protected readonly saving = signal(false);
  protected readonly themes = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'system', label: 'System' },
  ];

  protected setTheme(v: string | undefined): void {
    if (v === 'dark' || v === 'light' || v === 'system') this.theme.theme.set(v);
  }

  protected async save(e: Event): Promise<void> {
    const value = (e.target as HTMLInputElement).value.trim();
    if (!value || value === this.nickname()) return;
    this.saving.set(true);
    const previous = this.auth.user()?.nickname ?? '';
    try {
      unwrap(await userControllerUpdateMyProfile({ body: { nickname: value } }));
      await this.auth.refreshProfile();
      this.nickname.set(value);
      this.toasts.show(this.transloco.translate('settings.saved'), 'success');
    } catch {
      // Put the field back to what the server still has, and say so.
      this.nickname.set(previous);
      this.toasts.show(this.transloco.translate('settings.saveFailed'), 'error');
    } finally {
      this.saving.set(false);
    }
  }
}
