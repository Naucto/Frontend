import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  numberAttribute,
  type OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { computeSizeReport, KEYS } from '@naucto/engine';
import {
  ButtonDirective,
  DialogService,
  ErrorStateComponent,
  IconComponent,
  LcdComponent,
  LogoComponent,
  PanelRegionComponent,
  RailComponent,
  type RailItem,
  ToastService,
} from '@naucto/ui';
import { filter } from 'rxjs';

import { ActivityService } from '../../core/analytics/activity.service';
import { PresenceStore } from '../../core/presence/presence.store';
import { RuntimeHostService } from '../../shared/game-screen/runtime-host.service';
import { UserAvatarComponent } from '../../shared/user-avatar.component';
import { yTextField } from '../../shared/yjs/y-signal';
import { AccountMenuComponent } from '../shell/account-menu.component';
import { NotificationsBellComponent } from '../shell/notifications-bell.component';
import { ArtStore } from './art/art.store';
import { ConsoleColumnComponent } from './console/console-column.component';
import { DocPaneComponent } from './docs/doc-pane.component';
import { DocRequestService } from './docs/doc-request.service';
import { PUBLISH_CEILING, PublishDialogComponent } from './game/publish.dialog';
import { ShareDialogComponent } from './game/share.dialog';
import { VersionsPopoverComponent } from './game/versions-popover.component';
import { MapStore } from './map/map.store';
import { OpenOnDesktopComponent } from './open-on-desktop.component';
import { SoundStore } from './sound/sound.store';
import { ClipboardStore } from './state/clipboard.store';
import { EditorRuntimeService } from './state/editor-runtime.service';
import {
  CONSOLE_WIDTH,
  type EditorTab,
  EditorUiStore,
  REFERENCE_SPLIT_BREAKPOINT,
  REFERENCE_WIDTH,
} from './state/editor-ui.store';
import { HostElectionService } from './work-session/host-election.service';
import { SessionPresenceService } from './work-session/session-presence.service';
import { SessionSaveService } from './work-session/session-save.service';
import { WorkSessionService } from './work-session/work-session.service';

const TABS: readonly EditorTab[] = ['game', 'code', 'art', 'map', 'sound', 'net'];
const isTab = (segment: string | undefined): segment is EditorTab =>
  TABS.includes(segment as EditorTab);

const RAIL: Omit<RailItem<EditorTab>, 'label'>[] = [
  { value: 'game', icon: 'save' },
  { value: 'code', icon: 'code' },
  { value: 'art', icon: 'image' },
  { value: 'map', icon: 'map' },
  { value: 'sound', icon: 'music' },
  { value: 'net', icon: 'users' },
];

/**
 * The editor: top bar, left tool rail, routed workspace, right console column.
 * The screen is always on — the runtime lives here, not in a tab.
 */
@Component({
  selector: 'nc-editor-shell',
  imports: [
    RouterLink,
    RouterOutlet,
    TranslocoDirective,
    UserAvatarComponent,
    ButtonDirective,
    ErrorStateComponent,
    IconComponent,
    LcdComponent,
    PanelRegionComponent,
    RailComponent,
    AccountMenuComponent,
    NotificationsBellComponent,
    ConsoleColumnComponent,
    OpenOnDesktopComponent,
    DocPaneComponent,
    VersionsPopoverComponent,
    LogoComponent,
  ],
  providers: [
    WorkSessionService,
    SessionSaveService,
    HostElectionService,
    SessionPresenceService,
    EditorUiStore,
    RuntimeHostService,
    EditorRuntimeService,
    ArtStore,
    ClipboardStore,
    MapStore,
    SoundStore,
  ],
  templateUrl: './editor-shell.component.html',
  // `block` is load-bearing: a ResizeObserver reports a 0-wide content box for an inline element,
  // so an inline host measures 0 into the store whatever the window is.
  // The editor asks for the big density; the hub and the pages around it match the artboards and
  // are left at the default. Named here rather than at the root so it is a choice, not a setting.
  host: {
    class: 'nc-density-big block',
    '(document:keydown)': 'onShortcut($event)',
    '(window:beforeunload)': 'session.onBeforeUnload($event)',
    '(window:pagehide)': 'session.onPageHide($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class EditorShellComponent implements OnInit {
  readonly id = input.required({ transform: numberAttribute });
  protected readonly String = String;
  private readonly presence = inject(PresenceStore);
  private readonly activity = inject(ActivityService);
  private readonly docRequests = inject(DocRequestService);
  private readonly editorRuntime = inject(EditorRuntimeService);
  protected readonly session = inject(WorkSessionService);
  private readonly saves = inject(SessionSaveService);
  private readonly sessionPresence = inject(SessionPresenceService);
  protected readonly ui = inject(EditorUiStore);
  private readonly router = inject(Router);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly rail = computed<RailItem<EditorTab>[]>(() =>
    RAIL.map((item) => ({ ...item, label: this.transloco.translate(`editor.rail.${item.value}`) })),
  );
  /**
   * The name and the summary as the GAME tab edits them.
   *
   * They live in the document long before they reach the server, so a gate reading the server's
   * copy called a summary missing while its author was looking at the one they had just typed.
   */
  private readonly draftName = yTextField(this.session.doc.getText(KEYS.projectName));
  private readonly draftSummary = yTextField(this.session.doc.getText(KEYS.shortDescription));
  /** Moves, debounced, with any change to the document, which no signal reports by itself. */
  private readonly docTick = signal(0);
  /**
   * Latched once the workspace has been built wide enough: from then on a narrow window hides it,
   * because tearing it down would cold-start the game the console runs.
   */
  protected readonly workspaceBuilt = linkedSignal<boolean, boolean>({
    source: () => this.session.status() === 'ready' && !this.ui.tooNarrow(),
    computation: (now, prev) => (prev?.value ?? false) || now,
  });
  protected readonly switchKey = computed(() => {
    if (this.ui.activeTab() !== 'code') {
      return '';
    }
    const wide = this.ui.viewportWidth() >= REFERENCE_SPLIT_BREAKPOINT;
    if (this.ui.referenceOpen()) {
      return wide ? 'docs.close' : 'docs.swapBack';
    }
    return wide ? 'editor.openReference' : 'editor.swapToReference';
  });

  protected readonly consoleWidth = computed(() =>
    this.ui.activeTab() === 'code' ? CONSOLE_WIDTH : 0,
  );

  /**
   * Not the same question as whether the track has a width. Where the reference has borrowed it the
   * track is as wide as ever, and the console is not the thing standing in it.
   */
  protected readonly consoleShown = computed(
    () => this.ui.activeTab() === 'code' && this.ui.columnMode() !== 'swap',
  );

  protected readonly REFERENCE_WIDTH = REFERENCE_WIDTH;
  protected readonly REFERENCE_SPLIT_BREAKPOINT = REFERENCE_SPLIT_BREAKPOINT;

  /**
   * F1 shows the docs for the symbol under the caret; Ctrl/⌘-K focuses the doc search. Bound on the
   * document, so on a tab with no reference the keystroke is left to the browser.
   */
  protected onShortcut(event: KeyboardEvent): void {
    if (this.ui.activeTab() !== 'code') {
      return;
    }
    const meta = event.ctrlKey || event.metaKey;
    if (event.key === 'F1') {
      event.preventDefault();
      this.ui.setReferenceOpen(true);
      const symbol = this.editorRuntime.symbolAtCursor?.() ?? null;
      if (symbol) {
        this.docRequests.show(symbol);
      }
      return;
    }
    if (meta && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.ui.setReferenceOpen(true);
      this.docRequests.focusSearch();
    }
  }

  ngOnInit(): void {
    void this.session.open(this.id());
  }

  constructor() {
    // BUILDING presence, so a friend sees "building Ferry Click" while the editor is open.
    effect((onCleanup) => {
      const projectId = this.id();
      this.presence.announce({ kind: 'BUILDING', projectId });
      const release = this.activity.claim({ state: 'BUILDING' });
      onCleanup(() => {
        this.presence.announce({ kind: 'IDLE' });
        release();
      });
    });
    this.ui.setViewportWidth(window.innerWidth);
    this.ui.setViewportHeight(window.innerHeight);
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box?.width) {
        this.ui.setViewportWidth(box.width);
      }
      if (box?.height) {
        this.ui.setViewportHeight(box.height);
      }
    });
    ro.observe(this.host.nativeElement);
    let tickTimer: ReturnType<typeof setTimeout> | null = null;
    const onDocUpdate = (): void => {
      if (tickTimer) {
        return;
      }
      tickTimer = setTimeout(() => {
        tickTimer = null;
        this.docTick.update((count) => count + 1);
      }, 1000);
    };
    this.session.doc.on('update', onDocUpdate);
    inject(DestroyRef).onDestroy(() => {
      void this.session.close();
      ro.disconnect();
      this.session.doc.off('update', onDocUpdate);
      if (tickTimer) {
        clearTimeout(tickTimer);
      }
    });
    // The active tab follows the URL so deep links and back/forward stay in sync.
    const syncTab = (): void => {
      const seg = this.router.url.split('?')[0]?.split('/').pop();
      if (isTab(seg)) {
        this.ui.setTab(seg);
      }
    };
    syncTab();
    this.router.events
      .pipe(
        filter((routerEvent) => routerEvent instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(syncTab);
  }

  protected go(tab: EditorTab | undefined): void {
    if (!tab) {
      return;
    }
    void this.router.navigate(['/edit', this.id(), tab]);
  }

  protected share(): void {
    this.dialogs.open(ShareDialogComponent, {
      data: { session: this.session, saves: this.saves, presence: this.sessionPresence },
    });
  }

  /**
   * The name and the summary as the GAME tab edits them: they live in the document long before they
   * reach the server.
   */
  protected readonly publishBlockedBy = computed<string | null>(() => {
    this.docTick();
    const game = this.session.game;
    if (computeSizeReport(game).total > PUBLISH_CEILING) {
      return 'editor.publishBlockedSize';
    }
    const named = this.draftName() || (this.session.project()?.name ?? '');
    const summary = this.draftSummary() || (this.session.project()?.shortDesc ?? '');
    return named.trim() && summary.trim() ? null : 'editor.publishBlockedFields';
  });

  /** Whether the session opened at all: the header offers SHARE and PUBLISH only then. */
  protected readonly live = computed(() => this.session.status() === 'ready');

  /** Collaborators other than us, for the presence stack. */
  protected readonly others = computed(() =>
    this.sessionPresence.collaborators().filter((collaborator) => !collaborator.isSelf),
  );

  protected publish(): void {
    this.dialogs
      .open(PublishDialogComponent, { data: { session: this.session, saves: this.saves } })
      .closed.subscribe((ok) => {
        if (ok) {
          this.toasts.show(this.transloco.translate('editor.game.published'), 'success');
        }
      });
  }
}
