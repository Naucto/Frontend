import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  ButtonDirective,
  DialogShellComponent,
  FieldComponent,
  IconComponent,
  InputDirective,
  SearchComponent,
  ToastService,
  TooltipDirective,
} from '@naucto/ui';
import { injectQuery } from '@tanstack/angular-query-experimental';

import type { NetUiBridgeService, OpenSession } from '../../core/net/net-bridge.service';
import { injectFriends } from '../queries/friends.queries';
import { qk } from '../queries/query-keys';

export interface JoinDialogData {
  bridge: NetUiBridgeService;
  projectId: number;
}

/**
 * The game called net.join(): pick an open room or type the code you were given.
 *
 * Rooms a friend is hosting are listed first. A full room stays listed and says so: one that
 * vanished as it filled would read as closed.
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
  templateUrl: './join.dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JoinDialogComponent {
  protected readonly data = inject<JoinDialogData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  protected readonly busy = signal(false);
  protected readonly code = signal('');
  protected readonly filter = signal('');

  protected readonly sessions = injectQuery(() => ({
    queryKey: qk.sessions(this.data.projectId),
    queryFn: () => this.data.bridge.listSessions(this.data.projectId),
    refetchInterval: 5_000,
  }));

  /** Whose rooms go in the first group. A 404 here means no friends list yet, not no friends. */
  private readonly friends = injectFriends();

  protected readonly pending = computed(() => this.sessions.isPending());

  /** The filter matches the room, its host, or both — people remember a session by either. */
  protected readonly matching = computed(() => {
    const needle = this.filter().trim().toLowerCase();
    const rows = this.sessions.data() ?? [];
    if (!needle) {
      return rows;
    }
    return rows.filter(
      (session) =>
        session.title.toLowerCase().includes(needle) || session.host.toLowerCase().includes(needle),
    );
  });

  protected readonly groups = computed(() => {
    const friendIds = new Set((this.friends.data() ?? []).map((friend) => friend.id));
    const rows = this.matching();
    return [
      { key: 'net.join.friends', rows: rows.filter((session) => friendIds.has(session.hostId)) },
      { key: 'net.join.public', rows: rows.filter((session) => !friendIds.has(session.hostId)) },
    ];
  });

  protected async join(session: OpenSession): Promise<void> {
    await this.run(() => this.data.bridge.joinSession(session.uuid));
  }

  protected async joinCode(): Promise<void> {
    const code = this.code().trim().toUpperCase();
    if (code.length < 4) {
      return;
    }
    await this.run(() => this.data.bridge.joinByCode(code));
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      await fn();
      this.ref.close(true);
    } catch (error: unknown) {
      this.toasts.show(
        error instanceof Error ? error.message : this.transloco.translate('net.join.failed'),
        'error',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
