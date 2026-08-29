import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthStore } from '@app/core/auth/auth.store';
import { ThemeService } from '@app/core/theme/theme.service';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  AvatarComponent,
  ButtonDirective,
  PopoverDirective,
  PopoverPanelComponent,
  SegmentedComponent,
} from '@naucto/ui';

@Component({
  selector: 'nc-account-menu',
  imports: [
    RouterLink,
    TranslocoDirective,
    AvatarComponent,
    ButtonDirective,
    PopoverDirective,
    PopoverPanelComponent,
    SegmentedComponent,
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
        <nc-popover-panel [title]="auth.displayName()">
          <div class="flex flex-col gap-1 p-2">
            <a
              routerLink="/u/{{ auth.user()?.username }}"
              class="text-body text-ink hover:text-gold-ink"
              (click)="open.set(false)"
            >
              {{ t('account.profile') }}
            </a>
            <a
              routerLink="/settings"
              class="text-body text-ink hover:text-gold-ink"
              (click)="open.set(false)"
            >
              {{ t('account.settings') }}
            </a>
            <div class="mt-1 flex items-center justify-between border-t border-line pt-2">
              <span class="label">{{ t('account.theme') }}</span>
              <nc-segmented
                [options]="themes"
                [value]="theme.theme()"
                (valueChange)="setTheme($event)"
                [label]="t('account.theme')"
              />
            </div>
            <button ncButton variant="ghost" size="sm" class="mt-1 self-start" (click)="logout()">
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
  protected readonly open = signal(false);
  protected readonly themes = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'system', label: 'Auto' },
  ] as const;

  protected setTheme(v: 'dark' | 'light' | 'system' | undefined): void {
    if (v) this.theme.theme.set(v);
  }

  protected async logout(): Promise<void> {
    this.open.set(false);
    await this.auth.logout();
    await this.router.navigateByUrl('/hub');
  }
}
