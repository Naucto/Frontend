import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { friendsControllerList, projectControllerFindAll } from '@naucto/api-client';
import {
  AvatarComponent,
  IconComponent,
  PopoverDirective,
  PopoverPanelComponent,
} from '@naucto/ui';
import { injectQuery } from '@tanstack/angular-query-experimental';

import { unwrap } from '../../core/api/api-errors';
import { AuthStore } from '../../core/auth/auth.store';
import { ThemeService } from '../../core/theme/theme.service';
import { qk } from '../../shared/queries/query-keys';

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
  templateUrl: './account-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountMenuComponent {
  protected readonly auth = inject(AuthStore);
  protected readonly avatar = computed(() => this.auth.user()?.profileImageUrl ?? null);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  protected readonly open = signal(false);
  protected readonly games = injectQuery(() => ({
    queryKey: qk.projectCount(),
    queryFn: async () =>
      unwrap(await projectControllerFindAll({ query: { page: 1, limit: 1 } })).total,
    enabled: this.auth.isAuthenticated() && this.open(),
  }));

  /**
   * The counts fall back to zero, not a dash: a refused friends request and an empty one arrive the
   * same way.
   */
  protected readonly friends = injectQuery(() => ({
    queryKey: qk.friendCount(),
    queryFn: async () => unwrap(await friendsControllerList()).length,
    enabled: this.auth.isAuthenticated() && this.open(),
    retry: false,
  }));

  protected async logout(): Promise<void> {
    this.open.set(false);
    await this.auth.logout();
    await this.router.navigateByUrl('/hub');
  }
}
