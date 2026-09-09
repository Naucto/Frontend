import type { OnInit } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  numberAttribute,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthStore } from '@app/core/auth/auth.store';
import { PresenceStore } from '@app/core/presence/presence.store';
import { AccountMenuComponent } from '@app/features/shell/account-menu.component';
import { NotificationsBellComponent } from '@app/features/shell/notifications-bell.component';
import { RuntimeHostService } from '@app/shared/game-screen/runtime-host.service';
import { UserAvatarComponent } from '@app/shared/user-avatar.component';
import { TranslocoDirective } from '@jsverse/transloco';
import { computeSizeReport } from '@naucto/engine';
import {
  ButtonDirective,
  DialogService,
  ErrorStateComponent,
  IconComponent,
  LcdComponent,
  PanelRegionComponent,
  RailComponent,
  type RailItem,
  ToastService,
} from '@naucto/ui';
import { filter } from 'rxjs';

import { ConsoleColumnComponent } from './console/console-column.component';
import { DocPaneComponent } from './docs/doc-pane.component';
import { DocRequestService } from './docs/doc-request.service';
import { PUBLISH_CEILING, PublishDialogComponent } from './game/publish.dialog';
import { ShareDialogComponent } from './game/share.dialog';
import { VersionsPopoverComponent } from './game/versions-popover.component';
import { OpenOnDesktopComponent } from './open-on-desktop.component';
import { EditorRuntimeService } from './state/editor-runtime.service';
import {
  CONSOLE_WIDTH,
  type EditorTab,
  EditorUiStore,
  REFERENCE_SPLIT_BREAKPOINT,
  REFERENCE_WIDTH,
} from './state/editor-ui.store';
import { WorkSessionService } from './work-session/work-session.service';

const TABS: readonly EditorTab[] = ['game', 'code', 'art', 'map', 'sound', 'net'];
const isTab = (s: string | undefined): s is EditorTab => TABS.includes(s as EditorTab);

const RAIL: RailItem<EditorTab>[] = [
  { value: 'game', label: 'Game', icon: 'save' },
  { value: 'code', label: 'Code', icon: 'code' },
  { value: 'art', label: 'Art', icon: 'image' },
  { value: 'map', label: 'Map', icon: 'map' },
  { value: 'sound', label: 'Sound', icon: 'music' },
  { value: 'net', label: 'Net', icon: 'users' },
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
  ],
  providers: [WorkSessionService, EditorUiStore, RuntimeHostService, EditorRuntimeService],
  template: `
    <div *transloco="let t" class="grid h-dvh grid-rows-[56px_1fr] bg-page text-ink">
      <!-- The mark sits in the rail's own column, so the vertical seam runs unbroken from the logo
           down past every rail item. The hub's bar gives it the same cell, which is what makes that
           safe: aligning only one of the two is what used to make the logo jump sideways whenever
           you crossed between them. -->
      <header class="flex items-center gap-1.5 border-b border-line bg-panel pr-2 pl-0">
        <a
          routerLink="/games"
          class="flex w-[81px] shrink-0 items-center justify-center"
          [attr.aria-label]="t('nav.myGames')"
        >
          <img src="/img/logo.svg" alt="" width="32" height="32" />
        </a>
        @if (live()) {
          <nc-versions-popover />
        }
        <span class="flex-1"></span>
        @if (live()) {
          <div class="flex items-center" [attr.aria-label]="t('editor.inSession')">
            <!-- Other people only: you are already the account button at the far right. -->
            @for (c of others(); track c.clientId) {
              <nc-user-avatar
                [userId]="c.userId"
                [name]="c.name"
                [colour]="c.colour"
                [size]="38"
                overlap
              />
            }
          </div>
          <!-- No "show viewer" button here: the viewer is docked and popped from the console
               column's own header, which is where the design puts that control. -->
          <button ncButton variant="secondary" size="bar" (click)="share()">
            {{ t('editor.share') }}
          </button>
          <button
            ncButton
            variant="primary"
            size="bar"
            (click)="publish()"
            [disabled]="!session.isHost() || !!publishBlockedBy()"
            [attr.title]="publishBlockedBy() ? t(publishBlockedBy()!) : null"
          >
            {{ t('editor.publish') }}
          </button>
        }
        <nc-notifications-bell />
        <nc-account-menu />
      </header>

      @if (ui.tooNarrow()) {
        <nc-open-on-desktop [id]="String(id())" />
      } @else {
        @switch (session.status()) {
          @case ('ready') {
            <div class="grid min-h-0 grid-cols-[81px_minmax(0,1fr)_auto]">
              <nc-rail
                [items]="rail"
                [value]="ui.activeTab()"
                (valueChange)="go($event)"
                [label]="t('editor.tools')"
              />
              <section class="min-h-0 overflow-auto"><router-outlet /></section>
              <nc-panel-region
                [secondaryOpen]="ui.referenceShown()"
                [viewportWidth]="ui.viewportWidth()"
                [splitAt]="REFERENCE_SPLIT_BREAKPOINT"
                [primaryWidth]="consoleWidth()"
                [secondaryWidth]="REFERENCE_WIDTH"
                [switchLabel]="switchKey() ? t(switchKey()) : ''"
                (switched)="ui.toggleReference()"
              >
                <!-- Built only while it is open: the reference has nothing running in it, so unlike
                   the console it costs nothing to rebuild and something to keep. -->
                <div secondary class="flex min-h-0 flex-col border-l border-line">
                  @if (ui.referenceShown()) {
                    <nc-doc-pane class="min-h-0 flex-1 overflow-auto" />
                    <!-- The artboard puts this at the foot of the reference, and only where the
                       reference has taken the game's place — the one arrangement in which the game
                       really has been put away. -->
                    @if (ui.columnMode() === 'swap') {
                      <div
                        class="flex shrink-0 items-center gap-1 border-t border-line bg-inset px-1.5 py-1"
                      >
                        <nc-icon name="pause" [size]="12" class="text-gold-ink" />
                        <span class="label text-gold-ink">{{ t('editor.gamePaused') }}</span>
                      </div>
                    }
                  }
                </div>
                <nc-console-column
                  primary
                  class="min-h-0 border-line"
                  [shown]="consoleShown()"
                  [class.border-l]="consoleShown()"
                />
              </nc-panel-region>
            </div>
          }
          @case ('error') {
            <!-- The console surface is where the machine talks during a session; a project that
               never opened is a page-level failure and takes the page-level state. -->
            <div class="flex items-center justify-center p-6">
              <nc-error-state
                [title]="t('editor.cannotOpen')"
                [hint]="session.error() ?? undefined"
              >
                <a ncButton variant="secondary" routerLink="/games">{{ t('nav.myGames') }}</a>
              </nc-error-state>
            </div>
          }
          @case ('kicked') {
            <div class="flex items-center justify-center p-6">
              <nc-error-state tone="neutral" icon="users" [title]="t('editor.kicked')">
                <a ncButton variant="secondary" routerLink="/games">{{ t('nav.myGames') }}</a>
              </nc-error-state>
            </div>
          }
          @default {
            <div class="flex items-center justify-center p-6">
              <nc-lcd class="w-[420px]" [minHeight]="80">
                > {{ t('editor.status.' + session.status()) }}
              </nc-lcd>
            </div>
          }
        }
      }
    </div>
  `,
  // F1 and Ctrl-K are declared all over the design's chrome and were bound by nobody.
  //
  // `block` is load-bearing: a ResizeObserver reports a 0-wide content box for an inline element,
  // so the width this shell measures into the store stayed at its 1280 default no matter how wide
  // the window was — and the docs could never earn a column of their own.
  // The editor asks for the big density; the hub and the pages around it match the artboards and
  // are left at the default. Named here rather than at the root so it is a choice, not a setting.
  host: { class: 'nc-density-big block', '(document:keydown)': 'onShortcut($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorShellComponent implements OnInit {
  readonly id = input.required({ transform: numberAttribute });
  protected readonly String = String;
  private readonly presence = inject(PresenceStore);
  private readonly docRequests = inject(DocRequestService);
  private readonly editorRuntime = inject(EditorRuntimeService);
  protected readonly session = inject(WorkSessionService);
  protected readonly ui = inject(EditorUiStore);
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly dialogs = inject(DialogService);
  private readonly toasts = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly rail = RAIL;
  /**
   * What the control on the region's edge does next — empty on a tab that has no reference, which
   * is what leaves the control out.
   *
   * One of these names the game rather than the reference, because that is what its arrival costs.
   */
  protected readonly switchKey = computed(() => {
    if (this.ui.activeTab() !== 'code') return '';
    const wide = this.ui.viewportWidth() >= REFERENCE_SPLIT_BREAKPOINT;
    if (this.ui.referenceOpen()) return wide ? 'docs.close' : 'docs.swapBack';
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

  protected readonly CONSOLE_WIDTH = CONSOLE_WIDTH;
  protected readonly REFERENCE_WIDTH = REFERENCE_WIDTH;
  protected readonly REFERENCE_SPLIT_BREAKPOINT = REFERENCE_SPLIT_BREAKPOINT;

  /**
   * F1 shows the docs for the symbol under the cursor; Ctrl/⌘-K puts the caret in the doc search.
   *
   * Both are bound on the document, so they fire wherever the focus is — including a canvas or a
   * form field on a tab that has no reference to show. Taking a key from every screen in the editor
   * to open a panel that cannot appear is worse than not binding it, so they return the keystroke
   * rather than merely doing nothing with it.
   */
  protected onShortcut(e: KeyboardEvent): void {
    if (this.ui.activeTab() !== 'code') return;
    const meta = e.ctrlKey || e.metaKey;
    if (e.key === 'F1') {
      e.preventDefault();
      this.ui.setReferenceOpen(true);
      const symbol = this.codeEditorSymbol();
      if (symbol) this.docRequests.show(symbol);
      return;
    }
    if (meta && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.ui.setReferenceOpen(true);
      this.docRequests.focusSearch();
    }
  }

  /** The code editor is inside a routed tab, so it is reached through the shared runtime. */
  private codeEditorSymbol(): string | null {
    return this.editorRuntime.symbolAtCursor?.() ?? null;
  }

  constructor() {
    // BUILDING presence, so a friend sees "building Ferry Click" while the editor is open.
    effect((onCleanup) => {
      const projectId = this.id();
      this.presence.announce({ kind: 'BUILDING', projectId });
      onCleanup(() => {
        this.presence.announce({ kind: 'IDLE' });
      });
    });
    if (typeof window !== 'undefined') {
      this.ui.setViewportWidth(window.innerWidth);
      this.ui.setViewportHeight(window.innerHeight);
    }
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box?.width) this.ui.setViewportWidth(box.width);
      if (box?.height) this.ui.setViewportHeight(box.height);
    });
    ro.observe(this.host.nativeElement);
    inject(DestroyRef).onDestroy(() => {
      ro.disconnect();
    });
    // The active tab follows the URL so deep links and back/forward stay in sync.
    const syncTab = (): void => {
      const seg = this.router.url.split('?')[0]?.split('/').pop();
      if (isTab(seg)) this.ui.setTab(seg);
    };
    syncTab();
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(syncTab);
    effect(() => {
      const tab = this.ui.activeTab();
      untracked(() => {
        this.session.setTab(tab);
      });
    });
  }

  ngOnInit(): void {
    void this.session.open(this.id());
  }

  protected go(tab: EditorTab | undefined): void {
    if (!tab) return;
    void this.router.navigate(['/edit', this.id(), tab]);
  }

  protected share(): void {
    this.dialogs.open(ShareDialogComponent, { data: { session: this.session } });
  }

  /**
   * Why publishing is not possible, as an i18n key — the design puts the reason on the button
   * itself rather than letting the click open a dialog that refuses.
   */
  protected readonly publishBlockedBy = computed<string | null>(() => {
    const game = this.session.game;
    if (!game) return null;
    if (computeSizeReport(game).total > PUBLISH_CEILING) return 'editor.publishBlockedSize';
    const named =
      (game.meta.get('projectName') as string | undefined) ?? this.session.project()?.name ?? '';
    const summary = this.session.project()?.shortDesc ?? '';
    return named.trim() && summary.trim() ? null : 'editor.publishBlockedFields';
  });

  /**
   * Whether there is a project to act on.
   *
   * The header used to render SHARE and PUBLISH — and a project pill naming a project it never
   * loaded — over a session that had failed to open, so a page saying "no access to this project"
   * still offered to publish it.
   */
  protected readonly live = computed(() => this.session.status() === 'ready');

  /** Collaborators other than us, for the presence stack. */
  protected readonly others = computed(() => this.session.collaborators().filter((c) => !c.isSelf));

  protected publish(): void {
    this.dialogs
      .open(PublishDialogComponent, { data: { session: this.session } })
      .closed.subscribe((ok) => {
        if (ok) this.toasts.show('Published', 'success');
      });
  }
}
