import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type NotificationPayloadDto } from '@naucto/api-client';
import {
  ButtonDirective,
  ChipComponent,
  IconComponent,
  OptionDirective,
  type OptionWash,
  PopoverDirective,
  PopoverPanelComponent,
  RelativeTimePipe,
  ToastService,
} from '@naucto/ui';
import { QueryClient } from '@tanstack/angular-query-experimental';

import { AuthStore } from '../../core/auth/auth.store';
import { NotificationsStore } from '../../core/notifications/notifications.store';
import { answerFriendRequest, injectFriendRequests } from '../../shared/queries/friends.queries';
import { UserAvatarComponent } from '../../shared/user-avatar.component';
import { destinationOf, lookOf } from './notification-view';

/** Written out: Tailwind only generates a class it can read in the source. */
const INK: Record<OptionWash, string> = {
  gold: 'text-gold-ink',
  jade: 'text-jade-ink',
  sky: 'text-sky-ink',
  orange: 'text-orange-ink',
};

/**
 * The bell and its panel: what happened, newest first, each row leading where it is about. A
 * friend request still waiting is answered from its row; a session invite opens the game on the
 * session.
 */
@Component({
  selector: 'nc-notifications-bell',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    ChipComponent,
    IconComponent,
    OptionDirective,
    PopoverDirective,
    PopoverPanelComponent,
    RelativeTimePipe,
    UserAvatarComponent,
  ],
  templateUrl: './notifications-bell.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsBellComponent {
  protected readonly store = inject(NotificationsStore);
  protected readonly open = signal(false);
  /** The notification whose request is being answered, so a second press cannot answer it twice. */
  protected readonly answering = signal<string | null>(null);
  protected readonly INK = INK;

  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly queries = inject(QueryClient);
  private readonly toasts = inject(ToastService);
  private readonly i18n = inject(TranslocoService);

  /** A notification outlives its request, so whether one still waits is asked, not assumed. */
  private readonly requests = injectFriendRequests(
    () =>
      this.open() &&
      this.store.items().some((notification) => notification.kind === 'FRIEND_REQUEST'),
  );

  protected readonly rows = computed(() => {
    const waiting = (this.requests.data() ?? []).filter(
      (request) => request.to.id === this.auth.userId(),
    );
    return this.store.items().map((notification) => ({
      notification,
      ...lookOf(notification),
      invite: destinationOf(notification)?.query !== undefined,
      request:
        notification.kind === 'FRIEND_REQUEST'
          ? (waiting.find((request) => request.id === notification.data?.requestId) ?? null)
          : null,
    }));
  });

  protected act(notification: NotificationPayloadDto): void {
    void this.store.markRead(notification.id);
    const to = destinationOf(notification);
    if (!to) {
      return;
    }
    this.open.set(false);
    void this.router.navigate(to.path, { queryParams: to.query });
  }

  protected async answer(
    notificationId: string,
    requestId: number,
    accept: boolean,
  ): Promise<void> {
    this.answering.set(notificationId);
    try {
      await answerFriendRequest(this.queries, requestId, accept);
      await this.store.markRead(notificationId);
    } catch (error: unknown) {
      this.toasts.show(
        error instanceof Error ? error.message : this.i18n.translate('notifications.answerFailed'),
        'error',
      );
    } finally {
      this.answering.set(null);
    }
  }
}
