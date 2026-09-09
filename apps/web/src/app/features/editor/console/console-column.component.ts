import type { ElementRef } from '@angular/core';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
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

import { EditorRuntimeService } from '../state/editor-runtime.service';
import {
  CONSOLE_WIDTH,
  EditorUiStore,
  PIP_MAX_AREA_SHARE,
  PIP_MIN_WIDTH,
} from '../state/editor-ui.store';
import { WorkSessionService } from '../work-session/work-session.service';

/** The viewer's own picture is 16:9, which is what makes the card's height follow its width. */
const PIP_PICTURE_RATIO = 16 / 9;

/** Which edge or corner of the floating card a press took hold of. */
type PipGrip = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/**
 * The eight grips, each with the cursor that says what it does.
 *
 * The card keeps the viewer's ratio, so every one of them resolves to a width in the end — but a
 * grip that only moves up and down has to be *read* off the vertical, or it would sit under a
 * `ns-resize` cursor and answer to sideways movement instead.
 */
const PIP_GRIPS: readonly { grip: PipGrip; box: string; cursor: string }[] = [
  { grip: 'nw', box: 'top-0 left-0 size-2', cursor: 'cursor-nwse-resize' },
  { grip: 'ne', box: 'top-0 right-0 size-2', cursor: 'cursor-nesw-resize' },
  { grip: 'sw', box: 'bottom-0 left-0 size-2', cursor: 'cursor-nesw-resize' },
  { grip: 'se', box: 'right-0 bottom-0 size-2', cursor: 'cursor-nwse-resize' },
  { grip: 'n', box: 'top-0 right-2 left-2 h-0.75', cursor: 'cursor-ns-resize' },
  { grip: 's', box: 'right-2 bottom-0 left-2 h-0.75', cursor: 'cursor-ns-resize' },
  { grip: 'w', box: 'top-2 bottom-2 left-0 w-0.75', cursor: 'cursor-ew-resize' },
  { grip: 'e', box: 'top-2 right-0 bottom-2 w-0.75', cursor: 'cursor-ew-resize' },
];

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
  ],
  template: `
    <div *transloco="let t" class="relative flex h-full flex-col bg-panel">
      <!-- No resize strip: the console is a fixed 421 track, like the reference beside it and
           every tab inspector. -->
      @if (shown() && popped()) {
        <!-- The slot the viewer left behind says where it went, and holds its shape while it is
             away: at the viewer's own 16:9 the column keeps the same height whether the picture is
             docked or floating, so popping it out and back does not shove the console up and down
             the page. -->
        <div
          class="m-1.5 flex aspect-video flex-col items-center justify-center rounded-sm border border-dashed border-line-strong p-2 text-center"
        >
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
          <div class="flex h-(--nc-bar-h) items-center gap-1 border-b border-line px-1.5">
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
              <nc-icon name="pip" [size]="24" />
            </button>
          </div>
        }
        <!-- No inset while it is docked: the screen is the column's own content, and a gutter
             around it read as a second rule a pixel inside the column's. Floating, it is a window
             of its own and keeps its frame. -->
        <div
          #card
          [class]="popped() ? 'nc-pip' : ''"
          [style.left.px]="pip()?.x ?? null"
          [style.top.px]="pip()?.y ?? null"
          [style.right]="pip() ? 'auto' : null"
          [style.bottom]="pip() ? 'auto' : null"
          [style.width.px]="popped() ? ui.pipWidth() : null"
        >
          @if (popped()) {
            <!-- Drawn over the card's own edges rather than straddling them: the card clips its
                 overflow, so half of a grip hung outside would not be there to grab. -->
            @for (g of grips; track g.grip) {
              <span
                class="absolute z-10 {{ g.box }} {{ g.cursor }}"
                (pointerdown)="startResize($event, g.grip)"
              ></span>
            }
          }
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
      @if (shown()) {
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
              <nc-lcd variant="flush" class="h-full leading-[1.85] tracking-copy">
                @for (l of lines(); track l.id) {
                  <div
                    [class.text-hot]="l.level === 'error'"
                    [class.text-orange-ink]="l.level === 'warn'"
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
    /* The floating viewer: a card the design draws as a window, so it is one. It starts in the
       bottom-right corner the artboard puts it in, at the artboard's width, and stays wherever it
       is dragged and whatever size it is dragged to — the width is bound, not declared here. */
    .nc-pip {
      position: fixed;
      right: 22px;
      bottom: 22px;
      z-index: 40;
      overflow: hidden;
      border: 1px solid var(--nc-line-strong);
      border-radius: 4px;
      background: var(--nc-panel);
      box-shadow: 0 6px 0 var(--nc-inset);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsoleColumnComponent {
  protected readonly ui = inject(EditorUiStore);
  /** The viewer floats over the editor instead of sitting in the column. */
  protected readonly popped = computed(() => this.ui.consoleMode() === 'pip' && this.ui.pipOpen());
  /** Told rather than worked out: what shows in the track is the region's to decide, not a column's. */
  readonly shown = input(true);

  protected readonly screenHidden = computed(
    () => this.ui.columnMode() === 'swap' || (!this.popped() && this.ui.activeTab() !== 'code'),
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
  protected readonly grips = PIP_GRIPS;
  private readonly card = viewChild<ElementRef<HTMLElement>>('card');
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
    afterRenderEffect(() => {
      this.ui.viewportWidth();
      this.ui.viewportHeight();
      this.popped();
      this.clampToViewport();
    });
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
    const own = this.ui.pipWidth();
    return { x: Math.min(Math.max(0, at.x), Math.max(0, w - own)), y: Math.max(0, at.y) };
  });

  /**
   * Bring the card back inside the bound when the window shrinks under it.
   *
   * The width outlives the window it was chosen on — it is remembered across sessions — so a card
   * sized on a large screen would come back taking most of a small one, and no drag would be
   * needed to get it there.
   */
  private clampToViewport(): void {
    const el = this.card()?.nativeElement;
    if (!el || !untracked(this.popped)) return;
    const box = el.getBoundingClientRect();
    if (!box.width) return;
    const chrome = box.height - box.width / PIP_PICTURE_RATIO;
    const max = Math.round(this.maxWidth(chrome));
    if (untracked(this.ui.pipWidth) > max) this.ui.setPipWidth(Math.max(PIP_MIN_WIDTH, max));
  }

  /**
   * The widest the card may be, given how much of it is not the picture.
   *
   * `chrome` is the title bar plus the transport — a constant number of pixels, whatever the width
   * — and the picture between them keeps the viewer's ratio. So the area grows as
   * `chrome·w + w²/r`, and the bound is the positive root of that against a share of the window.
   * Measured rather than assembled from the bars' own heights: those live in the template beside
   * the picture, and a number copied out of them here would be wrong the first time one changed.
   */
  private maxWidth(chrome: number): number {
    const area = this.ui.viewportWidth() * this.ui.viewportHeight() * PIP_MAX_AREA_SHARE;
    const a = 1 / PIP_PICTURE_RATIO;
    return (-chrome + Math.sqrt(chrome * chrome + 4 * a * area)) / (2 * a);
  }

  /**
   * Resize from any edge or corner, keeping the ratio and holding the opposite side still.
   *
   * One drag decides one number — the width — as it does for the crop window in the profile
   * dialog; a vertical grip reads that number off the pointer's own axis, and the corner it is
   * anchored to is the one diagonally across from it, so the card grows the way the hand moves.
   */
  protected startResize(e: PointerEvent, grip: PipGrip): void {
    e.preventDefault();
    e.stopPropagation();
    const el = this.card()?.nativeElement;
    if (!el) return;
    const box = el.getBoundingClientRect();
    // Everything in the card that is not the picture, which stays that tall at any width.
    const chrome = box.height - box.width / PIP_PICTURE_RATIO;
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);

    // The card sits in the stylesheet's corner until it is placed. Place it now, so a grip that
    // holds the right or the bottom still is holding something this component owns.
    this.pipAt.set({ x: box.left, y: box.top });

    const west = grip === 'nw' || grip === 'w' || grip === 'sw';
    const north = grip === 'nw' || grip === 'n' || grip === 'ne';
    const vertical = grip === 'n' || grip === 's';
    const anchorX = west ? box.right : box.left;
    const anchorY = north ? box.bottom : box.top;

    const move = (ev: PointerEvent): void => {
      const reach = vertical
        ? north
          ? anchorY - ev.clientY
          : ev.clientY - anchorY
        : west
          ? anchorX - ev.clientX
          : ev.clientX - anchorX;
      const wanted = vertical ? (reach - chrome) * PIP_PICTURE_RATIO : reach;
      const w = Math.round(Math.min(Math.max(wanted, PIP_MIN_WIDTH), this.maxWidth(chrome)));
      this.ui.setPipWidth(w);
      this.pipAt.set({
        x: west ? anchorX - w : anchorX,
        y: north ? anchorY - (chrome + w / PIP_PICTURE_RATIO) : anchorY,
      });
    };
    const up = (): void => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }

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
