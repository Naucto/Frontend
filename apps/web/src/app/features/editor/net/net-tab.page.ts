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
import { type SharedTableSession } from '@naucto/engine';
import {
  ButtonDirective,
  EmptyStateComponent,
  formatBytes,
  HelpDotComponent,
  IconComponent,
  PanelColumnComponent,
  SearchComponent,
  SectionComponent,
  SliderComponent,
  ToastService,
  ToggleButtonComponent,
  TooltipDirective,
} from '@naucto/ui';

import { AuthStore } from '../../../core/auth/auth.store';
import type { NetUiBridgeService } from '../../../core/net/net-bridge.service';
import { PERM_CLIENT_READ, PERM_CLIENT_WRITE } from '../../../core/net/net-permissions';
import { GameScreenComponent } from '../../../shared/game-screen/game-screen.component';
import { RuntimeHostService } from '../../../shared/game-screen/runtime-host.service';
import { UserAvatarComponent } from '../../../shared/user-avatar.component';
import { yVersion } from '../../../shared/yjs/y-signal';
import { EditorRuntimeService } from '../state/editor-runtime.service';
import { PANEL_WIDTH } from '../state/editor-ui.store';
import { PresenceSurfaceComponent } from '../work-session/presence-surface.component';
import { SessionPresenceService } from '../work-session/session-presence.service';
import { WorkSessionService } from '../work-session/work-session.service';
import { buildRows, type Row } from './net-tree';

/** Every connection counted together, sent and received. */
function relayedBytes(usage: readonly { bytesSent: number; bytesReceived: number }[]): number {
  return usage.reduce((sum, entry) => sum + entry.bytesSent + entry.bytesReceived, 0);
}

/** One key of a path. */
const SEGMENT = /^[a-z0-9_]+$/i;
/** A whole dotted path, which a declaration may give in one go. */
const PATH = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/i;

/** NET tab: the live net.state tree with per-path permissions, and the session panel. */
@Component({
  selector: 'nc-net-tab-page',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    EmptyStateComponent,
    HelpDotComponent,
    IconComponent,
    PanelColumnComponent,
    SectionComponent,
    SearchComponent,
    SliderComponent,
    ToggleButtonComponent,
    TooltipDirective,
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
  protected readonly latency = signal(0);
  protected readonly loss = signal(0);
  private readonly tick = signal(0);
  /**
   * Where the counting started, so the rate is an average over the whole observation and not the
   * jitter between two heartbeats. Dropped with the session, so the next one counts from itself.
   */
  private readonly observed = signal<{ at: number; bytes: number } | null>(null);
  private readonly permsVersion = yVersion(this.work.game.netPermissions);
  protected readonly me = computed(() => this.auth.userId());
  private readonly bridge = computed<NetUiBridgeService | null>(() => this.runtime.bridge());
  protected readonly session = computed<SharedTableSession | null>(
    () => this.bridge()?.session() ?? null,
  );
  protected readonly info = computed(() => this.bridge()?.info() ?? null);
  private readonly rigScreen = viewChild(GameScreenComponent);
  /** The session the spawned client should join: ours, with the code if it needs one. */
  protected readonly rigTarget = computed(() => {
    const i = this.info();
    return i ? { uuid: i.uuid, code: i.joinCode } : null;
  });
  protected readonly rigJoined = computed(() => this.rigScreen()?.netBridge.session() !== null);
  /** The id the rig plays under: its own, not the account's, so the two windows can be told apart. */
  private readonly rigId = computed(
    () => this.rigScreen()?.netBridge.session()?.selfUserId ?? null,
  );
  /**
   * Only the host may reshape the *live* tree. A client's write goes through the host anyway, but a
   * rename is a delete plus a write, and half of that arriving is worse than neither.
   */
  protected readonly canEdit = computed(() => this.session()?.isHost ?? false);
  /**
   * The declared tree is the game document, which everyone in the work session edits; only a path a
   * session has actually reached carries the host's restriction with it.
   */
  protected canShape(row: Row): boolean {
    return !row.live || this.canEdit();
  }
  protected readonly players = computed(() => {
    const session = this.session();
    if (!session) {
      return [] as number[];
    }
    const peers = this.bridge()?.peers() ?? [];
    return [session.selfUserId, ...peers.filter((peer) => peer !== session.selfUserId)];
  });
  protected readonly slots = computed(() => {
    this.tick();
    const max = Math.max(this.info()?.maxPlayers ?? 0, this.players().length, 2);
    const session = this.session();
    const hostId = this.info()?.role === 'host' ? session?.selfUserId : null;
    return Array.from({ length: max }, (_, i) => {
      const userId = this.players()[i] ?? null;
      return {
        slot: i + 1,
        userId,
        name: userId === null ? '' : this.nameOf(userId),
        host: userId !== null && userId === hostId,
        ping:
          userId === null || userId === session?.selfUserId
            ? null
            : (session?.peerPing(userId) ?? null),
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

  protected readonly rows = computed(() => {
    this.tick();
    this.permsVersion();
    const perms = new Map<string, number>();
    this.work.game.netPermissions.forEach((permission, path) => perms.set(path, permission.flags));
    return buildRows({
      session: this.session(),
      perms,
      query: this.filter(),
      collapsed: this.collapsed(),
      entries: (count) => this.entries(count),
    });
  });

  /**
   * Nothing to show: no session and no declared path. Steps aside while a name is being typed,
   * because the field that takes it lives in the table.
   */
  protected readonly bare = computed(
    () => this.session() === null && this.adding() === null && this.rows().length <= 1,
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

  protected permClass(on: boolean): string {
    return on
      ? 'border-jade bg-jade-wash text-jade-ink'
      : 'border-line-strong bg-raised text-ink-4 hover:text-ink';
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

  protected ownerClass(owner: number | null): string {
    if (owner === null) {
      return 'text-ink-4';
    }
    return this.isHostOwner(owner) ? 'text-gold-ink' : 'text-sky-ink';
  }

  private isHostOwner(userId: number): boolean {
    const session = this.session();
    return session !== null && session.isHost && userId === session.selfUserId;
  }

  /** The action buttons say what they do, or why they cannot. */
  protected editHint(translate: (key: string) => string, row: Row, label: string): string {
    return this.canShape(row) ? label : translate('editor.net.hostOnly');
  }

  protected ownerName(userId: number | null): string {
    if (userId === null) {
      return '—';
    }
    if (this.isHostOwner(userId)) {
      return this.transloco.translate('editor.net.host');
    }
    return this.nameOf(userId);
  }

  protected nameOf(userId: number): string {
    if (userId === this.me()) {
      return this.auth.displayName();
    }
    if (userId === this.rigId()) {
      return this.transloco.translate('editor.net.rigClient');
    }
    return (
      this.presence.collaborators().find((collaborator) => collaborator.userId === userId)?.name ??
      this.transloco.translate('editor.net.unknownUser', { id: userId })
    );
  }

  protected slotOf(userId: number): number | null {
    const i = this.players().indexOf(userId);
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

  /**
   * True when nothing is left to fold, and so also of a tree of no containers and of no tree at
   * all — which are reachable states, because the header is drawn while the game is not in a
   * session.
   */
  protected readonly allCollapsed = computed(() => {
    const shut = this.collapsed();
    return this.rows()
      .filter((row) => row.container && row.path)
      .every((row) => shut.has(row.path));
  });

  protected expandAll(): void {
    this.collapsed.set(new Set());
  }

  protected collapseAll(): void {
    this.collapsed.set(
      new Set(
        this.rows()
          .filter((row) => row.container && row.path)
          .map((row) => row.path),
      ),
    );
  }

  /** Permissions live in the game document (net.permissions); the host enforces them live. */
  protected setPerm(row: Row, which: 'read' | 'write', on: boolean): void {
    const bit = which === 'read' ? PERM_CLIENT_READ : PERM_CLIENT_WRITE;
    const current = (row.read ? PERM_CLIENT_READ : 0) | (row.write ? PERM_CLIENT_WRITE : 0);
    const flags = on ? current | bit : current & ~bit;
    this.work.game.transact(() => {
      this.work.game.netPermissions.set(row.path, { flags });
    });
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
    this.draft.set(row.path.split('.').pop() ?? '');
    this.renaming.set(row.path);
  }

  protected commitAdd(row: Row): void {
    const key = this.draft().trim();
    this.cancelEdit();
    if (!PATH.test(key)) {
      return;
    }
    const path = row.path ? `${row.path}.${key}` : key;
    const session = this.session();
    const taken =
      this.work.game.netPermissions.has(path) ||
      (!!session && (session.getValue(path) !== undefined || session.isContainer(path)));
    if (taken) {
      return;
    }
    // Declaring it is what makes it a node with nothing running behind it. Open both ways, which is
    // what an unconfigured path already resolves to: the entry names the path, it does not close it.
    this.work.game.transact(() => {
      this.work.game.netPermissions.set(path, { flags: PERM_CLIENT_READ | PERM_CLIENT_WRITE });
    });
    // A new node has to hold something for the live tree to carry it; the empty string is the one
    // value that is visibly a placeholder rather than a number someone meant.
    if (this.canEdit()) {
      session?.setValue(path, '');
    }
  }

  protected commitRename(row: Row): void {
    const key = this.draft().trim();
    const parent = row.path.slice(0, Math.max(0, row.path.lastIndexOf('.')));
    this.cancelEdit();
    if (!SEGMENT.test(key) || key === row.path.split('.').pop()) {
      return;
    }
    const to = parent ? `${parent}.${key}` : key;
    this.movePermissions(row.path, to);
    const session = this.session();
    if (session && row.live && this.canEdit()) {
      this.movePath(session, row.path, to);
    }
  }

  protected remove(row: Row): void {
    this.dropPermissions(row.path);
    if (row.live && this.canEdit()) {
      this.session()?.deleteSubtree(row.path);
    }
  }

  /** Every permission on a path and under it, as [key, flags]. */
  private permissionsUnder(path: string): [string, number][] {
    const under: [string, number][] = [];
    this.work.game.netPermissions.forEach((value, key) => {
      if (key === path || key.startsWith(`${path}.`)) {
        under.push([key, value.flags]);
      }
    });
    return under;
  }

  /**
   * A rename takes the permissions with the name, in one transaction: everything downstream reloads
   * on this map and must never see one branch under two names.
   */
  private movePermissions(from: string, to: string): void {
    const map = this.work.game.netPermissions;
    const moved = this.permissionsUnder(from).map(
      ([key, flags]) => [key, to + key.slice(from.length), flags] as const,
    );
    if (!moved.length) {
      return;
    }
    this.work.game.transact(() => {
      for (const [key] of moved) {
        map.delete(key);
      }
      for (const [, key, flags] of moved) {
        map.set(key, { flags });
      }
    });
  }

  private dropPermissions(path: string): void {
    const map = this.work.game.netPermissions;
    const gone = this.permissionsUnder(path);
    if (!gone.length) {
      return;
    }
    this.work.game.transact(() => {
      for (const [key] of gone) {
        map.delete(key);
      }
    });
  }

  /** Rename is a move: every leaf under the old path is written under the new one, then dropped. */
  private movePath(session: SharedTableSession, from: string, to: string): void {
    const walk = (path: string): void => {
      const kind = session.objectKindAt(path);
      if (kind) {
        session.declareObject(to + path.slice(from.length), kind);
        return;
      }
      if (session.isContainer(path)) {
        for (const key of session.childKeys(path)) {
          walk(`${path}.${key}`);
        }
        return;
      }
      const value = session.getValue(path);
      if (value !== undefined) {
        session.setValue(to + path.slice(from.length), value);
      }
    };
    walk(from);
    session.deleteSubtree(from);
  }

  protected async copy(code: string): Promise<void> {
    await navigator.clipboard.writeText(code);
    this.toasts.show(this.transloco.translate('editor.net.copied'), 'success');
  }

  protected end(): void {
    this.bridge()?.leave();
    this.runtime.host()?.restart();
  }

  protected spawn(): void {
    this.rig.set(true);
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
