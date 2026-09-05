import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
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
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { type SharedTableSession, type TableScalar } from '@naucto/engine';
import {
  AvatarComponent,
  ButtonDirective,
  EmptyStateComponent,
  formatCount,
  HelpDotComponent,
  IconComponent,
  SearchComponent,
  SliderComponent,
  ToastService,
} from '@naucto/ui';

import { EditorRuntimeService } from '../state/editor-runtime.service';
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
  configured: boolean;
}

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
    AvatarComponent,
    ButtonDirective,
    EmptyStateComponent,
    HelpDotComponent,
    IconComponent,
    SearchComponent,
    SliderComponent,
    GameScreenComponent,
    PresenceSurfaceComponent,
  ],
  template: `
    <div *transloco="let t" class="grid h-full grid-rows-[39px_minmax(0,1fr)]">
      <!-- One strip across both columns, split where the inspector starts, as the artboard draws it. -->
      <div class="grid grid-cols-[minmax(0,1fr)_421px] border-b border-line bg-panel">
        <div class="@container relative flex items-center gap-1.25 pr-1.5 pl-2">
          <span class="font-mono text-[11px] uppercase tracking-strip text-ink">
            {{ t('editor.net.sharedState') }}
          </span>
          @if (session()) {
            <span
              class="flex items-center gap-0.75 font-mono text-[10px] uppercase tracking-[0.08em] text-jade-ink"
            >
              <span class="block h-[6px] w-[6px] bg-current"></span>
              {{ t('editor.net.live') }}
            </span>
          } @else {
            <span class="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-4">
              {{ t('editor.net.idle') }}
            </span>
          }
          <span class="flex-1"></span>
          <!--
            Centred on the tree rather than on what is left over, but only while the column is wide
            enough: with the console open there is no centre that clears the status label, so the
            box falls back into the flow beside it.
          -->
          <nc-search
            class="w-[200px] @min-[760px]:absolute @min-[760px]:left-1/2 @min-[760px]:-translate-x-1/2"
            size="sm"
            [placeholder]="t('editor.net.filter')"
            [hint]="''"
            [value]="filter()"
            (valueChange)="filter.set($event)"
          />
          <button
            type="button"
            class="flex h-[26px] w-[26px] items-center justify-center rounded-sm text-ink-3 hover:text-ink"
            [attr.aria-label]="t('editor.net.expandAll')"
            (click)="expandAll()"
          >
            <nc-icon name="expand" [size]="12" />
          </button>
          <button
            type="button"
            class="flex h-[26px] w-[26px] items-center justify-center rounded-sm text-ink-3 hover:text-ink"
            [attr.aria-label]="t('editor.net.collapseAll')"
            (click)="collapseAll()"
          >
            <nc-icon name="collapse" [size]="12" />
          </button>
        </div>
        <div class="flex items-center border-l border-line px-1.75">
          <span class="font-mono text-[11px] uppercase tracking-strip text-ink">
            {{ t('editor.net.session') }}
          </span>
          <span class="flex-1"></span>
          <!-- Hosting is sky in the design, joined is jade: the two roles are told apart by hue. -->
          <span
            class="font-mono text-[10px] uppercase tracking-[0.08em]"
            [class]="
              info()?.role === 'host' ? 'text-sky-ink' : session() ? 'text-jade-ink' : 'text-ink-4'
            "
          >
            {{
              info()?.role === 'host'
                ? t('editor.net.hosting')
                : info()
                  ? t('editor.net.joined')
                  : t('editor.net.idle')
            }}
          </span>
        </div>
      </div>

      <div class="grid min-h-0 grid-cols-[minmax(0,1fr)_421px]">
        <section class="flex min-h-0 flex-col bg-paper">
          <div class="flex items-center gap-1 border-b border-line-faint px-[18px] py-[10px]">
            <span class="font-mono text-[9px] tracking-[0.14em] text-ink-3">net.state</span>
            <span class="flex-1"></span>
            <nc-help-dot [text]="t('editor.net.helpState')" />
          </div>
          @if (rows().length) {
            <div class="min-h-0 flex-1 overflow-auto">
              <table class="w-full table-fixed border-collapse font-mono text-[12px]">
                <colgroup>
                  <col />
                  <col class="w-[110px]" />
                  <col class="w-[88px]" />
                  <col class="w-[74px]" />
                  <col class="w-[76px]" />
                </colgroup>
                <thead>
                  <tr class="text-[9px] uppercase tracking-strip text-ink-4">
                    <th class="border-b border-line-faint py-[9px] pl-[18px] text-left font-normal">
                      {{ t('editor.net.path') }}
                    </th>
                    <th class="border-b border-line-faint py-[9px] text-left font-normal">
                      {{ t('editor.net.value') }}
                    </th>
                    <th class="border-b border-line-faint py-[9px] text-left font-normal">
                      {{ t('editor.net.owner') }}
                    </th>
                    <th class="border-b border-line-faint py-[9px] text-left font-normal">
                      {{ t('editor.net.perms') }}
                    </th>
                    <th class="border-b border-line-faint py-[9px] pr-[18px] text-left font-normal">
                      <span class="sr-only">{{ t('editor.net.actions') }}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of rows(); track r.path) {
                    <tr class="h-[35px] border-b border-line-faint hover:bg-sunken">
                      <td
                        class="py-[7px]"
                        [class]="r.depth ? 'text-ink-body' : 'text-ink'"
                        [style.paddingLeft.px]="18 + r.depth * 20"
                      >
                        @if (r.container) {
                          <button
                            type="button"
                            class="mr-1 text-ink-4 hover:text-ink"
                            (click)="toggle(r.path)"
                            [attr.aria-label]="r.name"
                          >
                            <nc-icon
                              [name]="collapsed().has(r.path) ? 'chevron-right' : 'chevron-down'"
                              [size]="12"
                            />
                          </button>
                        }
                        @if (renaming() === r.path) {
                          <input
                            #editInput
                            class="w-[180px] rounded-xs border border-gold bg-inset px-1 font-mono text-[12px] text-ink outline-none"
                            [value]="draft()"
                            (input)="onDraft($event)"
                            (keydown.enter)="commitRename(r)"
                            (keydown.escape)="cancelEdit()"
                            (blur)="cancelEdit()"
                          />
                        } @else {
                          {{ r.name }}
                        }
                      </td>
                      <td class="py-[7px]" [class]="valueClass(r.kind)">{{ r.value }}</td>
                      <td class="py-[7px]" [class]="ownerClass(r.owner)">
                        {{ ownerName(r.owner) }}
                      </td>
                      <td class="py-[7px]">
                        <span class="flex items-center gap-0.5">
                          <button
                            type="button"
                            class="inline-flex h-[20px] w-[22px] items-center justify-center rounded-xs border text-[10px]"
                            [class]="permClass(r.read)"
                            [attr.aria-pressed]="r.read"
                            [attr.title]="t('editor.net.readHelp')"
                            (click)="setPerm(r, 'read', !r.read)"
                          >
                            {{ t('editor.net.read') }}
                          </button>
                          <button
                            type="button"
                            class="inline-flex h-[20px] w-[22px] items-center justify-center rounded-xs border text-[10px]"
                            [class]="permClass(r.write)"
                            [attr.aria-pressed]="r.write"
                            [attr.title]="t('editor.net.writeHelp')"
                            (click)="setPerm(r, 'write', !r.write)"
                          >
                            {{ t('editor.net.write') }}
                          </button>
                        </span>
                      </td>
                      <td class="py-[7px] pr-[18px]">
                        <span class="flex items-center justify-end gap-[2px]">
                          <button
                            type="button"
                            class="flex h-[20px] w-[18px] items-center justify-center rounded-xs text-[12px] leading-none text-ink-4 hover:text-ink disabled:opacity-40 disabled:hover:text-ink-4"
                            [disabled]="!canEdit() || !r.container"
                            [attr.title]="editHint(t, t('editor.net.addChild'))"
                            (click)="startAdd(r)"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            class="flex h-[20px] w-[18px] items-center justify-center rounded-xs text-ink-4 hover:text-ink disabled:opacity-40 disabled:hover:text-ink-4"
                            [disabled]="!canEdit() || !r.path"
                            [attr.title]="editHint(t, t('editor.net.renameNode'))"
                            (click)="startRename(r)"
                          >
                            <nc-icon name="edit" [size]="12" />
                          </button>
                          <button
                            type="button"
                            class="flex h-[20px] w-[18px] items-center justify-center rounded-xs text-ink-4 hover:text-hot-ink disabled:opacity-40 disabled:hover:text-ink-4"
                            [disabled]="!canEdit() || !r.path"
                            [attr.title]="editHint(t, t('editor.net.deleteNode'))"
                            (click)="remove(r)"
                          >
                            <nc-icon name="trash" [size]="12" />
                          </button>
                        </span>
                      </td>
                    </tr>
                    @if (adding() === r.path) {
                      <tr class="h-[35px] border-b border-line-faint">
                        <td class="py-[7px]" [style.paddingLeft.px]="18 + (r.depth + 1) * 20">
                          <input
                            #editInput
                            class="w-[180px] rounded-xs border border-gold bg-inset px-1 font-mono text-[12px] text-ink outline-none"
                            [placeholder]="t('editor.net.newKey')"
                            [value]="draft()"
                            (input)="onDraft($event)"
                            (keydown.enter)="commitAdd(r)"
                            (keydown.escape)="cancelEdit()"
                            (blur)="cancelEdit()"
                          />
                        </td>
                        <td colspan="4"></td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="flex flex-1 items-center justify-center">
              <nc-empty-state
                icon="users"
                [title]="t('editor.net.idle')"
                [hint]="t('editor.net.noSession')"
              />
            </div>
          }
        </section>

        <aside class="relative flex min-h-0 flex-col overflow-auto border-l border-line bg-panel">
          <!-- Shared: the join policy and the per-path permissions are one set of switches that
               everyone in the session is looking at, so a peer's pointer says what is about to
               change for all of you. -->
          <nc-presence-surface surface="net:session" mode="shared" />
          <section class="border-b border-line p-1.5">
            <div class="mb-1 flex items-center justify-between">
              <span class="label text-ink-3">{{ t('editor.net.whoCanJoin') }}</span>
              <nc-help-dot [text]="t('editor.net.whoHelp')" />
            </div>
            <span class="label text-ink-4">{{ t('editor.net.inWorkSession') }}</span>
            @for (c of work.collaborators(); track c.clientId) {
              <div class="flex items-center gap-1 py-0.5">
                <nc-avatar [name]="c.name" [id]="c.userId" [size]="16" />
                <span class="text-ui text-ink">{{ c.name }}</span>
                @if (c.isSelf) {
                  <span class="label text-ink-4">{{ t('editor.net.you') }}</span>
                }
                <span class="flex-1"></span>
                @if (slotOf(c.userId); as slot) {
                  <span class="label text-jade-ink">
                    {{ t('editor.net.inGame') }} · P{{ slot }}
                  </span>
                } @else if (info()?.joinCode && !c.isSelf) {
                  <span class="label text-ink-4">{{ t('editor.net.invite') }}</span>
                }
              </div>
            }
            @if (info(); as i) {
              <span class="label mt-1 block text-ink-4">{{ t('editor.net.anyoneElse') }}</span>
              <div
                class="mt-0.5 flex items-center rounded-sm border border-line bg-inset px-1.5 py-1"
              >
                <span class="flex-1 font-mono text-ui tracking-[.2em] text-gold-ink">
                  {{ i.joinCode ?? '—' }}
                </span>
                @if (i.joinCode) {
                  <button ncButton variant="ghost" size="sm" (click)="copy(i.joinCode)">
                    {{ t('editor.net.copy') }}
                  </button>
                }
              </div>
              <button ncButton variant="secondary" class="mt-1 w-full" (click)="end()">
                {{ i.role === 'host' ? t('editor.net.endSession') : t('editor.net.leaveSession') }}
              </button>
            }
          </section>

          <section class="border-b border-line p-1.5">
            <div class="mb-1 flex items-center justify-between">
              <span class="label text-ink-3">
                {{ t('editor.net.players') }} · {{ players().length }} /
                {{ info()?.maxPlayers || '—' }}
              </span>
              <nc-help-dot [text]="t('editor.net.playersHelp')" />
            </div>
            @for (p of slots(); track p.slot) {
              <div class="flex items-center gap-1 py-0.5">
                @if (p.userId !== null) {
                  <nc-avatar [name]="p.name" [id]="p.userId" [size]="16" />
                  <span class="text-ui text-ink">{{ p.name }}</span>
                  @if (p.host) {
                    <span class="label text-gold-ink">{{ t('editor.net.host') }}</span>
                  }
                  <span class="flex-1"></span>
                  @if (p.ping !== null) {
                    <span class="font-mono text-label text-ink-4">{{ p.ping }}ms</span>
                  }
                  <span class="label text-jade-ink">P{{ p.slot }}</span>
                } @else {
                  <span
                    class="inline-block h-2 w-2 rounded-xs border border-dashed border-line"
                  ></span>
                  <span class="text-ui text-ink-4">{{ t('editor.net.openSlot') }}</span>
                  <span class="flex-1"></span>
                  <span class="label text-ink-4">P{{ p.slot }}</span>
                }
              </div>
            }
          </section>

          <section class="p-1.5">
            <div class="mb-1 flex items-center justify-between">
              <span class="label text-ink-3">{{ t('editor.net.testRig') }}</span>
              <nc-help-dot [text]="t('editor.net.testHelp')" />
            </div>
            @if (rig()) {
              <button ncButton variant="secondary" class="w-full" (click)="rig.set(false)">
                {{ t('editor.net.closeRig') }}
              </button>
              <div class="mt-1 rounded-sm border border-line bg-inset p-1">
                <nc-game-screen
                  [game]="work.game"
                  [projectId]="work.id"
                  [autoJoin]="rigTarget()"
                  fit="width"
                  [autoPlay]="true"
                  [showFps]="false"
                  [transport]="false"
                />
              </div>
              <p class="mt-1 text-meta text-ink-4">
                {{ rigJoined() ? t('editor.net.rigJoined') : t('editor.net.rigWaiting') }}
              </p>
            } @else {
              <button
                ncButton
                variant="primary"
                class="w-full"
                (click)="spawn()"
                [disabled]="!info()"
              >
                <nc-icon name="plus" [size]="12" />
                {{ t('editor.net.spawn') }}
              </button>
              @if (!info()) {
                <p class="mt-1 text-meta text-ink-4">{{ t('editor.net.needHost') }}</p>
              }
            }
            <div class="mt-1.5 grid gap-0.5">
              <!-- Impairment belongs to the spawned client, not to us: degrading the host's own
                 transport would slow every real player down instead of simulating one bad line. -->
              <nc-slider
                [label]="t('editor.net.latency')"
                [max]="400"
                [step]="10"
                [value]="latency()"
                [readout]="latency() + 'ms'"
                [disabled]="!rig()"
                accent="sky"
                (valueChange)="setLatency($event)"
              />
              <nc-slider
                [label]="t('editor.net.loss')"
                [max]="30"
                [value]="loss()"
                [readout]="loss() + '%'"
                [disabled]="!rig()"
                accent="hot"
                (valueChange)="setLoss($event)"
              />
            </div>
          </section>
        </aside>
      </div>
    </div>
  `,
  host: { class: 'block h-full' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NetTabPage {
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
  private readonly permsVersion = signal(0);
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
  /**
   * Only the host may reshape the tree. A client's write goes through the host anyway, but a
   * rename is a delete plus a write, and half of that arriving is worse than neither.
   */
  protected readonly canEdit = computed(() => this.session()?.isHost ?? false);
  protected readonly players = computed(() => {
    const s = this.session();
    if (!s) return [] as number[];
    const peers = this.bridge()?.peers() ?? [];
    return [s.selfUserId, ...peers.filter((p) => p !== s.selfUserId)];
  });
  protected readonly slots = computed(() => {
    // The slot count comes from the session (net.host{ maxPlayers = n }) — the design draws four
    // because its example game asked for four, not because four is a limit.
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
  protected readonly rows = computed<Row[]>(() => {
    this.tick();
    this.permsVersion();
    const s = this.session();
    if (!s) return [];
    const perms = new Map<string, number>();
    this.work.game.netPermissions.forEach((v, k) => perms.set(k, v.flags));
    const q = this.filter().trim().toLowerCase();
    const out: Row[] = [];
    const visit = (path: string, depth: number): void => {
      const container = path === '' || s.isContainer(path);
      const keys = container ? s.childKeys(path) : [];
      const value = container ? undefined : s.getValue(path);
      const objectKind = path ? s.objectKindAt(path) : undefined;
      const flags = resolveFlags(perms, path);
      const row: Row = {
        path,
        depth,
        name: path === '' ? '<root>' : path,
        container,
        // The design labels the root by its type and every other container by its size.
        value:
          objectKind ??
          (path === '' ? 'table' : container ? this.entries(keys.length) : formatScalar(value)),
        kind: objectKind ? 'object' : container ? 'table' : (typeof value as Row['kind']),
        owner: path
          ? (s.lockOwner(path) ?? (depth > 0 ? (s.isHost ? s.selfUserId : null) : null))
          : null,
        read: flags === null ? true : (flags & PERM_CLIENT_READ) !== 0,
        write: flags === null ? true : (flags & PERM_CLIENT_WRITE) !== 0,
        configured: perms.has(path),
      };
      if (!q || path.toLowerCase().includes(q) || path === '') out.push(row);
      if (container && !this.collapsed().has(path))
        for (const k of keys) visit(path ? `${path}.${k}` : k, depth + 1);
    };
    visit('', 0);
    return out;
  });

  constructor() {
    let timer: ReturnType<typeof setInterval> | null = null;
    effect((onCleanup) => {
      const s = this.session();
      if (timer) clearInterval(timer);
      timer = null;
      if (!s) return;
      const bump = (): void => {
        this.tick.update((v) => v + 1);
      };
      s.onChange('**', bump);
      timer = setInterval(bump, 500);
      onCleanup(() => {
        if (timer) clearInterval(timer);
        timer = null;
      });
    });
    const unsubPerms = (): void => {
      this.permsVersion.update((v) => v + 1);
    };
    this.work.game.netPermissions.observe(unsubPerms);
    inject(DestroyRef).onDestroy(() => {
      this.work.game.netPermissions.unobserve(unsubPerms);
      if (timer) clearInterval(timer);
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

  /**
   * Granted is jade on a jade *wash*, not a jade fill: the chip is 22×20 and a solid fill at that
   * size turns the R and W into holes. Denied is the raised surface, so the pair reads as a switch.
   */
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

  /** Gold is the host, every other owner is a peer; an unowned path has no colour to carry. */
  protected ownerClass(owner: number | null): string {
    if (owner === null) return 'text-ink-4';
    return this.isHostOwner(owner) ? 'text-gold-ink' : 'text-sky-ink';
  }

  private isHostOwner(userId: number): boolean {
    const s = this.session();
    return s !== null && s.isHost && userId === s.selfUserId;
  }

  /** The action buttons say what they do, or why they cannot. */
  protected editHint(t: (key: string) => string, label: string): string {
    return this.canEdit() ? label : t('editor.net.hostOnly');
  }

  protected ownerName(userId: number | null): string {
    if (userId === null) return '—';
    if (this.isHostOwner(userId)) return 'host';
    return this.nameOf(userId);
  }

  protected nameOf(userId: number): string {
    if (userId === this.me()) return this.auth.displayName();
    return (
      this.work.collaborators().find((c) => c.userId === userId)?.name ?? `user ${String(userId)}`
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
    const session = this.session();
    this.cancelEdit();
    if (!key || key.includes('.') || !session) return;
    // A new node has to hold something for the tree to carry it; the empty string is the one
    // value that is visibly a placeholder rather than a number someone meant.
    session.setValue(r.path ? `${r.path}.${key}` : key, '');
  }

  protected commitRename(r: Row): void {
    const key = this.draft().trim();
    const session = this.session();
    const parent = r.path.slice(0, Math.max(0, r.path.lastIndexOf('.')));
    this.cancelEdit();
    if (!key || key.includes('.') || !session || key === r.path.split('.').pop()) return;
    this.movePath(session, r.path, parent ? `${parent}.${key}` : key);
  }

  protected remove(r: Row): void {
    this.session()?.deleteSubtree(r.path);
  }

  /** Rename is a move: every leaf under the old path is written under the new one, then dropped. */
  private movePath(session: SharedTableSession, from: string, to: string): void {
    const walk = (path: string): void => {
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
    this.toasts.show('Copied', 'success');
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

  protected setLoss(v: number): void {
    this.loss.set(Math.round(v));
  }
}
