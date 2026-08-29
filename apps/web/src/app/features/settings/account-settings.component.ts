import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { unwrap } from '@app/core/api/api-errors';
import { type JoinPolicy, meApi } from '@app/core/api/planned.api';
import { AuthStore } from '@app/core/auth/auth.store';
import { ThemeService } from '@app/core/theme/theme.service';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { userControllerUpdateMyProfile } from '@naucto/api-client';
import {
  ButtonDirective,
  ConfirmDialogComponent,
  DialogService,
  FriendCodeComponent,
  InputDirective,
  SegmentedComponent,
  SettingRowComponent,
  ToastService,
  ToggleComponent,
} from '@naucto/ui';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';

const POLICIES: JoinPolicy[] = ['ANYONE', 'FRIENDS', 'CODE_ONLY'];

/**
 * ACCOUNT tab: one row per setting, saved as you leave the field.
 *
 * Identity, reach and destruction all live here, in the artboard's order. They used to be split
 * across a second PRIVACY tab, which put the friend code two clicks from the display name it
 * belongs beside and left nothing else on the tab worth showing.
 */
@Component({
  selector: 'nc-account-settings',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    FriendCodeComponent,
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
      @if (me.isError()) {
        <p class="py-2 text-body text-ink-3">{{ t('settings.privacySoon') }}</p>
      } @else {
        <nc-setting-row [title]="t('settings.friendCode')" [hint]="t('settings.friendCodeHint')">
          <nc-friend-code
            class="w-[210px]"
            [code]="me.data()?.friendCode"
            [regenerable]="true"
            [copyLabel]="t('settings.copy')"
            [regenerateLabel]="t('settings.regenerate')"
            (copied)="copy()"
            (regenerate)="regenerate()"
          />
        </nc-setting-row>
        <nc-setting-row [title]="t('settings.joinPolicy')" [hint]="t('settings.joinPolicyHint')">
          <nc-segmented
            [options]="policies()"
            [value]="me.data()?.sessionJoinPolicy ?? 'ANYONE'"
            (valueChange)="setPolicy($event)"
            size="sm"
          />
        </nc-setting-row>
      }
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
      <nc-setting-row [title]="t('settings.showFps')" [hint]="t('settings.showFpsHint')">
        <nc-toggle
          [checked]="theme.showFps()"
          (checkedChange)="theme.showFps.set($event)"
          [label]="t('settings.showFps')"
        />
      </nc-setting-row>
      <nc-setting-row
        [title]="t('settings.deleteAccount')"
        [hint]="t('settings.deleteHint')"
        [danger]="true"
      >
        <button ncButton variant="danger" size="sm" (click)="confirmDelete()">
          {{ t('settings.delete') }}
        </button>
      </nc-setting-row>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountSettingsComponent {
  private readonly auth = inject(AuthStore);
  private readonly qc = inject(QueryClient);
  private readonly toasts = inject(ToastService);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);
  private readonly transloco = inject(TranslocoService);
  /**
   * Linked, not a plain signal: the profile arrives after the silent refresh at boot, so reading it
   * once in a field initialiser left the field permanently blank. Falls back to the username,
   * which is what every other surface shows when no nickname is set.
   */
  protected readonly nickname = linkedSignal(
    () => this.auth.user()?.nickname ?? this.auth.user()?.username ?? '',
  );
  protected readonly saving = signal(false);
  protected readonly themes = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'system', label: 'System' },
  ];
  protected readonly me = injectQuery(() => ({
    queryKey: ['me'],
    queryFn: () => meApi.get(),
    retry: false,
  }));
  protected readonly policies = computed(() =>
    POLICIES.map((value) => ({
      value,
      label: this.transloco.translate(`settings.policies.${value}`),
    })),
  );
  private readonly update = injectMutation(() => ({
    mutationFn: (policy: JoinPolicy) => meApi.update({ sessionJoinPolicy: policy }),
    onSuccess: () => this.qc.invalidateQueries({ queryKey: ['me'] }),
  }));

  protected setTheme(v: string | undefined): void {
    if (v === 'dark' || v === 'light' || v === 'system') this.theme.theme.set(v);
  }

  protected setPolicy(v: string | undefined): void {
    if (POLICIES.includes(v as JoinPolicy)) this.update.mutate(v as JoinPolicy);
  }

  protected async regenerate(): Promise<void> {
    await meApi.regenerateFriendCode();
    await this.qc.invalidateQueries({ queryKey: ['me'] });
  }

  protected async copy(): Promise<void> {
    const code = this.me.data()?.friendCode;
    if (!code) return;
    await navigator.clipboard.writeText(code.toUpperCase());
    this.toasts.show('Copied', 'success');
  }

  protected confirmDelete(): void {
    this.dialogs
      .open(ConfirmDialogComponent, {
        data: {
          title: this.transloco.translate('settings.deleteConfirmTitle'),
          message: this.transloco.translate('settings.deleteConfirmHint'),
          confirmLabel: this.transloco.translate('settings.delete'),
          danger: true,
        },
      })
      .closed.subscribe((ok) => {
        if (ok) void this.deleteAccount();
      });
  }

  private async deleteAccount(): Promise<void> {
    try {
      await meApi.deleteAccount({ confirmation: 'DELETE', removePublishedGames: false });
      await this.auth.logout();
      await this.router.navigateByUrl('/hub');
    } catch (e) {
      this.toasts.show(e instanceof Error ? e.message : 'Could not delete the account', 'error');
    }
  }

  protected async save(e: Event): Promise<void> {
    const value = (e.target as HTMLInputElement).value.trim();
    if (!value || value === this.nickname()) return;
    this.saving.set(true);
    const previous = this.nickname();
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
