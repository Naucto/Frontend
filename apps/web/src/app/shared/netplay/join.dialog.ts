import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { friendsApi } from '@app/core/api/planned.api';
import type { NetUiBridgeService, OpenSession } from '@app/core/net/net-bridge.service';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  ButtonDirective,
  DialogShellComponent,
  FieldComponent,
  IconComponent,
  InputDirective,
  SearchComponent,
  TooltipDirective,
} from '@naucto/ui';
import { injectQuery } from '@tanstack/angular-query-experimental';

export interface JoinDialogData {
  bridge: NetUiBridgeService;
  projectId: number;
}

/**
 * The game called net.join(): pick an open room or type the code you were given.
 *
 * Rooms a friend is hosting sit above the rest and stay there while the list scrolls: a friend
 * hosting is the row you came for, so it never queues behind strangers. A full room says so
 * rather than disappearing — a room that vanishes as it fills reads as a room that closed.
 */
@Component({
  selector: 'nc-join-dialog',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    DialogShellComponent,
    FieldComponent,
    IconComponent,
    InputDirective,
    SearchComponent,
    TooltipDirective,
  ],
  template: `
    <nc-dialog-shell *transloco="let t" [title]="t('net.join.title')">
      <div class="flex items-stretch gap-1">
        <nc-search
          size="sm"
          class="flex-1"
          [placeholder]="t('net.join.filter')"
          [hint]="''"
          [(value)]="filter"
        />
        <button
          ncButton
          variant="ghost"
          size="sm"
          iconOnly
          [attr.aria-label]="t('net.join.refresh')"
          [ncTooltip]="t('net.join.refresh')"
          [disabled]="sessions.isFetching()"
          (click)="sessions.refetch()"
        >
          <nc-icon name="reload" [size]="12" />
        </button>
      </div>

      <div class="mt-1.5 max-h-[190px] overflow-y-auto" role="list">
        @for (group of groups(); track group.key) {
          @if (group.rows.length) {
            <p class="label px-0.5 pt-1.5 pb-1 text-ink-4">{{ t(group.key) }}</p>
            @for (s of group.rows; track s.uuid) {
              <div
                role="listitem"
                class="flex items-center gap-2 rounded-sm border border-line bg-raised px-1.5 py-1"
              >
                <div class="min-w-0 flex-1">
                  <div class="truncate text-ui text-ink">{{ s.title }}</div>
                  <div class="label text-ink-3">
                    {{ t('net.join.hostedBy', { name: s.host }) }} · {{ s.players }} / {{ s.max }}
                  </div>
                </div>
                @if (s.players >= s.max) {
                  <span class="label shrink-0 text-ink-4">{{ t('net.join.full') }}</span>
                } @else {
                  <button ncButton variant="run" size="sm" (click)="join(s)" [disabled]="busy()">
                    {{ t('net.join.join') }}
                  </button>
                }
              </div>
            }
          }
        }
        @if (pending()) {
          <p class="text-body text-ink-3">{{ t('net.join.loading') }}</p>
        } @else if (matching().length === 0) {
          <p class="text-body text-ink-3">
            {{ filter() ? t('net.join.noMatch') : t('net.join.none') }}
          </p>
        }
      </div>

      <nc-field [label]="t('net.join.code')" for="join-code" class="mt-2">
        <div class="flex gap-1">
          <input
            ncInput
            id="join-code"
            class="font-mono uppercase"
            maxlength="12"
            [value]="code()"
            (input)="code.set($any($event.target).value)"
            (keydown.enter)="joinCode()"
          />
          <button
            ncButton
            variant="secondary"
            (click)="joinCode()"
            [disabled]="busy() || code().trim().length < 4"
          >
            {{ t('net.join.join') }}
          </button>
        </div>
      </nc-field>
      @if (error(); as e) {
        <p class="mt-1 text-meta text-hot-ink">{{ e }}</p>
      }
      <ng-container footer>
        <button ncButton variant="ghost" (click)="ref.close(false)">{{ t('net.cancel') }}</button>
      </ng-container>
    </nc-dialog-shell>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JoinDialogComponent {
  protected readonly data = inject<JoinDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly code = signal('');
  protected readonly filter = signal('');

  protected readonly sessions = injectQuery(() => ({
    queryKey: ['sessions', this.data.projectId],
    queryFn: () => this.data.bridge.listSessions(this.data.projectId),
    refetchInterval: 5_000,
  }));

  /** Whose rooms go in the first group. A 404 here means no friends list yet, not no friends. */
  private readonly friends = injectQuery(() => ({
    queryKey: ['friends'],
    queryFn: () => friendsApi.list(),
    retry: false,
  }));

  protected readonly pending = computed(() => this.sessions.isPending());

  /** The filter matches the room, its host, or both — people remember a session by either. */
  protected readonly matching = computed(() => {
    const needle = this.filter().trim().toLowerCase();
    const rows = this.sessions.data() ?? [];
    if (!needle) return rows;
    return rows.filter(
      (s) => s.title.toLowerCase().includes(needle) || s.host.toLowerCase().includes(needle),
    );
  });

  protected readonly groups = computed(() => {
    const friendIds = new Set((this.friends.data() ?? []).map((f) => f.id));
    const rows = this.matching();
    return [
      { key: 'net.join.friends', rows: rows.filter((s) => friendIds.has(s.hostId)) },
      { key: 'net.join.public', rows: rows.filter((s) => !friendIds.has(s.hostId)) },
    ];
  });

  protected async join(s: OpenSession): Promise<void> {
    await this.run(() => this.data.bridge.joinSession(s.uuid));
  }

  protected async joinCode(): Promise<void> {
    await this.run(() => this.data.bridge.joinByCode(this.code().trim().toUpperCase()));
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
      this.ref.close(true);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Could not join');
    } finally {
      this.busy.set(false);
    }
  }
}
