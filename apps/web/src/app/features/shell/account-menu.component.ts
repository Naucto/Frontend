import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  ArrowLinkDirective,
  AvatarComponent,
  IconComponent,
  OptionDirective,
  PopoverDirective,
  PopoverPanelComponent,
} from '@naucto/ui';

import { AuthStore } from '../../core/auth/auth.store';
import { FeedbackLauncher } from '../../shared/feedback/feedback-launcher.service';

/**
 * Account popover: who is signed in and the way to their profile, then Settings, feedback and
 * Sign out. The theme is the top bar's toggle and Settings', not this menu's.
 */
@Component({
  selector: 'nc-account-menu',
  imports: [
    RouterLink,
    TranslocoDirective,
    ArrowLinkDirective,
    AvatarComponent,
    IconComponent,
    OptionDirective,
    PopoverDirective,
    PopoverPanelComponent,
  ],
  templateUrl: './account-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountMenuComponent {
  protected readonly auth = inject(AuthStore);
  protected readonly avatar = computed(() => this.auth.user()?.profileImageUrl ?? null);
  private readonly feedback = inject(FeedbackLauncher);
  private readonly router = inject(Router);
  protected readonly open = signal(false);

  protected rate(): void {
    this.open.set(false);
    this.feedback.rate();
  }

  protected reportBug(): void {
    this.open.set(false);
    this.feedback.reportBug();
  }

  protected async logout(): Promise<void> {
    this.open.set(false);
    await this.auth.logout();
    await this.router.navigateByUrl('/hub');
  }
}
