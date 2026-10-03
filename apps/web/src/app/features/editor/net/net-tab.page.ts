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
import { AuthStore } from '@app/core/auth/auth.store';
import type { NetUiBridgeService } from '@app/core/net/net-bridge.service';
import { PERM_CLIENT_READ, PERM_CLIENT_WRITE, resolveFlags } from '@app/core/net/net-permissions';
import { GameScreenComponent } from '@app/shared/game-screen/game-screen.component';
import { RuntimeHostService } from '@app/shared/game-screen/runtime-host.service';
import { UserAvatarComponent } from '@app/shared/user-avatar.component';
import { yVersion } from '@app/shared/yjs/y-signal';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type SharedTableSession, type TableScalar } from '@naucto/engine';
import {
  ButtonDirective,
  EmptyStateComponent,
  formatBytes,
  formatCount,
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

import { EditorRuntimeService } from '../state/editor-runtime.service';
import { PANEL_WIDTH } from '../state/editor-ui.store';
import { PresenceSurfaceComponent } from '../work-session/presence-surface.component';
import { WorkSessionService } from '../work-session/work-session.service';

interface Row {
  path: string;
  depth: number;
  name: string;
  container: boolean;
  value: string;
  kind: 'number' | 'string' | 'boolean' | 'table' | 'object';
  owner: number | null;
  read: boolean;
  write: boolean;
  /** Whether a running session has this path, as against the document merely declaring it. */
  live: boolean;
}

/** One key of a path. */
const SEGMENT = /^[a-z0-9_]+$/i;
/** A whole dotted path, which a declaration may give in one go. */
const PATH = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/i;

/**
 * The design's value column is a Lua literal, not a `toString()`: strings keep their quotes so an
 * empty one is visible, and long numbers are grouped so a score is readable at a glance.
 */
function formatScalar(value: TableScalar | undefined): string {
  if (value === undefined || value === null) return 'nil';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'number')
    return Number.isInteger(value) ? formatCount(value) : String(value);
  return String(value);
}

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
export class NetTabPage {
  protected readonly PANEL_WIDTH = PANEL_WIDTH;
  protected readonly work = inject(WorkSessionService);
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
  private observed: { at: number; bytes: number } | null = null;
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
  protected canShape(r: Row): boolean {
    return !r.live || this.canEdit();
  }
  protected readonly players = computed(() => {
    const s = this.session();
    if (!s) return [] as number[];
    const peers = this.bridge()?.peers() ?? [];
    return [s.selfUserId, ...peers.filter((p) => p !== s.selfUserId)];
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
      this.observed = null;
      return null;
    }

    const bytes = usage.reduce((sum, u) => sum + u.bytesSent + u.bytesReceived, 0);
    const relayed = usage.some((u) => u.relayed);
    const now = Date.now();
    this.observed ??= { at: now, bytes };

    const seconds = (now - this.observed.at) / 1000;
    const since = bytes - this.observed.bytes;
    // Under a few seconds the rate is noise, and a number that swings by a factor of ten while you
    // read it is worse than no number.
    const rate = seconds >= 5 && since > 0 ? `${formatBytes((since / seconds) * 3600)}/h` : null;
    return { relayed, total: formatBytes(bytes), rate };
  });

  protected readonly rows = computed<Row[]>(() => {
    this.tick();
    this.permsVersion();
    const s = this.session();
    const perms = new Map<string, number>();
    this.work.game.netPermissions.forEach((v, k) => perms.set(k, v.flags));

    // What the document declares, with every ancestor a path implies: a path that carries a
    // permission is a node even when no session has put a value there.
    const declared = new Map<string, Set<string>>();
    for (const path of perms.keys()) {
      if (!path) continue;
      const parts = path.split('.');
      for (let i = 0; i < parts.length; i++) {
        const parent = parts.slice(0, i).join('.');
        let kids = declared.get(parent);
        if (!kids) declared.set(parent, (kids = new Set<string>()));
        kids.add(parts[i] ?? '');
      }
    }

    const q = this.filter().trim().toLowerCase();
    const out: Row[] = [];
    const visit = (path: string, depth: number): void => {
      const root = path === '';
      const liveContainer = s !== null && (root || s.isContainer(path));
      const value = liveContainer || s === null ? undefined : s.getValue(path);
      const live = s !== null && (root || liveContainer || value !== undefined);
      const keys = [
        ...new Set([
          ...(liveContainer && s ? s.childKeys(path) : []),
          ...(declared.get(path) ?? []),
        ]),
      ];
      const container = root || liveContainer || keys.length > 0;
      const objectKind = path && s ? s.objectKindAt(path) : undefined;
      const flags = resolveFlags(perms, path);
      const row: Row = {
        path,
        depth,
        name: root ? '<root>' : path,
        container,
        // A dash, not nil, for a declared node no session has reached: it has no value yet.
        value:
          objectKind ??
          (root
            ? 'table'
            : container
              ? this.entries(keys.length)
              : live
                ? formatScalar(value)
                : '—'),
        kind: objectKind ? 'object' : container || !live ? 'table' : (typeof value as Row['kind']),
        owner:
          path && s && live
            ? (s.lockOwner(path) ?? (depth > 0 ? (s.isHost ? s.selfUserId : null) : null))
            : null,
        read: flags === null ? true : (flags & PERM_CLIENT_READ) !== 0,
        write: flags === null ? true : (flags & PERM_CLIENT_WRITE) !== 0,
        live,
      };
      if (!q || path.toLowerCase().includes(q) || root) out.push(row);
      if (container && !this.collapsed().has(path))
        for (const k of keys) visit(path ? `${path}.${k}` : k, depth + 1);
    };
    visit('', 0);
    return out;
  });

  /** The root, for the button that offers to declare the first path — there is no table row yet. */
  protected readonly root: Row = {
    path: '',
    depth: 0,
    name: '<root>',
    container: true,
    value: 'table',
    kind: 'table',
    owner: null,
    read: true,
    write: true,
    live: false,
  };
  /**
   * Nothing to show: no session and no declared path. Steps aside while a name is being typed,
   * because the field that takes it lives in the table.
   */
  protected readonly bare = computed(
    () => this.session() === null && this.adding() === null && this.rows().length <= 1,
  );

  constructor() {
    effect((onCleanup) => {
      const s = this.session();
      if (!s) return;
      const bump = (): void => {
        this.tick.update((v) => v + 1);
      };
      s.onChange('**', bump);
      const timer = setInterval(bump, 500);
      onCleanup(() => {
        clearInterval(timer);
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
    if (owner === null) return 'text-ink-4';
    return this.isHostOwner(owner) ? 'text-gold-ink' : 'text-sky-ink';
  }

  private isHostOwner(userId: number): boolean {
    const s = this.session();
    return s !== null && s.isHost && userId === s.selfUserId;
  }

  /** The action buttons say what they do, or why they cannot. */
  protected editHint(t: (key: string) => string, r: Row, label: string): string {
    return this.canShape(r) ? label : t('editor.net.hostOnly');
  }

  protected ownerName(userId: number | null): string {
    if (userId === null) return '—';
    if (this.isHostOwner(userId)) return this.transloco.translate('editor.net.host');
    return this.nameOf(userId);
  }

  protected nameOf(userId: number): string {
    if (userId === this.me()) return this.auth.displayName();
    if (userId === this.rigId()) return this.transloco.translate('editor.net.rigClient');
    return (
      this.work.collaborators().find((c) => c.userId === userId)?.name ??
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
      if (next.has(path)) next.delete(path);
      else next.add(path);
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
      .filter((r) => r.container && r.path)
      .every((r) => shut.has(r.path));
  });

  protected expandAll(): void {
    this.collapsed.set(new Set());
  }

  protected collapseAll(): void {
    this.collapsed.set(
      new Set(
        this.rows()
          .filter((r) => r.container && r.path)
          .map((r) => r.path),
      ),
    );
  }

  /** Permissions live in the game document (net.permissions); the host enforces them live. */
  protected setPerm(r: Row, which: 'read' | 'write', on: boolean): void {
    const bit = which === 'read' ? PERM_CLIENT_READ : PERM_CLIENT_WRITE;
    const current = (r.read ? PERM_CLIENT_READ : 0) | (r.write ? PERM_CLIENT_WRITE : 0);
    const flags = on ? current | bit : current & ~bit;
    this.work.game.transact(() => {
      this.work.game.netPermissions.set(r.path, { flags });
    });
  }

  /** How many children a container has. Transloco has no plural rule, so the key carries both. */
  private entries(n: number): string {
    return this.transloco.translate(n === 1 ? 'editor.net.entry' : 'editor.net.entries', { n });
  }

  protected onDraft(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  protected cancelEdit(): void {
    this.renaming.set(null);
    this.adding.set(null);
    this.draft.set('');
  }

  protected startAdd(r: Row): void {
    this.collapsed.update((set) => {
      const next = new Set(set);
      next.delete(r.path);
      return next;
    });
    this.renaming.set(null);
    this.draft.set('');
    this.adding.set(r.path);
  }

  protected startRename(r: Row): void {
    this.adding.set(null);
    this.draft.set(r.path.split('.').pop() ?? '');
    this.renaming.set(r.path);
  }

  protected commitAdd(r: Row): void {
    const key = this.draft().trim();
    this.cancelEdit();
    if (!PATH.test(key)) return;
    const path = r.path ? `${r.path}.${key}` : key;
    const session = this.session();
    const taken =
      this.work.game.netPermissions.has(path) ||
      (!!session && (session.getValue(path) !== undefined || session.isContainer(path)));
    if (taken) return;
    // Declaring it is what makes it a node with nothing running behind it. Open both ways, which is
    // what an unconfigured path already resolves to: the entry names the path, it does not close it.
    this.work.game.transact(() => {
      this.work.game.netPermissions.set(path, { flags: PERM_CLIENT_READ | PERM_CLIENT_WRITE });
    });
    // A new node has to hold something for the live tree to carry it; the empty string is the one
    // value that is visibly a placeholder rather than a number someone meant.
    if (this.canEdit()) session?.setValue(path, '');
  }

  protected commitRename(r: Row): void {
    const key = this.draft().trim();
    const parent = r.path.slice(0, Math.max(0, r.path.lastIndexOf('.')));
    this.cancelEdit();
    if (!SEGMENT.test(key) || key === r.path.split('.').pop()) return;
    const to = parent ? `${parent}.${key}` : key;
    this.movePermissions(r.path, to);
    const session = this.session();
    if (session && r.live && this.canEdit()) this.movePath(session, r.path, to);
  }

  protected remove(r: Row): void {
    this.dropPermissions(r.path);
    if (r.live && this.canEdit()) this.session()?.deleteSubtree(r.path);
  }

  /** Every permission on a path and under it, as [key, flags]. */
  private permissionsUnder(path: string): [string, number][] {
    const under: [string, number][] = [];
    this.work.game.netPermissions.forEach((value, key) => {
      if (key === path || key.startsWith(`${path}.`)) under.push([key, value.flags]);
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
    if (!moved.length) return;
    this.work.game.transact(() => {
      for (const [key] of moved) map.delete(key);
      for (const [, key, flags] of moved) map.set(key, { flags });
    });
  }

  private dropPermissions(path: string): void {
    const map = this.work.game.netPermissions;
    const gone = this.permissionsUnder(path);
    if (!gone.length) return;
    this.work.game.transact(() => {
      for (const [key] of gone) map.delete(key);
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
        for (const key of session.childKeys(path)) walk(`${path}.${key}`);
        return;
      }
      const value = session.getValue(path);
      if (value !== undefined) session.setValue(to + path.slice(from.length), value);
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

  protected setLatency(v: number): void {
    this.latency.set(Math.round(v));
  }

  protected readonly relayOnly = computed(() => this.bridge()?.relayOnly() ?? false);

  protected setRelayOnly(on: boolean): void {
    this.bridge()?.relayOnly.set(on);
  }

  protected setLoss(v: number): void {
    this.loss.set(Math.round(v));
  }
}
