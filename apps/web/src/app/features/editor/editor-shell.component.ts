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
import { TranslocoDirective } from '@jsverse/transloco';
import { computeSizeReport } from '@naucto/engine';
import {
  AvatarComponent,
  ButtonDirective,
  DialogService,
  ErrorStateComponent,
  LcdComponent,
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
import { EditorRuntimeService } from './state/editor-runtime.service';
import {
  CONSOLE_WIDTH,
  type EditorTab,
  EditorUiStore,
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
    AvatarComponent,
    ButtonDirective,
    ErrorStateComponent,
    LcdComponent,
    RailComponent,
    AccountMenuComponent,
    NotificationsBellComponent,
    ConsoleColumnComponent,
    DocPaneComponent,
    VersionsPopoverComponent,
  ],
  providers: [WorkSessionService, EditorUiStore, RuntimeHostService, EditorRuntimeService],
  template: `
    <div *transloco="let t" class="grid h-dvh grid-rows-[56px_1fr] bg-page text-ink">
      <!-- Same bar as the hub's: same height, same mark, same inset. It used to be 50px tall with a
           28px mark centred in a 40px slot, so the logo jumped both down and sideways whenever you
           crossed between the hub and the editor. Aligning the mark to the 81px rail below would
           reintroduce exactly that shift, so it takes the top bar's placement instead. -->
      <header class="flex items-center gap-1.5 border-b border-line bg-panel pr-2 pl-2.5">
        <a
          routerLink="/games"
          class="mr-[6px] flex shrink-0 items-center"
          [attr.aria-label]="t('nav.myGames')"
        >
          <img src="/img/logo.png" alt="" width="32" height="32" class="pixelated" />
        </a>
        @if (live()) {
          <nc-versions-popover />
        }
        <span class="flex-1"></span>
        @if (live()) {
          <div class="flex items-center" [attr.aria-label]="t('editor.inSession')">
            <!-- Other people only: you are already the account button at the far right. -->
            @for (c of others(); track c.clientId) {
              <nc-avatar [name]="c.name" [colour]="c.colour" [size]="38" overlap />
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

      @switch (session.status()) {
        @case ('ready') {
          <div [class]="gridClass()" [style.--console-w.px]="ui.collapsed() ? 12 : CONSOLE_WIDTH">
            <nc-rail
              [items]="rail"
              [value]="ui.activeTab()"
              (valueChange)="go($event)"
              [label]="t('editor.tools')"
            />
            <section class="min-h-0 overflow-auto"><router-outlet /></section>
            <!-- Wide enough, and the reference gets a column of its own rather than evicting the
                 screen — "the screen is always on". Below that it takes the console's place, and
                 the console column renders it there so the runtime is never torn down. -->
            @if (ui.columnMode() === 'split') {
              <nc-doc-pane
                class="min-h-0 border-l border-line"
                [style.width.px]="REFERENCE_WIDTH"
              />
            }
            <!-- The column stays docked in every tab; only the viewer inside it can float. -->
            <nc-console-column class="min-h-0 border-l border-line" />
          </div>
        }
        @case ('error') {
          <!-- The console surface is where the machine talks during a session; a project that
               never opened is a page-level failure and takes the page-level state. -->
          <div class="flex items-center justify-center p-6">
            <nc-error-state [title]="t('editor.cannotOpen')" [hint]="session.error() ?? undefined">
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
    </div>
  `,
  // F1 and Ctrl-K are declared all over the design's chrome and were bound by nobody.
  //
  // `block` is load-bearing: a ResizeObserver reports a 0-wide content box for an inline element,
  // so the width this shell measures into the store stayed at its 1280 default no matter how wide
  // the window was — and the docs could never earn a column of their own.
  host: { class: 'block', '(document:keydown)': 'onShortcut($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorShellComponent implements OnInit {
  readonly id = input.required({ transform: numberAttribute });
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
  /** 80px rail, the workspace, and the console column — which is present in every tab. */
  /** The doc column only exists in split mode, so the template has to change with it. */
  // The rail is 81 on the artboard, not 80, and the reference and console are fixed tracks —
  // neither is draggable, any more than a tab inspector is.
  // Spelled out, never interpolated: Tailwind generates utilities by scanning source text, so a
  // class built at runtime is a class that does not exist — the columns silently stack.
  protected readonly gridClass = computed(() =>
    this.ui.columnMode() === 'split'
      ? 'grid min-h-0 grid-cols-[81px_minmax(0,1fr)_401px_var(--console-w)]'
      : 'grid min-h-0 grid-cols-[81px_minmax(0,1fr)_var(--console-w)]',
  );

  protected readonly CONSOLE_WIDTH = CONSOLE_WIDTH;
  protected readonly REFERENCE_WIDTH = REFERENCE_WIDTH;

  /**
   * F1 shows the docs for the symbol under the cursor; Ctrl/⌘-K puts the caret in the doc search.
   * Both open the DOC tab first, because the pane has to exist before it can be asked anything.
   */
  protected onShortcut(e: KeyboardEvent): void {
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
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) this.ui.setViewportWidth(w);
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
