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
import { UserAvatarComponent } from '@app/shared/user-avatar.component';
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
  configured: boolean;
  /** Whether a running session has this path, as against the document merely declaring it. */
  live: boolean;
}

/** One key of a path. */
const SEGMENT = /^[a-z0-9_]+$/i;
/**
 * A path, which a declaration may give whole: building `players.score` a segment at a time means
 * declaring a node only to reopen it, and the name people say out loud is the dotted one.
 */
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
  template: `
    <div *transloco="let t" class="grid h-full grid-cols-[minmax(0,1fr)_auto]">
      <section class="flex min-h-0 flex-col bg-paper">
        <div
          class="@container relative flex h-(--nc-bar-h) shrink-0 items-center gap-1.25 border-b border-line bg-panel pr-1.5 pl-2"
        >
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
            ncButton
            variant="ghost"
            size="tool"
            iconOnly
            [disabled]="!collapsed().size"
            [attr.aria-label]="t('editor.net.expandAll')"
            [ncTooltip]="t('editor.net.expandAll')"
            (click)="expandAll()"
          >
            <nc-icon name="expand" [size]="24" />
          </button>
          <button
            ncButton
            variant="ghost"
            size="tool"
            iconOnly
            [disabled]="allCollapsed()"
            [attr.aria-label]="t('editor.net.collapseAll')"
            [ncTooltip]="t('editor.net.collapseAll')"
            (click)="collapseAll()"
          >
            <nc-icon name="collapse" [size]="24" />
          </button>
        </div>
        <!-- No rule under this one: the header above it already carries one, and the table's own
               heading row carries a third — the design draws none of the three, and a caption on a
               path does not need a line to separate it from the table it captions. -->
        <div class="flex items-center gap-1 px-[18px] py-[10px]">
          <span class="font-mono text-[9px] tracking-[0.14em] text-ink-3">net.state</span>
          <span class="flex-1"></span>
          <nc-help-dot [text]="t('editor.net.helpState')" />
        </div>
        @if (!bare()) {
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
                      class="truncate py-[7px] pr-2"
                      [attr.title]="r.name"
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
                    <!-- The table is fixed, but a cell does not clip on its own: a long string ran
                         straight over OWNER and PERMS, so a row read as two columns of one value.
                         The whole of it is on the cell, for a reader who needs it. -->
                    <td
                      class="truncate py-[7px]"
                      [attr.title]="r.value"
                      [class]="valueClass(r.kind)"
                    >
                      {{ r.value }}
                    </td>
                    <td
                      class="truncate py-[7px]"
                      [attr.title]="ownerName(r.owner)"
                      [class]="ownerClass(r.owner)"
                    >
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
                          [disabled]="!canShape(r) || (r.live && !r.container)"
                          [attr.title]="editHint(t, r, t('editor.net.addChild'))"
                          (click)="startAdd(r)"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          class="flex h-[20px] w-[18px] items-center justify-center rounded-xs text-ink-4 hover:text-ink disabled:opacity-40 disabled:hover:text-ink-4"
                          [disabled]="!canShape(r) || !r.path"
                          [attr.title]="editHint(t, r, t('editor.net.renameNode'))"
                          (click)="startRename(r)"
                        >
                          <nc-icon name="edit" [size]="12" />
                        </button>
                        <button
                          type="button"
                          class="flex h-[20px] w-[18px] items-center justify-center rounded-xs text-ink-4 hover:text-hot-ink disabled:opacity-40 disabled:hover:text-ink-4"
                          [disabled]="!canShape(r) || !r.path"
                          [attr.title]="editHint(t, r, t('editor.net.deleteNode'))"
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
            >
              <button ncButton variant="secondary" size="sm" (click)="startAdd(root)">
                {{ t('editor.net.declarePath') }}
              </button>
            </nc-empty-state>
          </div>
        }
      </section>

      <nc-panel-column [width]="PANEL_WIDTH" [title]="t('editor.net.session')">
        <!-- Hosting is sky in the design, joined is jade: the two roles are told apart by hue. -->
        <span
          actions
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

        <!-- Shared: the roster, the join code and who holds which slot are one set of facts that
               everyone in the session is looking at, so a peer's pointer says what is about to
               change for all of you. The test rig below is not — see there. -->
        <nc-section banded [title]="t('editor.net.whoCanJoin')">
          <nc-help-dot actions [text]="t('editor.net.whoHelp')" />
          <nc-presence-surface surface="net:session" />
          <span class="font-mono text-micro uppercase tracking-strip text-ink-4">
            {{ t('editor.net.inWorkSession') }}
          </span>
          @for (c of work.collaborators(); track c.clientId) {
            <div class="flex items-center gap-1 py-0.5">
              <nc-user-avatar [name]="c.name" [userId]="c.userId" [size]="16" />
              <span class="text-ui text-ink">{{ c.name }}</span>
              @if (c.isSelf) {
                <span class="font-mono text-micro lowercase tracking-button text-ink-3">
                  {{ t('editor.net.you') }}
                </span>
              }
              <span class="flex-1"></span>
              @if (slotOf(c.userId); as slot) {
                <span class="label text-jade-ink">{{ t('editor.net.inGame') }} · P{{ slot }}</span>
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
        </nc-section>

        <nc-section
          banded
          [title]="
            t('editor.net.players') + ' · ' + players().length + ' / ' + (info()?.maxPlayers || '—')
          "
        >
          <nc-help-dot actions [text]="t('editor.net.playersHelp')" />
          <nc-presence-surface surface="net:players" />
          @for (p of slots(); track p.slot) {
            <div class="flex items-center gap-1 py-0.5">
              @if (p.userId !== null) {
                <nc-user-avatar [name]="p.name" [userId]="p.userId" [size]="16" />
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
          <!-- What the session is costing, and by which route. A relayed connection is the one that
               is paid for by the gigabyte, so the figure that decides a provider is here rather
               than in a dashboard nobody opens while playing. -->
          @if (traffic(); as t2) {
            <div class="flex items-center gap-1 border-t border-line-faint pt-0.5 text-label">
              <span class="label text-ink-3">{{ t('editor.net.route') }}</span>
              <span [class]="t2.relayed ? 'text-orange-ink' : 'text-jade-ink'">
                {{ t2.relayed ? t('editor.net.relayed') : t('editor.net.direct') }}
              </span>
              <span class="flex-1"></span>
              <span class="font-mono text-ink-4">{{ t2.total }}</span>
              @if (t2.rate) {
                <span class="font-mono text-ink-body">{{ t2.rate }}</span>
              }
            </div>
          }
        </nc-section>

        <!-- No presence: the rig spawns a client in this browser and the impairment sliders
               shape that client alone. Nobody else sees what these do, so nobody else needs to see
               a pointer over them. -->
        <nc-section banded [title]="t('editor.net.testRig')">
          <nc-help-dot actions [text]="t('editor.net.testHelp')" />
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
          <!-- Off by default and said out loud: this one sends real traffic through a real relay,
               which is metered. It takes effect on the next session, not the one running. -->
          <nc-toggle-button
            class="mt-1"
            accent="gold"
            [checked]="relayOnly()"
            (checkedChange)="setRelayOnly($event)"
          >
            {{ t('editor.net.relayOnly') }}
          </nc-toggle-button>
          <p class="mt-0.5 text-meta text-ink-3">{{ t('editor.net.relayOnlyHelp') }}</p>
        </nc-section>
      </nc-panel-column>
    </div>
  `,
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

    // What the document declares, with every ancestor a name implies. This is the half that makes
    // the tree editable with nothing running: a permission is set on a path, so the path is a node
    // whether or not a session has ever put a value there.
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
        // The design labels the root by its type and every other container by its size. A node the
        // document declares and no session has reached carries a dash: it has no value yet, which
        // is not the same as holding nil.
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
        configured: perms.has(path),
        live,
      };
      if (!q || path.toLowerCase().includes(q) || root) out.push(row);
      if (container && !this.collapsed().has(path))
        for (const k of keys) visit(path ? `${path}.${k}` : k, depth + 1);
    };
    visit('', 0);
    return out;
  });

  /**
   * Nothing to show: no session, and no path declared either. The root row alone is a table with a
   * plus button in it, which is not an invitation — the empty state is. It steps aside the moment a
   * name is being typed, because the field that takes it lives in the table.
   */
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
    configured: false,
    live: false,
  };
  protected readonly bare = computed(
    () => this.session() === null && this.adding() === null && this.rows().length <= 1,
  );

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
  protected editHint(t: (key: string) => string, r: Row, label: string): string {
    return this.canShape(r) ? label : t('editor.net.hostOnly');
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
    // Declaring it is what makes it a node with nothing running behind it. Open both ways, which is
    // what an unconfigured path already resolves to: the entry names the path, it does not close it.
    this.work.game.transact(() => {
      this.work.game.netPermissions.set(path, { flags: PERM_CLIENT_READ | PERM_CLIENT_WRITE });
    });
    // A new node has to hold something for the live tree to carry it; the empty string is the one
    // value that is visibly a placeholder rather than a number someone meant.
    if (this.canEdit()) this.session()?.setValue(path, '');
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

  /** Every permission on a path and under it, as [old key, new key, flags]. */
  private permissionsUnder(path: string): [string, string, number][] {
    const moved: [string, string, number][] = [];
    this.work.game.netPermissions.forEach((value, key) => {
      if (key === path || key.startsWith(`${path}.`)) moved.push([key, key, value.flags]);
    });
    return moved;
  }

  /**
   * A rename takes the permissions with the name.
   *
   * Without this they stayed on a path the tree no longer has: the node came back fully open, and
   * the orphaned entry sat in the document naming a branch nobody could see. One transaction,
   * because everything downstream reloads on this map and a tree with two names for one branch is
   * worse than either name.
   */
  private movePermissions(from: string, to: string): void {
    const map = this.work.game.netPermissions;
    const moved = this.permissionsUnder(from).map(([key, , flags]): [string, string, number] => [
      key,
      to + key.slice(from.length),
      flags,
    ]);
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

  protected readonly relayOnly = computed(() => this.bridge()?.relayOnly() ?? false);

  protected setRelayOnly(on: boolean): void {
    this.bridge()?.relayOnly.set(on);
  }

  protected setLoss(v: number): void {
    this.loss.set(Math.round(v));
  }
}
