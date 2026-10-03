import { SlicePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { type NotificationPayloadDto } from '@naucto/api-client';
import {
  ButtonDirective,
  IconComponent,
  PopoverDirective,
  PopoverPanelComponent,
} from '@naucto/ui';

import { NotificationsStore } from '../../core/notifications/notifications.store';

@Component({
  selector: 'nc-notifications-bell',
  imports: [
    SlicePipe,
    TranslocoDirective,
    ButtonDirective,
    IconComponent,
    PopoverDirective,
    PopoverPanelComponent,
  ],
  templateUrl: './notifications-bell.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsBellComponent {
  protected readonly store = inject(NotificationsStore);
  protected readonly open = signal(false);
  private readonly router = inject(Router);

  /**
   * Where a notification leads, or null. A session invite arrives under a generic kind carrying its
   * project, hence the default branch; being removed from a project leads nowhere on purpose.
   */
  private destinationOf(notification: NotificationPayloadDto): string[] | null {
    const projectId = notification.data?.projectId;
    switch (notification.kind) {
      case 'FRIEND_REQUEST':
      case 'FRIEND_ACCEPTED':
        return ['/friends'];
      case 'COLLABORATOR_ADDED':
        return typeof projectId === 'number' ? ['/edit', String(projectId)] : null;
      case 'COLLABORATOR_REMOVED':
        return null;
      default:
        return typeof projectId === 'number' ? ['/play', String(projectId)] : null;
    }
  }

  protected act(notification: NotificationPayloadDto): void {
    void this.store.markRead(notification.id);
    const to = this.destinationOf(notification);
    if (!to) {
      return;
    }
    this.open.set(false);
    void this.router.navigate(to);
  }
}
