import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { unwrap } from '@app/core/api/api-errors';
import { meApi } from '@app/core/api/planned.api';
import { AuthStore } from '@app/core/auth/auth.store';
import { ThemeService } from '@app/core/theme/theme.service';
import { TranslocoDirective } from '@jsverse/transloco';
import { projectControllerFindAll } from '@naucto/api-client';
import {
  AvatarComponent,
  FriendCodeComponent,
  IconComponent,
  PopoverDirective,
  PopoverPanelComponent,
  ToastService,
} from '@naucto/ui';
import { injectQuery } from '@tanstack/angular-query-experimental';

/** Account popover: identity, friend code, Profile / Settings / Appearance / Sign out. */
@Component({
  selector: 'nc-account-menu',
  imports: [
    RouterLink,
    TranslocoDirective,
    AvatarComponent,
    FriendCodeComponent,
    IconComponent,
    PopoverDirective,
    PopoverPanelComponent,
  ],
  template: `
    <ng-container *transloco="let t">
      <button
        type="button"
        [ncPopover]="menu"
        popoverAlign="end"
        [(popoverOpen)]="open"
        class="flex items-center rounded-xs"
        [attr.aria-label]="t('account.menu')"
      >
        <nc-avatar [name]="auth.displayName()" colour="neutral" [size]="38" />
      </button>
      <ng-template #menu>
        <nc-popover-panel class="w-[280px]">
          <div class="flex items-center gap-1.5 p-2">
            <nc-avatar [name]="auth.displayName()" [size]="32" />
            <div class="min-w-0">
              <div class="truncate text-ui text-ink">{{ auth.displayName() }}</div>
              <div class="label text-ink-4">
                {{ t('account.gamesFriends', { g: games.data() ?? 0, f: '—' }) }}
              </div>
            </div>
          </div>
          <div class="border-t border-line p-2">
            <div class="label mb-1 text-ink-3">{{ t('account.friendCode') }}</div>
            <nc-friend-code
              [code]="me.data()?.friendCode"
              [copyLabel]="t('account.copy')"
              (copied)="copy()"
            />
            <p class="mt-1 text-label leading-[1.5] text-ink-4">{{ t('account.codeHint') }}</p>
          </div>
          <div class="flex flex-col border-t border-line p-1">
            @if (auth.user()?.username; as username) {
              <a
                [routerLink]="['/u', username]"
                class="flex items-center gap-1 rounded-xs px-1 py-0.5 text-body text-ink hover:bg-raised"
                (click)="open.set(false)"
              >
                <nc-icon name="user" [size]="12" class="text-ink-3" />
                {{ t('account.profile') }}
              </a>
            }
            <a
              routerLink="/settings"
              class="flex items-center gap-1 rounded-xs px-1 py-0.5 text-body text-ink hover:bg-raised"
              (click)="open.set(false)"
            >
              <nc-icon name="sliders" [size]="12" class="text-ink-3" />
              {{ t('account.settings') }}
            </a>
            <button
              type="button"
              class="flex items-center gap-1 rounded-xs px-1 py-0.5 text-left text-body text-ink hover:bg-raised"
              (click)="theme.toggle()"
            >
              <nc-icon
                [name]="theme.theme() === 'light' ? 'sun' : 'moon'"
                [size]="12"
                class="text-ink-3"
              />
              {{ t('account.appearance') }}
              <span class="label ml-auto text-ink-4">{{ theme.theme() }}</span>
            </button>
            <button
              type="button"
              class="flex items-center gap-1 rounded-xs px-1 py-0.5 text-left text-body text-ink hover:bg-raised"
              (click)="logout()"
            >
              <nc-icon name="logout" [size]="12" class="text-ink-3" />
              {{ t('account.signOut') }}
            </button>
          </div>
        </nc-popover-panel>
      </ng-template>
    </ng-container>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountMenuComponent {
  protected readonly auth = inject(AuthStore);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  protected readonly open = signal(false);
  protected readonly me = injectQuery(() => ({
    queryKey: ['me'],
    queryFn: () => meApi.get(),
    enabled: this.auth.isAuthenticated() && this.open(),
    retry: false,
  }));
  protected readonly games = injectQuery(() => ({
    queryKey: ['projects', 'count'],
    queryFn: async () =>
      unwrap(await projectControllerFindAll({ query: { page: 1, limit: 1 } })).total,
    enabled: this.auth.isAuthenticated() && this.open(),
  }));

  protected async copy(): Promise<void> {
    const code = this.me.data()?.friendCode;
    if (!code) return;
    await navigator.clipboard.writeText(code.toUpperCase());
    this.toasts.show('Copied', 'success');
  }

  protected async logout(): Promise<void> {
    this.open.set(false);
    await this.auth.logout();
    await this.router.navigateByUrl('/hub');
  }
}
