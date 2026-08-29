import { SlicePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NotificationsStore } from '@app/core/notifications/notifications.store';
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
        <!-- The artboard draws the bell at 16, which a 24-grid glyph cannot land on: only the
             exact halves and doubles in IconSize stay crisp under shape-rendering: crispEdges.
             12 is the nearest one that does. -->
        <nc-icon name="notification" [size]="12" />
        @if (store.unread() > 0) {
          <!-- Over the bell's shoulder, not in the corner of its box: the design hangs the badge
               off the glyph, which only reads once the button is the 38px the bar gives it. -->
          <span
            class="absolute top-[7px] right-[8px] h-[6px] w-[6px] bg-hot"
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
                <button type="button" class="flex-1 text-left" (click)="store.markRead(n.id)">
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
}
