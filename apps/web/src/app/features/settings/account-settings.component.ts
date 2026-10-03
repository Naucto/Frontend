import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
  type WritableSignal,
} from '@angular/core';
import { Router } from '@angular/router';
import { ApiError, unwrap } from '@app/core/api/api-errors';
import { AuthStore } from '@app/core/auth/auth.store';
import { ThemeService } from '@app/core/theme/theme.service';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  type SessionJoinPolicy,
  userControllerDeleteMe,
  userControllerGetMe,
  userControllerUpdateMe,
  userControllerUpdateMyProfile,
} from '@naucto/api-client';
import {
  ButtonDirective,
  ConfirmDialogComponent,
  DialogService,
  InputDirective,
  SegmentedComponent,
  SettingRowComponent,
  ToastService,
  ToggleComponent,
} from '@naucto/ui';
import { injectMutation, injectQuery, QueryClient } from '@tanstack/angular-query-experimental';

const POLICIES: SessionJoinPolicy[] = ['ANYONE', 'FRIENDS', 'CODE_ONLY'];

/**
 * ACCOUNT tab: identity, reach and destruction, one row per setting, saved as you leave the field.
 */
@Component({
  selector: 'nc-account-settings',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    InputDirective,
    SegmentedComponent,
    SettingRowComponent,
    ToggleComponent,
  ],
  templateUrl: './account-settings.component.html',
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
   * Linked, not a plain signal: the profile arrives after the silent refresh at boot. Falls back to
   * the username, as every other surface does when no nickname is set.
   */
  protected readonly nickname = linkedSignal(
    () => this.auth.user()?.nickname ?? this.auth.user()?.username ?? '',
  );
  protected readonly handle = linkedSignal(() => this.auth.user()?.username ?? '');
  protected readonly saving = signal(false);
  protected readonly themes = computed(() =>
    (['dark', 'light', 'system'] as const).map((value) => ({
      value,
      label: this.transloco.translate(`settings.themes.${value}`),
    })),
  );
  protected readonly me = injectQuery(() => ({
    queryKey: ['me'],
    queryFn: async () => unwrap(await userControllerGetMe()),
    retry: false,
  }));
  protected readonly policies = computed(() =>
    POLICIES.map((value) => ({
      value,
      label: this.transloco.translate(`settings.policies.${value}`),
    })),
  );
  private readonly update = injectMutation(() => ({
    mutationFn: async (policy: SessionJoinPolicy) =>
      unwrap(await userControllerUpdateMe({ body: { sessionJoinPolicy: policy } })),
    onSuccess: () => this.qc.invalidateQueries({ queryKey: ['me'] }),
  }));

  protected setTheme(v: string | undefined): void {
    if (v === 'dark' || v === 'light' || v === 'system') this.theme.theme.set(v);
  }

  protected setPolicy(v: string | undefined): void {
    if (POLICIES.includes(v as SessionJoinPolicy)) this.update.mutate(v as SessionJoinPolicy);
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
      unwrap(
        await userControllerDeleteMe({
          body: { confirmation: 'DELETE', removePublishedGames: false },
        }),
      );
      await this.auth.logout();
      await this.router.navigateByUrl('/hub');
    } catch (e) {
      this.toasts.show(
        e instanceof Error ? e.message : this.transloco.translate('settings.saveFailed'),
        'error',
      );
    }
  }

  /**
   * Rolled back on refusal rather than left as typed: a name on screen that answers to nobody —
   * or belongs to someone else, for the handle — is worse than the one that was there before.
   */
  private async saveField(
    e: Event,
    field: 'nickname' | 'username',
    current: WritableSignal<string>,
  ): Promise<void> {
    const value = (e.target as HTMLInputElement).value.trim();
    if (!value || value === current()) return;
    this.saving.set(true);
    const previous = current();
    try {
      unwrap(
        await userControllerUpdateMyProfile({
          body: field === 'nickname' ? { nickname: value } : { username: value },
        }),
      );
      await this.auth.refreshProfile();
      current.set(value);
      this.toasts.show(this.transloco.translate('settings.saved'), 'success');
    } catch (error) {
      (e.target as HTMLInputElement).value = previous;
      this.toasts.show(
        field === 'username' && error instanceof ApiError && error.status === 409
          ? this.transloco.translate('settings.handleTaken')
          : this.transloco.translate('settings.saveFailed'),
        'error',
      );
    } finally {
      this.saving.set(false);
    }
  }

  protected save(e: Event): Promise<void> {
    return this.saveField(e, 'nickname', this.nickname);
  }

  protected saveHandle(e: Event): Promise<void> {
    return this.saveField(e, 'username', this.handle);
  }
}
