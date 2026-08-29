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
import { GameScreenComponent } from '@app/shared/game-screen/game-screen.component';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  ButtonDirective,
  IconComponent,
  LcdComponent,
  TabsComponent,
  ToggleComponent,
} from '@naucto/ui';

import { DocPaneComponent } from '../docs/doc-pane.component';
import { EditorRuntimeService } from '../state/editor-runtime.service';
import { CONSOLE_WIDTH, EditorUiStore } from '../state/editor-ui.store';
import { WorkSessionService } from '../work-session/work-session.service';

/** The card's own width, so its corner can be computed rather than measured. Keep in step with the
 *  `.nc-pip` rule below: it clamps the drag, so a stale value lets the card leave the viewport. */
const PIP_WIDTH = 304;

/** Right column: the always-on screen, its transport, and CONSOLE / PERF below it. */
@Component({
  selector: 'nc-console-column',
  imports: [
    TranslocoDirective,
    ButtonDirective,
    IconComponent,
    LcdComponent,
    TabsComponent,
    ToggleComponent,
    GameScreenComponent,
    DocPaneComponent,
  ],
  template: `
    <div *transloco="let t" class="relative flex h-full flex-col bg-panel">
      <!-- No resize strip: the console is a fixed 421 track, like the reference beside it and
           every tab inspector. -->
      @if (ui.columnMode() !== 'swap') {
        <button
          type="button"
          class="absolute top-1/2 -left-1 z-20 flex h-[52px] w-2 -translate-y-1/2 items-center justify-center rounded-[8px] border border-line-strong bg-raised text-ink-2 hover:text-ink"
          [attr.aria-label]="
            ui.collapsed() ? t('editor.expandConsole') : t('editor.collapseConsole')
          "
          (click)="ui.toggleCollapsed()"
        >
          <nc-icon [name]="ui.collapsed() ? 'prev' : 'next'" [size]="12" />
        </button>
      }
      @if (!ui.collapsed() && ui.columnMode() !== 'swap' && popped()) {
        <!-- The slot the viewer left behind says where it went. -->
        <div class="m-1.5 rounded-sm border border-dashed border-line-strong p-2 text-center">
          <p class="label text-ink-3">{{ t('editor.viewerPopped') }}</p>
          <p class="mt-0.5 text-meta text-ink-4">{{ t('editor.viewerPoppedHint') }}</p>
          <button ncButton variant="secondary" size="sm" class="mt-1" (click)="ui.togglePip()">
            <nc-icon name="dock" [size]="12" />
            {{ t('editor.dockViewer') }}
          </button>
        </div>
      }
      <!-- The screen is never torn down — not to make room for the docs, and not when the column
           collapses. Unmounting it cold-starts the game and drops any netplay session, and the
           canvas tabs collapse the column by default, which is exactly where the viewer floats. -->
      <div [class.hidden]="screenHidden()">
        <!-- Docked, this is the column's own 40px band. Popped out it is the card's title bar,
               and dragging it moves the card — the design draws a window, so it behaves like one. -->
        @if (!popped()) {
          <div class="flex h-5 items-center gap-1 border-b border-line px-1.5">
            <span class="font-mono text-meta tracking-wide text-ink">320×180</span>
            <span class="font-mono text-meta text-ink-3">×{{ scale() }}</span>
            <span class="flex-1"></span>
            <button
              ncButton
              variant="ghost"
              size="sm"
              iconOnly
              [attr.aria-pressed]="false"
              [attr.aria-label]="t('editor.popOut')"
              (click)="ui.togglePip()"
            >
              <nc-icon name="pip" [size]="12" />
            </button>
          </div>
        }
        <div
          [class]="popped() ? 'nc-pip' : 'p-1.5'"
          [style.left.px]="pip()?.x ?? null"
          [style.top.px]="pip()?.y ?? null"
          [style.right]="pip() ? 'auto' : null"
          [style.bottom]="pip() ? 'auto' : null"
        >
          @if (popped()) {
            <div
              class="flex h-[31px] cursor-grab items-center gap-1 border-b border-line bg-raised px-1.25 active:cursor-grabbing"
              (pointerdown)="startDrag($event)"
            >
              <nc-icon name="pip" [size]="12" class="text-ink-4" />
              <span class="font-mono text-micro tracking-strip text-ink-3 uppercase">
                {{ t('editor.viewer') }} · 320×180
              </span>
              <span class="flex-1"></span>
              <button
                ncButton
                variant="ghost"
                size="sm"
                iconOnly
                class="-me-0.5"
                [attr.aria-pressed]="true"
                [attr.aria-label]="t('editor.dockViewer')"
                (click)="ui.togglePip()"
              >
                <nc-icon name="collapse" [size]="12" />
              </button>
            </div>
          }
          <nc-game-screen
            #screen
            [game]="session.game"
            [projectId]="session.id"
            fit="width"
            compact
            [overlay]="popped()"
            [showFps]="true"
            (mounted)="onMounted()"
          >
            <nc-toggle
              transport-extra
              [checked]="ui.autoRun()"
              (checkedChange)="ui.setAutoRun($event)"
            >
              {{ t('editor.autoRun') }}
            </nc-toggle>
          </nc-game-screen>
        </div>
      </div>
      @if (!ui.collapsed()) {
        <nc-tabs
          [class.hidden]="ui.columnMode() === 'swap'"
          [tabs]="tabs()"
          [value]="ui.consoleTab()"
          (valueChange)="setTab($event)"
          variant="console"
        >
          @if (ui.consoleTab() === 'console') {
            <button
              actions
              ncButton
              variant="ghost"
              size="sm"
              class="mr-0.25"
              (click)="runtime.lines.set([])"
            >
              {{ t('editor.clear') }}
            </button>
          }
        </nc-tabs>
        <div class="min-h-0 flex-1 overflow-hidden" [class.p-1.5]="ui.consoleTab() !== 'console'">
          @if (ui.columnMode() === 'swap') {
            <div class="flex h-full min-h-0 flex-col">
              <nc-doc-pane class="min-h-0 flex-1 overflow-auto" />
              <!-- The artboard puts this at the foot of the reference, in the swap arrangement
                   only — the one case where the game really has been put away. -->
              <div
                class="flex shrink-0 items-center gap-1 border-t border-line bg-inset px-1.5 py-1"
              >
                <nc-icon name="pause" [size]="12" class="text-gold-ink" />
                <span class="label text-gold-ink">{{ t('editor.gamePaused') }}</span>
              </div>
            </div>
          }
          @switch (ui.columnMode() === 'swap' ? '' : ui.consoleTab()) {
            @case ('console') {
              <nc-lcd variant="flush" class="h-full leading-[1.85] tracking-[0.03em]">
                @for (l of lines(); track l.id) {
                  <div
                    [class.text-hot]="l.level === 'error'"
                    [class.text-orange]="l.level === 'warn'"
                  >
                    {{ l.level === 'error' ? '! ' : l.level === 'warn' ? '? ' : '> ' }}{{ l.text }}
                  </div>
                } @empty {
                  <div class="opacity-60">{{ t('editor.consoleEmpty') }}</div>
                }
                @if (runtime.state() === 'halted') {
                  <div class="mt-1 text-hot">--- HALTED ---</div>
                }
              </nc-lcd>
            }
            @case ('perf') {
              <nc-lcd class="h-full">
                <div>FPS {{ runtime.fps() }}</div>
                <div>CPU {{ runtime.cpu() }}%</div>
                <div>FRAME {{ runtime.frame() }}</div>
                <div>STATE {{ runtime.state() }}</div>
                <div>PEERS {{ session.collaborators().length }}</div>
                <div>SYNC {{ session.synced() ? 'synced' : 'pending' }}</div>
              </nc-lcd>
            }
          }
        </div>
      }
    </div>
  `,
  host: { class: 'block' },
  styles: `
    /* The floating viewer: a 302px card the design draws as a window, so it is one. It starts in
       the bottom-right corner the artboard puts it in and stays wherever it is dragged. */
    .nc-pip {
      position: fixed;
      right: 22px;
      bottom: 22px;
      z-index: 40;
      width: 304px;
      overflow: hidden;
      border: 1px solid var(--nc-line-strong);
      border-radius: 4px;
      background: var(--nc-panel);
      box-shadow: 0 14px 34px rgb(0 0 0 / 0.65);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsoleColumnComponent {
  protected readonly ui = inject(EditorUiStore);
  /** The viewer floats over the editor instead of sitting in the column. */
  protected readonly popped = computed(() => this.ui.consoleMode() === 'pip' && this.ui.pipOpen());
  /** Docked in a collapsed column, or standing in for the docs: either way there is nowhere to be. */
  protected readonly screenHidden = computed(
    () => this.ui.columnMode() === 'swap' || (this.ui.collapsed() && !this.popped()),
  );
  /** How many screen pixels one console pixel takes. The column is a fixed track, so this is too. */
  protected readonly scale = computed(() => {
    const inner = CONSOLE_WIDTH - 24;
    return Math.max(1, Math.round((inner / 320) * 10) / 10);
  });
  protected readonly session = inject(WorkSessionService);
  private readonly editorRuntime = inject(EditorRuntimeService);
  /** Top-left of the floating card. Null until it is placed, which is the design's corner. */
  private readonly pipAt = signal<{ x: number; y: number } | null>(null);
  private readonly screen = viewChild<GameScreenComponent>('screen');
  protected readonly tabs = computed(() => [
    {
      value: 'console',
      label: 'Console',
      icon: 'command' as const,
      badge: this.errorCount() || undefined,
    },
    { value: 'perf', label: 'Perf', icon: 'chart' as const },
  ]);

  get runtime(): GameScreenComponent['runtime'] {
    const s = this.screen();
    if (!s) throw new Error('screen not mounted');
    return s.runtime;
  }
  protected readonly lines = computed(() => this.screen()?.runtime.lines() ?? []);
  private readonly errorCount = computed(
    () => this.lines().filter((l) => l.level === 'error').length,
  );

  constructor() {
    // AUTO-RUN: reload on code changes, debounced.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const files = this.session.game.codeFiles;
    const onChange = (): void => {
      if (!this.ui.autoRun()) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        this.screen()?.runtime.reload();
      }, 400);
    };
    files.observeDeep(onChange);
    effect((cleanup) => {
      cleanup(() => {
        files.unobserveDeep(onChange);
      });
    });
    // Turning AUTO-RUN on starts the game; *opening the editor* does not. Reading the signal for
    // the first time is the initial state, not somebody asking for anything, and treating it as a
    // request is what booted the game on entry — which called net.host, which threw the host
    // dialog over the editor every single time you navigated into it.
    let autoRunSettled = false;
    effect(() => {
      const on = this.ui.autoRun();
      untracked(() => {
        if (!autoRunSettled) {
          autoRunSettled = true;
          return;
        }
        if (on) this.screen()?.runtime.play();
      });
    });
    // Swapping to the docs pauses the game rather than rendering it to a hidden canvas, and
    // swapping back resumes it — but only if the pause was ours, so a game the author had
    // deliberately paused does not start itself when they close the docs.
    let pausedByDoc = false;
    effect(() => {
      const hidden = this.ui.columnMode() === 'swap';
      untracked(() => {
        const runtime = this.screen()?.runtime;
        if (!runtime) return;
        if (hidden) {
          if (runtime.state() === 'running') {
            runtime.pause();
            pausedByDoc = true;
          }
          return;
        }
        if (pausedByDoc) {
          pausedByDoc = false;
          runtime.resume();
        }
      });
    });
  }

  /**
   * Where the card sits, once it has been moved. Until then it is null and the stylesheet's own
   * bottom-right corner — the one the artboard draws it in — stands. Clamped on the x so a window
   * that narrows cannot leave the card, and its title bar, off the side.
   */
  protected readonly pip = computed(() => {
    const at = this.pipAt();
    if (!at) return null;
    const w = this.ui.viewportWidth();
    return { x: Math.min(Math.max(0, at.x), Math.max(0, w - PIP_WIDTH)), y: Math.max(0, at.y) };
  });

  /** Drag the card by its title bar. Buttons in the bar keep their own clicks. */
  protected startDrag(e: PointerEvent): void {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const bar = e.currentTarget as HTMLElement;
    const card = bar.parentElement;
    if (!card) return;
    const box = card.getBoundingClientRect();
    const dx = e.clientX - box.left;
    const dy = e.clientY - box.top;
    bar.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent): void => {
      this.pipAt.set({ x: ev.clientX - dx, y: ev.clientY - dy });
    };
    const up = (): void => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      bar.removeEventListener('pointercancel', up);
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
  }

  protected onMounted(): void {
    const screen = this.screen();
    if (!screen) return;
    this.editorRuntime.host.set(screen.runtime);
    this.editorRuntime.bridge.set(screen.netBridge);
  }

  protected setTab(tab: string | undefined): void {
    if (tab === 'console' || tab === 'perf') this.ui.setConsoleTab(tab);
  }
}
