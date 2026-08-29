import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
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

import { EditorUiStore } from '../state/editor-ui.store';
import { WorkSessionService } from '../work-session/work-session.service';

/** Right column: the always-on screen, transport, and CONSOLE / DOC / PERF below it. */
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
  ],
  template: `
    <div *transloco="let t" class="relative flex h-full flex-col bg-panel">
      <!-- The pill on the column's edge: collapse it, or bring it back. -->
      <button
        type="button"
        class="absolute top-1/2 -left-1 z-10 flex h-[52px] w-2 -translate-y-1/2 items-center justify-center rounded-[8px] border border-line-strong bg-raised text-ink-2 hover:text-ink"
        [attr.aria-label]="ui.collapsed() ? t('editor.expandConsole') : t('editor.collapseConsole')"
        (click)="ui.toggleCollapsed()"
      >
        <nc-icon [name]="ui.collapsed() ? 'prev' : 'next'" [size]="12" />
      </button>
      @if (!ui.collapsed()) {
        @if (ui.columnMode() !== 'doc') {
          <!-- Size, scale and the viewer controls, as one 40px band above the screen. -->
          <div class="flex h-5 items-center gap-1 border-b border-line px-1.5">
            <span class="font-mono text-meta tracking-wide text-ink">
              {{ popped() ? t('editor.viewer') : '320×180' }}
            </span>
            @if (!popped()) {
              <span class="font-mono text-meta text-ink-3">×{{ scale() }}</span>
            }
            <span class="flex-1"></span>
            <button
              ncButton
              variant="ghost"
              size="sm"
              iconOnly
              [attr.aria-pressed]="popped()"
              [class.text-gold-ink]="popped()"
              [attr.aria-label]="popped() ? t('editor.dockViewer') : t('editor.popOut')"
              (click)="ui.togglePip()"
            >
              <nc-icon [name]="popped() ? 'collapse' : 'expand'" [size]="12" />
            </button>
          </div>
          <!-- Popped out, the screen floats but keeps running: the same canvas, moved, never
               remounted. The slot it leaves behind says where it went. -->
          @if (popped()) {
            <div class="m-1.5 rounded-sm border border-dashed border-line-strong p-2 text-center">
              <p class="label text-ink-3">{{ t('editor.viewerPopped') }}</p>
              <p class="mt-0.5 text-meta text-ink-4">{{ t('editor.viewerPoppedHint') }}</p>
              <button ncButton variant="secondary" size="sm" class="mt-1" (click)="ui.togglePip()">
                {{ t('editor.dockViewer') }}
              </button>
            </div>
          }
          <div class="p-1.5" [class.nc-pip]="popped()">
            <nc-game-screen
              #screen
              [game]="session.game"
              fit="width"
              compact
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
        }
        <nc-tabs
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
          @switch (ui.consoleTab()) {
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
            @case ('doc') {
              <div class="flex h-full items-center justify-center text-center text-body text-ink-3">
                <div>
                  <nc-icon name="book-open" [size]="24" class="mx-auto mb-1" />
                  {{ t('editor.docSoon') }}
                </div>
              </div>
            }
          }
        </div>
      }
    </div>
  `,
  host: { class: 'block' },
  styles: `
    /* The floating viewer: 302px in the bottom-right, over everything, per the design. */
    .nc-pip {
      position: fixed;
      right: 22px;
      bottom: 22px;
      z-index: 40;
      width: 302px;
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
  /** How many screen pixels one console pixel takes, at the column's current width. */
  protected readonly scale = computed(() => {
    const inner = this.ui.consoleWidth() - 24;
    return Math.max(1, Math.round((inner / 320) * 10) / 10);
  });
  protected readonly session = inject(WorkSessionService);
  private readonly screen = viewChild<GameScreenComponent>('screen');
  protected readonly tabs = computed(() => [
    {
      value: 'console',
      label: 'Console',
      icon: 'command' as const,
      badge: this.errorCount() || undefined,
    },
    { value: 'doc', label: 'Doc', icon: 'file' as const },
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
    effect(() => {
      const on = this.ui.autoRun();
      untracked(() => {
        if (on) this.screen()?.runtime.play();
      });
    });
  }

  protected onMounted(): void {
    if (this.ui.autoRun()) this.screen()?.runtime.play();
  }

  protected setTab(tab: string | undefined): void {
    if (tab === 'console' || tab === 'doc' || tab === 'perf') this.ui.setConsoleTab(tab);
  }
}
