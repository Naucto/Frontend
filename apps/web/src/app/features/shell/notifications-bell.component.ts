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
  template: `
    <ng-container *transloco="let t">
      <button
        ncButton
        variant="ghost"
        size="bar"
        iconOnly
        [ncPopover]="panel"
        popoverAlign="end"
        [(popoverOpen)]="open"
        class="relative"
        [attr.aria-label]="t('notifications.title')"
      >
        <!-- A 24-grid glyph only stays crisp under crispEdges at the exact halves and doubles of
             its grid, so the artboard's 16 is not available; of the two that are, the smaller one
             left the bell too faint to find in the bar. -->
        <!-- Gold with something waiting, and only then. The design draws the bell gold beside its
             badge, and gold on this design means state — the active rail item, the current version,
             YOU. A bell that is gold at rest would say "there is something" on an empty inbox. -->
        <nc-icon
          name="notification"
          [size]="24"
          [class]="store.unread() > 0 ? 'text-gold-ink' : 'text-ink-3'"
        />
        @if (store.unread() > 0) {
          <!-- Over the bell's shoulder, not in the corner of its box: the design hangs the badge
               off the glyph, which only reads once the button is the 38px the bar gives it. -->
          <span
            class="absolute top-[4px] right-[4px] h-[8px] w-[8px] bg-hot"
            aria-hidden="true"
          ></span>
        }
      </button>
      <ng-template #panel>
        <nc-popover-panel class="w-[360px]">
          <div class="flex h-4 items-center gap-1 border-b border-line px-2">
            <span class="label text-ink">{{ t('notifications.title') }}</span>
            @if (store.unread() > 0) {
              <span class="rounded-xs bg-hot px-0.5 font-mono text-[10px] text-on-accent-dark">
                {{ store.unread() }}
              </span>
            }
            <span class="flex-1"></span>
            <button
              ncButton
              variant="ghost"
              size="sm"
              (click)="store.markAllRead()"
              [disabled]="store.unread() === 0"
            >
              {{ t('notifications.markAllRead') }}
            </button>
          </div>
          <ul class="max-h-[360px] overflow-auto">
            @for (n of store.items(); track n.id) {
              <li
                class="flex gap-1 border-b border-line px-2 py-1.5 last:border-b-0"
                [class.bg-raised]="!n.read"
              >
                <span
                  class="mt-0.5 w-[2px] shrink-0 self-stretch"
                  [class.bg-sky]="n.type === 'INFO'"
                  [class.bg-orange]="n.type === 'WARNING'"
                ></span>
                <button type="button" class="flex-1 text-left" (click)="act(n)">
                  <div class="text-ui text-ink">{{ n.title }}</div>
                  <div class="text-meta text-ink-2">{{ n.message }}</div>
                  <div class="label mt-0.5 text-ink-4">{{ n.createdAt | slice: 0 : 10 }}</div>
                </button>
                @if (!n.read) {
                  <span class="mt-1 h-1 w-1 shrink-0 rounded-xs bg-hot" aria-hidden="true"></span>
                }
              </li>
            } @empty {
              <li class="p-3 text-center text-body text-ink-3">{{ t('notifications.empty') }}</li>
            }
          </ul>
        </nc-popover-panel>
      </ng-template>
    </ng-container>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationsBellComponent {
  protected readonly store = inject(NotificationsStore);
  protected readonly open = signal(false);
  private readonly router = inject(Router);

  /**
   * Where a notification leads, or nowhere.
   *
   * The kinds the server actually sends: a friend request and its acceptance both put the answer
   * on the friends page, being added to a project opens that project's editor, and a session
   * invite arrives as GENERIC carrying the project it is a session of.
   */
  private destinationOf(n: NotificationItem): string[] | null {
    const projectId = n.data?.projectId;
    switch (n.kind) {
      case 'FRIEND_REQUEST':
      case 'FRIEND_ACCEPTED':
        return ['/friends'];
      case 'COLLABORATOR_ADDED':
        return typeof projectId === 'number' ? ['/edit', String(projectId)] : null;
      default:
        return typeof projectId === 'number' ? ['/play', String(projectId)] : null;
    }
  }

  /**
   * Marking it read was all a click did, which is the one thing the reader was not asking for:
   * they clicked the sentence that told them something happened, to go to the thing.
   */
  protected act(n: NotificationItem): void {
    void this.store.markRead(n.id);
    const to = this.destinationOf(n);
    if (!to) return;
    this.open.set(false);
    void this.router.navigate(to);
  }
}
