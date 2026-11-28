import { NgTemplateOutlet } from '@angular/common';
import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { multiplayerControllerInvite } from '@naucto/api-client';
import { type NetChange, type PlayerNumber, type SharedTableSession } from '@naucto/engine';
import { NET_PATH, NET_SEGMENT, readNetRules } from '@naucto/engine';
import {
  ButtonDirective,
  ChangeChipComponent,
  CheckboxComponent,
  ChipComponent,
  DisclosureComponent,
  formatBytes,
  HelpDotComponent,
  IconComponent,
  LooksOnlyDirective,
  MarkComponent,
  PanelColumnComponent,
  SearchComponent,
  SectionComponent,
  ShareCodeComponent,
  SliderComponent,
  StatComponent,
  ToastService,
  ToggleComponent,
} from '@naucto/ui';

import { unwrap } from '../../../core/api/api-errors';
import { AuthStore } from '../../../core/auth/auth.store';
import type { NetUiBridgeService, SessionInvite } from '../../../core/net/net-bridge.service';
import { GameScreenComponent } from '../../../shared/game-screen/game-screen.component';
import { RuntimeHostService } from '../../../shared/game-screen/runtime-host.service';
import { UserAvatarComponent } from '../../../shared/user-avatar.component';
import { yVersion } from '../../../shared/yjs/y-signal';
import { DiffStore } from '../diff/diff.store';
import { DiffChangesComponent } from '../diff/diff-changes.component';
import { HunkActionsComponent } from '../diff/hunk-actions.component';
import { EditorModeService } from '../state/editor-mode.service';
import { EditorRuntimeService } from '../state/editor-runtime.service';
import { PANEL_WIDTH } from '../state/editor-ui.store';
import { PresenceSurfaceComponent } from '../work-session/presence-surface.component';
import {
  type Collaborator,
  SessionPresenceService,
} from '../work-session/session-presence.service';
import { WorkSessionService } from '../work-session/work-session.service';
import { buildRows, type Row } from './net-tree';

/** Every connection counted together, sent and received. */
function relayedBytes(usage: readonly { bytesSent: number; bytesReceived: number }[]): number {
  return usage.reduce((sum, entry) => sum + entry.bytesSent + entry.bytesReceived, 0);
}

/** Someone the session panel lists: a player at the table, or a collaborator who is not. */
interface RosterEntry {
  key: string;
  name: string;
  account: string | null;
  self: boolean;
  /** Their seat, or null while they are not in the game. */
  slot: number | null;
  host: boolean;
  ping: number | null;
}

/**
 * NET tab: the net.state rules, declared before anything runs and read beside what a session holds
 * once one does, and the session panel.
 */
@Component({
  selector: 'nc-net-tab-page',
  imports: [
    ChangeChipComponent,
    DiffChangesComponent,
    HunkActionsComponent,
    NgTemplateOutlet,
    StatComponent,
    TranslocoDirective,
    ButtonDirective,
    CheckboxComponent,
    ChipComponent,
    DisclosureComponent,
    HelpDotComponent,
    IconComponent,
    LooksOnlyDirective,
    MarkComponent,
    PanelColumnComponent,
    SectionComponent,
    SearchComponent,
    ShareCodeComponent,
    SliderComponent,
    ToggleComponent,
    GameScreenComponent,
    PresenceSurfaceComponent,
    UserAvatarComponent,
  ],
  templateUrl: './net-tab.page.html',
  // The rig is a second client, not a second view of ours. Without a runtime of its own its screen
  // would resolve the shell's through nc-game-screen's SkipSelf reuse and remount the editor's
  // engine — destroying the very session the rig was spawned to join.
  providers: [RuntimeHostService],
  host: { class: 'block h-full' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class NetTabPage {
  protected readonly PANEL_WIDTH = PANEL_WIDTH;
  protected readonly work = inject(WorkSessionService);
  protected readonly diff = inject(DiffStore);
  protected readonly mode = inject(EditorModeService);
  protected readonly presence = inject(SessionPresenceService);
  private readonly runtime = inject(EditorRuntimeService);
  private readonly auth = inject(AuthStore);
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  protected readonly filter = signal('');
  protected readonly collapsed = signal(new Set<string>());
  /** The path whose name is being edited, and the path a child is being added under. */
  protected readonly renaming = signal<string | null>(null);
  protected readonly adding = signal<string | null>(null);
  protected readonly draft = signal('');
  private readonly editInput = viewChild<ElementRef<HTMLInputElement>>('editInput');
  protected readonly rig = signal(false);
  protected readonly debugOpen = signal(false);
  protected readonly latency = signal(0);
  protected readonly loss = signal(0);
  private readonly tick = signal(0);
  /**
   * Where the counting started, so the rate is an average over the whole observation and not the
   * jitter between two heartbeats. Dropped with the session, so the next one counts from itself.
   */
  private readonly observed = signal<{ at: number; bytes: number } | null>(null);
  private readonly permsVersion = yVersion(this.work.game.netPermissions);
  private readonly bridge = computed<NetUiBridgeService | null>(() => this.runtime.bridge());
  protected readonly session = computed<SharedTableSession | null>(
    () => this.bridge()?.session() ?? null,
  );
  protected readonly info = computed(() => this.bridge()?.info() ?? null);
  private readonly rigScreen = viewChild(GameScreenComponent);
  protected readonly rigJoined = computed(() => this.rigScreen()?.netBridge.session() !== null);
  /** The number the rig plays under: its own, not the account's, so the two windows can be told apart. */
  private readonly rigId = computed(
    () => this.rigScreen()?.netBridge.session()?.selfPlayer ?? null,
  );
  protected readonly players = computed(() => {
    const session = this.session();
    if (!session) {
      return [] as PlayerNumber[];
    }
    const peers = this.bridge()?.peers() ?? [];
    return [session.selfPlayer, ...peers.filter((peer) => peer !== session.selfPlayer)];
  });
  /**
   * The session the spawned client is opened on: ours, with the code if it needs one, described as
   * an invited player's game would read it.
   */
  protected readonly rigTarget = computed<SessionInvite | null>(() => {
    const info = this.info();
    return info
      ? {
          uuid: info.uuid,
          code: info.joinCode,
          session: {
            title: info.title,
            host: this.auth.displayName(),
            players: this.players().length,
            maxPlayers: info.maxPlayers,
          },
        }
      : null;
  });
  protected readonly slots = computed(() => {
    this.tick();
    const max = Math.max(this.info()?.maxPlayers ?? 0, this.players().length, 2);
    const session = this.session();
    const host = this.info()?.role === 'host' ? session?.selfPlayer : null;
    return Array.from({ length: max }, (_, i) => {
      const player = this.players()[i] ?? null;
      return {
        slot: i + 1,
        player,
        account: player === null ? null : this.accountOf(player),
        name: player === null ? '' : this.nameOf(player),
        host: player !== null && player === host,
        ping:
          player === null || player === session?.selfPlayer
            ? null
            : (session?.peerPing(player) ?? null),
      };
    });
  });
  /**
   * Every connection counted together, because what a relay bills is the total: a host with three
   * players relays three connections and pays for all of them.
   */
  protected readonly traffic = computed(() => {
    this.tick();
    const usage = this.bridge()?.relayUsage() ?? [];
    if (usage.length === 0) {
      return null;
    }
    const bytes = relayedBytes(usage);
    const observed = this.observed();
    const seconds = observed ? (Date.now() - observed.at) / 1000 : 0;
    const since = observed ? bytes - observed.bytes : 0;
    // Under a few seconds the rate is noise, and a number that swings by a factor of ten while you
    // read it is worse than no number.
    const rate = seconds >= 5 && since > 0 ? `${formatBytes((since / seconds) * 3600)}/h` : null;
    return { relayed: usage.some((entry) => entry.relayed), total: formatBytes(bytes), rate };
  });

  private readonly rules = computed(() => {
    this.permsVersion();
    this.diff.decisions();
    return readNetRules(this.diff.shown().netPermissions);
  });

  /** The change on each path while diff mode is on. */
  protected readonly netChanges = computed(
    () =>
      new Map(
        this.diff
          .itemsOf('net')
          .flatMap((change) => (change.type === 'net' ? [[change.path, change] as const] : [])),
      ),
  );
  protected readonly changeList = computed(() => this.diff.itemsOf('net'));
  protected readonly wash: Record<string, string> = {
    NEW: 'bg-jade-wash',
    EDIT: 'bg-wash-orange',
    DELETED: 'bg-hot-wash line-through',
  };

  /** What a changed path's rule was, read as R and W, for the struck old value beside the new. */
  protected wasRule(change: NetChange): string {
    const flags = change.before?.flags;
    if (flags === undefined) {
      return this.transloco.translate('editor.net.openByDefault');
    }
    return `${flags & 1 ? 'R' : '-'}${flags & 2 ? 'W' : '-'}`;
  }

  protected readonly rows = computed(() => {
    this.tick();
    return buildRows({
      session: this.session(),
      rules: this.rules(),
      query: this.filter(),
      collapsed: this.collapsed(),
      entries: (count) => this.entries(count),
    });
  });

  /**
   * Seated players first, then the collaborators who are not in the game: one line a person, the
   * first group under PLAYERS and the second under WHO CAN JOIN.
   */
  protected readonly roster = computed<RosterEntry[]>(() => {
    const seated = this.slots().flatMap((slot) =>
      slot.player === null
        ? []
        : [
            {
              key: `p${String(slot.slot)}`,
              name: slot.name,
              account: slot.account,
              self: slot.player === this.session()?.selfPlayer,
              slot: slot.slot,
              host: slot.host,
              ping: slot.ping,
            },
          ],
    );
    const away = this.presence
      .collaborators()
      .filter((collaborator) => this.slotOf(collaborator) === null)
      .map((collaborator) => ({
        key: `c${String(collaborator.clientId)}`,
        name: collaborator.name,
        account: collaborator.userId,
        self: collaborator.isSelf,
        slot: null,
        host: false,
        ping: null,
      }));
    return [...seated, ...away];
  });

  protected readonly openSlots = computed(
    () => this.slots().filter((slot) => slot.player === null).length,
  );

  constructor() {
    effect((onCleanup) => {
      const session = this.session();
      if (!session) {
        return;
      }
      const bump = (): void => {
        this.tick.update((count) => count + 1);
      };
      session.onChange('**', bump);
      const timer = setInterval(() => {
        const usage = this.bridge()?.relayUsage() ?? [];
        if (usage.length === 0) {
          this.observed.set(null);
        } else if (!this.observed()) {
          this.observed.set({ at: Date.now(), bytes: relayedBytes(usage) });
        }
        bump();
      }, 500);
      onCleanup(() => {
        clearInterval(timer);
        this.observed.set(null);
      });
    });
    // The input only exists while a row is being edited; focus it the render it appears in.
    effect(() => {
      this.editInput()?.nativeElement.focus();
    });
    effect(() => {
      const rig = this.rigScreen();
      const latency = this.latency();
      const loss = this.loss();
      untracked(() => rig?.netBridge.setImpairment(latency, loss / 100));
    });
  }

  protected valueClass(kind: Row['kind']): string {
    return kind === 'number'
      ? 'text-orange-ink'
      : kind === 'string'
        ? 'text-jade-ink'
        : kind === 'boolean'
          ? 'text-sky-ink'
          : 'text-ink-4';
  }

  protected ownerClass(owner: PlayerNumber | null): string {
    if (owner === null) {
      return 'text-ink-4';
    }
    return this.isHostOwner(owner) ? 'text-gold-ink' : 'text-sky-ink';
  }

  private isHostOwner(player: PlayerNumber): boolean {
    const session = this.session();
    return session !== null && session.isHost && player === session.selfPlayer;
  }

  protected ownerName(player: PlayerNumber | null): string {
    if (player === null) {
      return '—';
    }
    if (this.isHostOwner(player)) {
      return this.transloco.translate('editor.net.host');
    }
    return this.nameOf(player);
  }

  /**
   * The collaborator who plays under a number. The table names a player by a number that says
   * nothing of the account, so the link is what each collaborator's editor shares of itself in
   * the room; a player who is not in the room stays a number.
   */
  private collaboratorAt(player: PlayerNumber): Collaborator | null {
    return (
      this.presence.collaborators().find((collaborator) => collaborator.player === player) ?? null
    );
  }

  private accountOf(player: PlayerNumber): string | null {
    return player === this.session()?.selfPlayer
      ? this.auth.userId()
      : (this.collaboratorAt(player)?.userId ?? null);
  }

  protected nameOf(player: PlayerNumber): string {
    if (player === this.session()?.selfPlayer) {
      return this.auth.displayName();
    }
    if (player === this.rigId()) {
      return this.transloco.translate('editor.net.rigClient');
    }
    return (
      this.collaboratorAt(player)?.name ??
      this.transloco.translate('editor.net.unknownPlayer', { number: player })
    );
  }

  /** Where a collaborator sits in the game, or null while they are not in it. */
  private slotOf(collaborator: Collaborator): number | null {
    const player = collaborator.isSelf ? this.session()?.selfPlayer : collaborator.player;
    const i = player === undefined ? -1 : this.players().indexOf(player);
    return i < 0 ? null : i + 1;
  }

  protected toggle(path: string): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  /** A click on R or W gives the path a rule of its own, from the flags it showed. */
  protected setRule(row: Row, which: 'read' | 'write', on: boolean): void {
    this.work.game.setNetAccess(row.path, { [which]: on });
  }

  /** How many children a container has. Transloco has no plural rule, so the key carries both. */
  private entries(count: number): string {
    return this.transloco.translate(count === 1 ? 'editor.net.entry' : 'editor.net.entries', {
      n: count,
    });
  }

  protected onDraft(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  protected cancelEdit(): void {
    this.renaming.set(null);
    this.adding.set(null);
    this.draft.set('');
  }

  protected startAdd(path: string): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      next.delete(path);
      return next;
    });
    this.renaming.set(null);
    this.draft.set('');
    this.adding.set(path);
  }

  protected startRename(row: Row): void {
    this.adding.set(null);
    this.draft.set(row.key);
    this.renaming.set(row.path);
  }

  /** A new path is declared without a rule: it takes its parent's until R or W is clicked. */
  protected commitAdd(row: Row): void {
    const key = this.draft().trim();
    this.cancelEdit();
    if (!NET_PATH.test(key)) {
      return;
    }
    this.work.game.declareNetPath(row.path ? `${row.path}.${key}` : key);
  }

  protected commitRename(row: Row): void {
    const key = this.draft().trim();
    const parent = row.path.slice(0, Math.max(0, row.path.lastIndexOf('.')));
    this.cancelEdit();
    if (!NET_SEGMENT.test(key) || key === row.key) {
      return;
    }
    this.work.game.moveNetPermissions(row.path, parent ? `${parent}.${key}` : key);
  }

  protected inherit(row: Row): void {
    this.work.game.inheritNetPermission(row.path);
  }

  protected remove(row: Row): void {
    this.work.game.removeNetPermissions(row.path);
  }

  /** Tells a collaborator the session is open to them, through the notification an invitation sends. */
  protected async invite(entry: RosterEntry): Promise<void> {
    const info = this.info();
    if (!info || !entry.account) {
      return;
    }
    try {
      unwrap(
        await multiplayerControllerInvite({
          path: { sessionId: info.uuid },
          body: { userId: entry.account },
        }),
      );
      this.toasts.show(
        this.transloco.translate('editor.net.invited', { name: entry.name }),
        'success',
      );
    } catch (error) {
      this.toasts.show(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  protected async copy(code: string): Promise<void> {
    await navigator.clipboard.writeText(code);
    this.toasts.show(this.transloco.translate('editor.net.copied'), 'success');
  }

  protected end(): void {
    this.bridge()?.leave();
    this.runtime.host()?.restart();
  }

  protected setLatency(value: number): void {
    this.latency.set(Math.round(value));
  }

  protected readonly relayOnly = computed(() => this.bridge()?.relayOnly() ?? false);

  protected setRelayOnly(on: boolean): void {
    this.bridge()?.relayOnly.set(on);
  }

  protected setLoss(value: number): void {
    this.loss.set(Math.round(value));
  }
}
