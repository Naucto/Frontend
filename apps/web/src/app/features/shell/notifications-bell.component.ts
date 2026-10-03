import { SlicePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  type NotificationItem,
  NotificationsStore,
} from '@app/core/notifications/notifications.store';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  ButtonDirective,
  IconComponent,
  PopoverDirective,
  PopoverPanelComponent,
} from '@naucto/ui';

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
  private destinationOf(n: NotificationItem): string[] | null {
    const projectId = n.data?.projectId;
    switch (n.kind) {
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

  protected act(n: NotificationItem): void {
    void this.store.markRead(n.id);
    const to = this.destinationOf(n);
    if (!to) return;
    this.open.set(false);
    void this.router.navigate(to);
  }
}
