import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { unwrap } from '@app/core/api/api-errors';
import { friendsApi } from '@app/core/api/planned.api';
import { AuthStore } from '@app/core/auth/auth.store';
import { ThemeService } from '@app/core/theme/theme.service';
import { TranslocoDirective } from '@jsverse/transloco';
import { projectControllerFindAll } from '@naucto/api-client';
import {
  AvatarComponent,
  IconComponent,
  PopoverDirective,
  PopoverPanelComponent,
} from '@naucto/ui';
import { injectQuery } from '@tanstack/angular-query-experimental';

/** Account popover: identity, then Profile / Settings / Appearance / Sign out. */
@Component({
  selector: 'nc-account-menu',
  imports: [
    RouterLink,
    TranslocoDirective,
    AvatarComponent,
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
        <nc-avatar [name]="auth.displayName()" [src]="avatar()" colour="neutral" [size]="38" />
      </button>
      <ng-template #menu>
        <nc-popover-panel class="w-[280px]">
          <div class="flex items-center gap-1.5 p-2">
            <nc-avatar [name]="auth.displayName()" [src]="avatar()" [size]="32" />
            <div class="min-w-0">
              <div class="truncate text-ui text-ink">{{ auth.displayName() }}</div>
              <div class="label text-ink-4">
                {{ t('account.gamesFriends', { g: games.data() ?? 0, f: friends.data() ?? 0 }) }}
              </div>
            </div>
          </div>
          <!-- No rule under the identity: the padding on either side of it already reads as a
               break, and a second one so close to the panel's own edge made the name look like a
               header bolted to the menu rather than the top of it. The nav below keeps its rule,
               where the panel really does change from telling to offering. -->
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
  protected readonly avatar = computed(() => this.auth.user()?.profileImageUrl ?? null);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  protected readonly open = signal(false);
  protected readonly games = injectQuery(() => ({
    queryKey: ['projects', 'count'],
    queryFn: async () =>
      unwrap(await projectControllerFindAll({ query: { page: 1, limit: 1 } })).total,
    enabled: this.auth.isAuthenticated() && this.open(),
  }));

  /**
   * Both counts fall back to zero rather than to a dash. A dash reads as "we could not ask", which
   * is a story the popover cannot tell — the friends endpoint is one the Backend has not shipped,
   * so an empty answer and a refused one arrive the same way, and zero is the honest one of the two
   * for somebody who has just made an account.
   */
  protected readonly friends = injectQuery(() => ({
    queryKey: ['friends', 'count'],
    queryFn: async () => (await friendsApi.list()).length,
    enabled: this.auth.isAuthenticated() && this.open(),
    retry: false,
  }));

  protected async logout(): Promise<void> {
    this.open.set(false);
    await this.auth.logout();
    await this.router.navigateByUrl('/hub');
  }
}
