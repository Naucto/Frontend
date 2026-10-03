import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { unwrap } from '@app/core/api/api-errors';
import { AuthStore } from '@app/core/auth/auth.store';
import { PresenceStore } from '@app/core/presence/presence.store';
import { type PresenceDto } from '@app/core/presence/presence.types';
import { UserAvatarComponent } from '@app/shared/user-avatar.component';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import {
  type FriendDto,
  type FriendRequestDto,
  friendsControllerAccept,
  friendsControllerDecline,
  friendsControllerList,
  friendsControllerRecentPlayers,
  friendsControllerRequests,
  friendsControllerSend,
  type RecentPlayerDto,
} from '@naucto/api-client';
import {
  ButtonDirective,
  DialogService,
  EmptyStateComponent,
  formatElapsed,
  IconComponent,
  RelativeTimePipe,
  SegmentedComponent,
  ToastService,
} from '@naucto/ui';
import { injectQuery, QueryClient } from '@tanstack/angular-query-experimental';

import { AddFriendDialog } from './add-friend.dialog';

type Friend = FriendDto & { presence: PresenceDto | null };

/**
 * Left border and game-name colour of a row, by what the person is doing; the two always carry the
 * same accent.
 */
const ACCENT: Record<string, { rule: string; name: string }> = {
  PLAYING: { rule: 'border-l-jade', name: 'text-jade-ink' },
  BUILDING: { rule: 'border-l-gold', name: 'text-gold-ink' },
  HOSTING: { rule: 'border-l-sky', name: 'text-sky-ink' },
};

/** Friends: who is online and what they are doing, requests, and people you played with. */
@Component({
  selector: 'nc-friends-page',
  imports: [
    RouterLink,
    TranslocoDirective,
    ButtonDirective,
    EmptyStateComponent,
    IconComponent,
    RelativeTimePipe,
    SegmentedComponent,
    UserAvatarComponent,
  ],
  templateUrl: './friends.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FriendsPage {
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
    queryKey: ['friends'],
    queryFn: async () => unwrap(await friendsControllerList()),
    enabled: this.auth.isAuthenticated(),
  }));
  private readonly requestsQuery = injectQuery(() => ({
    queryKey: ['friends', 'requests'],
    queryFn: async () => unwrap(await friendsControllerRequests()),
    enabled: this.auth.isAuthenticated(),
  }));
  private readonly recentQuery = injectQuery(() => ({
    queryKey: ['friends', 'recent'],
    queryFn: async () => unwrap(await friendsControllerRecentPlayers()),
    enabled: this.auth.isAuthenticated(),
  }));

  /** Presence is pushed over the notifications socket, so these rows change without a refetch. */
  protected readonly friends = computed<Friend[]>(() =>
    (this.friendsQuery.data() ?? []).map((f) => ({ ...f, presence: this.presence.of(f.id) })),
  );
  protected readonly online = computed(() =>
    this.friends().filter((f) => f.presence && f.presence.kind !== 'IDLE'),
  );
  protected readonly offline = computed(() =>
    this.friends().filter((f) => !f.presence || f.presence.kind === 'IDLE'),
  );
  protected readonly requests = computed<FriendRequestDto[]>(() =>
    (this.requestsQuery.data() ?? []).filter((r) => r.to.id === this.auth.userId()),
  );
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

  protected setTab(v: 'online' | 'all' | undefined): void {
    if (v) this.tab.set(v);
  }

  /** The presence line in three pieces, because the design tints only the game name. */
  protected line(f: Friend): { verb: string; name: string; nameClass: string; tail: string } {
    const p = f.presence;
    const blank = { verb: '', name: '', nameClass: '', tail: '' };
    if (!p || p.kind === 'IDLE') return blank;
    const t = this.transloco;
    const nameClass = ACCENT[p.kind]?.name ?? 'text-ink-body';
    const name = p.title ?? '';
    if (p.kind === 'BUILDING')
      return {
        verb: t.translate('friends.building'),
        name,
        nameClass,
        tail: p.joinable ? `· ${t.translate('friends.openToCollab')}` : '',
      };
    if (p.kind === 'HOSTING')
      return {
        verb: t.translate('friends.hosting'),
        name,
        nameClass,
        tail: `· ${t.translate('friends.players', { n: p.players ?? 0, m: p.maxPlayers ?? 0 })}`,
      };
    return {
      verb: t.translate('friends.playing'),
      name,
      nameClass,
      tail: `· ${formatElapsed(p.since)}`,
    };
  }

  /**
   * The one action a row offers, if any. BUILDING has none: you cannot drop into someone's editor
   * from here, and the design draws that row without a button.
   */
  protected playable(
    f: Friend,
  ): { releaseId: number; variant: 'run' | 'sky'; label: string } | null {
    const p = f.presence;
    if (!p?.releaseId) return null;
    if (p.kind === 'PLAYING')
      return { releaseId: p.releaseId, variant: 'run', label: 'friends.join' };
    if (p.kind === 'HOSTING')
      return { releaseId: p.releaseId, variant: 'sky', label: 'friends.takeSlot' };
    return null;
  }

  protected openAdd(): void {
    this.dialogs
      .open<AddFriendDialog, undefined, boolean>(AddFriendDialog)
      .closed.subscribe((sent) => {
        if (sent) void this.qc.invalidateQueries({ queryKey: ['friends'] });
      });
  }

  protected addUser(userId: number): void {
    void friendsControllerSend({ body: { userId } })
      .then(unwrap)
      .then(() => {
        this.toasts.show(this.transloco.translate('friends.sent'), 'success');
        return this.qc.invalidateQueries({ queryKey: ['friends'] });
      })
      .catch((e: unknown) => {
        this.toasts.show(e instanceof Error ? e.message : 'Request failed', 'error');
      });
  }

  /**
   * Answering a request is the one action on this page whose failure has to be visible: the row
   * disappears on success, so a silent error leaves the sender listed and the reader believing they
   * answered.
   */
  private async answer(id: number, call: () => Promise<unknown>): Promise<void> {
    this.answering.set(id);
    try {
      await call();
      await this.qc.invalidateQueries({ queryKey: ['friends'] });
    } catch (e: unknown) {
      this.toasts.show(e instanceof Error ? e.message : 'Could not answer that request', 'error');
    } finally {
      this.answering.set(null);
    }
  }

  protected async accept(id: number): Promise<void> {
    await this.answer(id, async () => {
      unwrap(await friendsControllerAccept({ path: { id } }));
    });
  }

  protected async decline(id: number): Promise<void> {
    await this.answer(id, async () => {
      unwrap(await friendsControllerDecline({ path: { id } }));
    });
  }
}
