import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  type FriendDto,
  type FriendRequestDto,
  friendsApi,
  type RecentPlayerDto,
} from '@app/core/api/planned.api';
import { AuthStore } from '@app/core/auth/auth.store';
import { PresenceStore } from '@app/core/presence/presence.store';
import { type PresenceDto } from '@app/core/presence/presence.types';
import { UserAvatarComponent } from '@app/shared/user-avatar.component';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
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
 * Left border and game-name colour of a row, by what the person is doing.
 *
 * One accent said twice, and it has to stay that way: the rule down the edge and the game's name
 * carry the same colour, which is what ties the title to the card without a label saying they
 * belong together.
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
  template: `
    <ng-container *transloco="let t">
      @if (!friends().length && !requests().length && !recent().length) {
        <!-- The height left over, not a fraction of the window: 60vh centred the column on a box
             that has nothing to do with what is actually free below the bar, so it sat high on a
             tall screen and low on a short one. -->
        <div class="flex flex-1 items-center justify-center">
          <nc-empty-state icon="users" [title]="t('friends.emptyTitle')">
            <p hint class="max-w-[420px] text-meta leading-[1.6] text-ink-3">
              {{ t('friends.emptyHint') }}
            </p>
            <button ncButton variant="primary" (click)="openAdd()">
              <nc-icon name="plus" [size]="12" />
              {{ t('friends.addFriend') }}
            </button>
          </nc-empty-state>
        </div>
      } @else {
        <header class="flex flex-wrap items-end gap-2">
          <h1 class="text-display text-ink">{{ t('friends.title') }}</h1>
          <nc-segmented
            class="pb-0.5"
            variant="chips"
            [options]="tabs()"
            [value]="tab()"
            (valueChange)="setTab($event)"
          />
          <span class="flex-1"></span>
          <button ncButton variant="primary" (click)="openAdd()">
            <nc-icon name="plus" [size]="12" />
            {{ t('friends.addFriend') }}
          </button>
        </header>

        <div class="mt-2.5 flex flex-col gap-2.5 xl:flex-row">
          <div class="min-w-0 flex-1">
            <div class="label mb-[11px] text-jade-ink">{{ t('friends.onlineNow') }}</div>
            <div class="grid gap-[9px] md:grid-cols-2">
              @for (f of online(); track f.id) {
                <div
                  class="relative flex items-center gap-1.75 overflow-hidden rounded-md border border-line border-l-2 bg-panel px-2 py-1.75"
                  [class]="ACCENT[f.presence?.kind ?? '']?.rule ?? 'border-l-line'"
                >
                  <!-- The game they are in, bled in from the right and scrimmed back to the panel
                       colour so the name and the action stay readable over it. -->
                  @if (f.presence?.coverUrl; as cover) {
                    <span class="pointer-events-none absolute inset-y-0 right-0 w-[220px]">
                      <img
                        [src]="cover"
                        alt=""
                        aria-hidden="true"
                        class="pixelated block h-full w-full object-cover opacity-55"
                      />
                      <span
                        class="absolute inset-0"
                        style="background:linear-gradient(to right,var(--color-panel) 0%,color-mix(in srgb,var(--color-panel) 55%,transparent) 45%,color-mix(in srgb,var(--color-panel) 10%,transparent) 100%)"
                      ></span>
                    </span>
                  }
                  <nc-user-avatar
                    avatarClass="relative"
                    [name]="f.nickname || f.username"
                    [userId]="f.id"
                    [size]="40"
                  />
                  <div class="relative min-w-0">
                    <a
                      [routerLink]="['/u', f.username]"
                      class="block truncate text-ui text-ink hover:text-gold-ink"
                    >
                      {{ f.nickname || f.username }}
                    </a>
                    <div class="truncate text-meta text-ink-3">
                      {{ line(f).verb }}
                      <span [class]="line(f).nameClass">{{ line(f).name }}</span>
                      {{ line(f).tail }}
                    </div>
                  </div>
                  <span class="flex-1"></span>
                  @if (playable(f); as target) {
                    <a
                      ncButton
                      class="relative"
                      [variant]="target.variant"
                      [routerLink]="['/play', target.releaseId]"
                    >
                      {{ t(target.label) }}
                    </a>
                  }
                </div>
              } @empty {
                <p class="text-meta text-ink-4">{{ t('hub.friendsEmpty') }}</p>
              }
            </div>

            <!-- Also when the ONLINE view is empty: someone with six offline friends was shown
                 "No friends online." and nothing else, which reads as having no friends at all. -->
            @if (offline().length && (tab() === 'all' || !online().length)) {
              <div class="label mt-2.75 mb-[11px]">{{ t('friends.offline') }}</div>
              <div class="grid grid-cols-2 gap-[9px] md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                @for (f of offline(); track f.id) {
                  <a
                    [routerLink]="['/u', f.username]"
                    class="flex items-center gap-1.25 rounded-md border border-line-soft bg-panel px-1.5 py-[11px] opacity-60 transition-opacity hover:opacity-100"
                  >
                    <nc-user-avatar [name]="f.nickname || f.username" [userId]="f.id" [size]="28" />
                    <div class="min-w-0">
                      <div class="truncate text-meta text-ink-body">
                        {{ f.nickname || f.username }}
                      </div>
                      <div class="label">{{ f.lastSeenAt || f.since | ncRelativeTime }}</div>
                    </div>
                  </a>
                }
              </div>
            }
          </div>

          <div class="grid content-start gap-1.75 xl:w-[330px] xl:flex-none">
            @if (recent().length) {
              <section class="rounded-md border border-line bg-panel px-2 pt-1.75 pb-1">
                <div class="label mb-0.75">{{ t('friends.playedRecently') }}</div>
                @for (p of recent(); track p.id) {
                  <div class="flex items-center gap-1.25 py-1">
                    <nc-user-avatar [name]="p.nickname || p.username" [userId]="p.id" [size]="28" />
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-meta text-ink-body">
                        {{ p.nickname || p.username }}
                      </div>
                      <!-- The name in its own case, the age in the label step: set whole in micro
                           uppercase, a title as ordinary as "Moon Lander" ran wider than the panel
                           and took a second line for want of its lower case. -->
                      <div class="truncate text-meta text-ink-3">
                        {{ p.game }}
                        <span class="label">· {{ p.playedAt | ncRelativeTime }}</span>
                      </div>
                    </div>
                    @if (!p.friend) {
                      <button ncButton variant="secondary" size="sm" (click)="addUser(p.id)">
                        {{ t('friends.add') }}
                      </button>
                    }
                  </div>
                }
              </section>
            }
            @if (requests().length) {
              <section class="rounded-md border border-line bg-panel p-2">
                <div class="label mb-[13px] text-gold-ink">
                  {{ t('friends.requests') }} · {{ requests().length }}
                </div>
                @for (r of requests(); track r.id) {
                  <div class="flex items-center gap-[11px] not-last:mb-1.5">
                    <nc-user-avatar
                      [name]="r.from.nickname || r.from.username"
                      [userId]="r.from.id"
                      [size]="30"
                    />
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-meta text-ink">
                        {{ r.from.nickname || r.from.username }}
                      </div>
                      <div class="label">
                        {{
                          r.playedYourGame
                            ? t('friends.playedYourGame')
                            : t('friends.mutuals', { n: r.mutuals ?? 0 })
                        }}
                      </div>
                    </div>
                    <button
                      type="button"
                      class="px-[3px] text-jade-ink hover:brightness-125 disabled:text-ink-4"
                      [attr.aria-label]="t('friends.accept')"
                      [disabled]="answering() !== null"
                      (click)="accept(r.id)"
                    >
                      <nc-icon name="check" [size]="24" />
                    </button>
                    <button
                      type="button"
                      class="px-[3px] text-ink-3 hover:text-ink disabled:text-ink-4"
                      [attr.aria-label]="t('friends.decline')"
                      [disabled]="answering() !== null"
                      (click)="decline(r.id)"
                    >
                      <nc-icon name="close" [size]="24" />
                    </button>
                  </div>
                }
              </section>
            }
          </div>
        </div>
      }
    </ng-container>
  `,
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
    queryFn: () => friendsApi.list(),
    enabled: this.auth.isAuthenticated(),
  }));
  private readonly requestsQuery = injectQuery(() => ({
    queryKey: ['friends', 'requests'],
    queryFn: () => friendsApi.requests(),
    enabled: this.auth.isAuthenticated(),
  }));
  private readonly recentQuery = injectQuery(() => ({
    queryKey: ['friends', 'recent'],
    queryFn: () => friendsApi.recentPlayers(),
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
    { value: 'online' as const, label: `Online ${String(this.online().length)}` },
    { value: 'all' as const, label: `All ${String(this.friends().length)}` },
  ]);

  constructor() {
    void this.presence.load();
  }

  protected setTab(v: 'online' | 'all' | undefined): void {
    if (v) this.tab.set(v);
  }

  /**
   * "playing <game> · 12 min" — three pieces, because the design tints only the game name and
   * the tail differs per state: how long they have been playing, whether a project is open to
   * collaborators, how full a session is.
   */
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
    void friendsApi
      .send({ userId })
      .then(() => {
        this.toasts.show('Request sent', 'success');
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
    await this.answer(id, () => friendsApi.accept(id));
  }

  protected async decline(id: number): Promise<void> {
    await this.answer(id, () => friendsApi.decline(id));
  }
}
