import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  type FriendDto,
  friendsControllerList,
  friendsControllerRecentPlayers,
  friendsControllerSend,
  type RecentPlayerDto,
} from '@naucto/api-client';
import { type PresenceDto } from '@naucto/api-client';
import {
  ButtonDirective,
  ChipComponent,
  DialogService,
  EmptyStateComponent,
  IconComponent,
  MarkComponent,
  RelativeTimePipe,
  SegmentedComponent,
  ToastService,
} from '@naucto/ui';
import { injectQuery, QueryClient } from '@tanstack/angular-query-experimental';

import { unwrap } from '../../core/api/api-errors';
import { AuthStore } from '../../core/auth/auth.store';
import { PresenceStore } from '../../core/presence/presence.store';
import { presenceLine } from '../../core/presence/presence-line';
import { answerFriendRequest, injectFriendRequests } from '../../shared/queries/friends.queries';
import { qk } from '../../shared/queries/query-keys';
import { UserAvatarComponent } from '../../shared/user-avatar.component';
import { AddFriendDialog } from './add-friend.dialog';

type Friend = FriendDto & { presence: PresenceDto | null };

/**
 * Left rule and game-name colour of a row, by what the person is doing; the two always carry the
 * same accent.
 */
const ACCENT: Record<string, { rule: string; name: string }> = {
  PLAYING: { rule: 'bg-jade', name: 'text-jade-ink' },
  BUILDING: { rule: 'bg-gold', name: 'text-gold-ink' },
  HOSTING: { rule: 'bg-sky', name: 'text-sky-ink' },
};

/** Friends: who is online and what they are doing, requests, and people you played with. */
@Component({
  selector: 'nc-friends-page',
  imports: [
    ChipComponent,
    DatePipe,
    RouterLink,
    TranslocoDirective,
    ButtonDirective,
    EmptyStateComponent,
    IconComponent,
    MarkComponent,
    RelativeTimePipe,
    SegmentedComponent,
    UserAvatarComponent,
  ],
  templateUrl: './friends.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class FriendsPage {
  private readonly auth = inject(AuthStore);
  private readonly qc = inject(QueryClient);
  private readonly toasts = inject(ToastService);
  private readonly dialogs = inject(DialogService);
  private readonly presence = inject(PresenceStore);
  private readonly transloco = inject(TranslocoService);
  protected readonly ACCENT = ACCENT;
  protected readonly tab = signal<'online' | 'all'>('online');
  /** The request being answered, so a second click cannot answer a row that is already leaving. */
  protected readonly answering = signal<number | null>(null);

  private readonly friendsQuery = injectQuery(() => ({
    queryKey: qk.friends(),
    queryFn: async () => unwrap(await friendsControllerList()),
    enabled: this.auth.isAuthenticated(),
  }));
  private readonly requestsQuery = injectFriendRequests(() => this.auth.isAuthenticated());
  private readonly recentQuery = injectQuery(() => ({
    queryKey: qk.recentPlayers(),
    queryFn: async () => unwrap(await friendsControllerRecentPlayers()),
    enabled: this.auth.isAuthenticated(),
  }));

  /** Presence is pushed over the notifications socket, so these rows change without a refetch. */
  protected readonly friends = computed<Friend[]>(() =>
    (this.friendsQuery.data() ?? []).map((friend) => ({
      ...friend,
      presence: this.presence.of(friend.id),
    })),
  );
  protected readonly online = computed(() =>
    this.friends()
      .filter((friend) => friend.presence)
      .sort((a, b) => Number(a.presence?.kind === 'IDLE') - Number(b.presence?.kind === 'IDLE')),
  );
  protected readonly offline = computed(() => this.friends().filter((friend) => !friend.presence));
  protected readonly requests = computed(() => this.requestsQuery.data() ?? []);
  protected readonly recent = computed<RecentPlayerDto[]>(() => this.recentQuery.data() ?? []);
  protected readonly tabs = computed(() => [
    {
      value: 'online' as const,
      label: this.transloco.translate('friends.online', { n: this.online().length }),
    },
    {
      value: 'all' as const,
      label: this.transloco.translate('friends.all', { n: this.friends().length }),
    },
  ]);

  constructor() {
    void this.presence.load();
  }

  protected setTab(value: 'online' | 'all' | undefined): void {
    if (value) {
      this.tab.set(value);
    }
  }

  /** The presence line in three pieces, because the design tints only the game name. */
  protected line(friend: Friend): { verb: string; name: string; nameClass: string; tail: string } {
    const presence = friend.presence;
    const line = presenceLine(presence);
    if (!presence) {
      return { verb: '', name: '', nameClass: '', tail: '' };
    }
    if (!line) {
      return {
        verb: this.transloco.translate('presence.online'),
        name: '',
        nameClass: '',
        tail: '',
      };
    }
    return {
      verb: this.transloco.translate(line.verbKey),
      name: line.name,
      nameClass: ACCENT[presence.kind]?.name ?? 'text-ink-body',
      tail: line.tail ? this.transloco.translate(line.tail.key, line.tail.params) : '',
    };
  }

  /**
   * The one action a row offers, if any. BUILDING has none: you cannot drop into someone's editor
   * from here, and the design draws that row without a button.
   */
  protected playable(
    friend: Friend,
  ): { releaseId: number; variant: 'run' | 'sky'; label: string } | null {
    const presence = friend.presence;
    if (!presence?.releaseId) {
      return null;
    }
    if (presence.kind === 'PLAYING') {
      return { releaseId: presence.releaseId, variant: 'run', label: 'friends.join' };
    }
    if (presence.kind === 'HOSTING') {
      return { releaseId: presence.releaseId, variant: 'sky', label: 'friends.takeSlot' };
    }
    return null;
  }

  protected openAdd(): void {
    this.dialogs
      .open<AddFriendDialog, undefined, boolean>(AddFriendDialog)
      .closed.subscribe((sent) => {
        if (sent) {
          void this.qc.invalidateQueries({ queryKey: qk.friends() });
        }
      });
  }

  protected addUser(userId: number): void {
    void friendsControllerSend({ body: { userId } })
      .then(unwrap)
      .then(() => {
        this.toasts.show(this.transloco.translate('friends.sent'), 'success');
        return this.qc.invalidateQueries({ queryKey: qk.friends() });
      })
      .catch((error: unknown) => {
        this.toasts.show(error instanceof Error ? error.message : 'Request failed', 'error');
      });
  }

  /**
   * Answering a request is the one action on this page whose failure has to be visible: the row
   * disappears on success, so a silent error leaves the sender listed and the reader believing they
   * answered.
   */
  protected async answer(id: number, accept: boolean): Promise<void> {
    this.answering.set(id);
    try {
      await answerFriendRequest(this.qc, id, accept);
    } catch (error: unknown) {
      this.toasts.show(
        error instanceof Error ? error.message : 'Could not answer that request',
        'error',
      );
    } finally {
      this.answering.set(null);
    }
  }
}
