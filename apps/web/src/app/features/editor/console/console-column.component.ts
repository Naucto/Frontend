import type { ElementRef } from '@angular/core';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { STEP_MS } from '@naucto/engine';
import {
  ButtonDirective,
  IconComponent,
  LcdComponent,
  MarkComponent,
  type PerfBand,
  PerfGraphComponent,
  TabsComponent,
  ToggleComponent,
} from '@naucto/ui';

import { GameScreenComponent } from '../../../shared/game-screen/game-screen.component';
import { EditorRuntimeService } from '../state/editor-runtime.service';
import {
  EditorUiStore,
  PANEL_WIDTH,
  PIP_MAX_AREA_SHARE,
  PIP_MIN_WIDTH,
} from '../state/editor-ui.store';
import { WorkSessionService } from '../work-session/work-session.service';

/** The engine steps at a fixed rate and presents once per step, so this is the most a game shows. */
const TARGET_FPS = 1000 / STEP_MS;
/** Below this share of the target, steps are being dropped often enough to see. */
const FPS_WARN_SHARE = 0.9;
/** Below this share, the game runs at half speed or worse. */
const FPS_OVER_SHARE = 0.5;
/** CPU is one step's work as a share of the step's budget; past 100% the game falls behind. */
const CPU_WARN = 70;
const CPU_OVER = 90;

const FPS_BANDS: readonly PerfBand[] = [
  { from: Number.NEGATIVE_INFINITY, to: TARGET_FPS * FPS_OVER_SHARE, tone: 'over' },
  { from: TARGET_FPS * FPS_OVER_SHARE, to: TARGET_FPS * FPS_WARN_SHARE, tone: 'warn' },
  { from: TARGET_FPS * FPS_WARN_SHARE, to: Number.POSITIVE_INFINITY, tone: 'ok' },
];
const CPU_BANDS: readonly PerfBand[] = [
  { from: Number.NEGATIVE_INFINITY, to: CPU_WARN, tone: 'ok' },
  { from: CPU_WARN, to: CPU_OVER, tone: 'warn' },
  { from: CPU_OVER, to: Number.POSITIVE_INFINITY, tone: 'over' },
];

/** The viewer's own picture is 16:9, which is what makes the card's height follow its width. */
const PIP_PICTURE_RATIO = 16 / 9;

/** How far in from the window's edges the artboard draws the floating card. */
const PIP_INSET = 22;

/** Which edge or corner of the floating card a press took hold of. */
type PipGrip = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** Where each grip sits on the floating card, and the cursor it shows. */
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
    MarkComponent,
    LcdComponent,
    PerfGraphComponent,
    TabsComponent,
    ToggleComponent,
    GameScreenComponent,
  ],
  templateUrl: './console-column.component.html',
  host: { class: 'block' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsoleColumnComponent {
  protected readonly ui = inject(EditorUiStore);
  protected readonly popped = this.ui.pipOpen;
  /** Told rather than worked out: what shows in the track is the region's to decide, not a column's. */
  readonly shown = input(true);

  private readonly editorRuntime = inject(EditorRuntimeService);
  /** A tab has room for the screen in its own panel, and the screen stands there. */
  protected readonly lent = computed(() => this.editorRuntime.screenSlot() !== null);
  protected readonly screenHidden = computed(
    () =>
      this.ui.tooNarrow() ||
      this.ui.columnMode() === 'swap' ||
      (!this.popped() && !this.lent() && this.ui.activeTab() !== 'code'),
  );
  protected readonly session = inject(WorkSessionService);
  private readonly transloco = inject(TranslocoService);
  private readonly pipAt = signal<{ x: number; y: number } | null>(null);
  /** The title bar's height as drawn, which is the least of the card that must stay in reach. */
  private readonly grab = signal(0);
  protected readonly grips = PIP_GRIPS;
  protected readonly fpsBands = FPS_BANDS;
  protected readonly cpuBands = CPU_BANDS;
  /** A little over the target, so a steady game draws its line under the well's top edge. */
  protected readonly fpsMax = TARGET_FPS * 1.1;
  private readonly column = viewChild<ElementRef<HTMLElement>>('column');
  private readonly dock = viewChild<ElementRef<HTMLElement>>('dock');
  private readonly card = viewChild<ElementRef<HTMLElement>>('card');
  private readonly grabBar = viewChild<ElementRef<HTMLElement>>('grab');
  private readonly screen = viewChild<GameScreenComponent>('screen');
  protected readonly tabs = computed(() => [
    {
      value: 'console',
      label: this.transloco.translate('editor.console'),
      mark: 'prompt' as const,
      badge: this.errorCount() || undefined,
    },
    { value: 'perf', label: this.transloco.translate('editor.perf'), mark: 'chart' as const },
  ]);

  get runtime(): GameScreenComponent['runtime'] {
    const screen = this.screen();
    if (!screen) {
      throw new Error('screen not mounted');
    }
    return screen.runtime;
  }
  protected readonly lines = computed(() => this.screen()?.runtime.lines() ?? []);
  private readonly errorCount = computed(
    () => this.lines().filter((line) => line.level === 'error').length,
  );

  /**
   * Where the card sits while it floats. Clamped so a window that narrows or shortens cannot leave
   * the card off the side, or its title bar — the one handle that brings it back — off the bottom.
   */
  protected readonly pip = computed(() => {
    const at = this.pipAt();
    if (!at || !this.popped()) {
      return null;
    }
    const viewportWidth = this.ui.viewportWidth();
    const viewportHeight = this.ui.viewportHeight();
    const own = this.ui.pipWidth();
    return {
      x: Math.min(Math.max(0, at.x), Math.max(0, viewportWidth - own)),
      y: Math.min(Math.max(0, at.y), Math.max(0, viewportHeight - this.grab())),
    };
  });

  constructor() {
    afterRenderEffect(() => {
      this.ui.viewportWidth();
      this.ui.viewportHeight();
      this.popped();
      this.fitToViewport();
    });
    // The element is moved, not rendered a second time: a second screen would be a second game,
    // and unmounting this one drops its netplay session.
    effect(() => {
      const dock = this.dock()?.nativeElement;
      const column = this.column()?.nativeElement;
      if (!dock || !column) {
        return;
      }
      const slot = this.editorRuntime.screenSlot();
      if (slot) {
        slot.prepend(dock);
      } else {
        column.prepend(dock);
      }
    });
    let pausedByHiding = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const files = this.session.game.codeFiles;
    const onChange = (): void => {
      if (!this.ui.autoRun()) {
        return;
      }
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        const runtime = this.screen()?.runtime;
        if (!runtime) {
          return;
        }
        runtime.reload();
        if (this.screenHidden() && runtime.state() === 'running') {
          runtime.pause();
          pausedByHiding = true;
        }
      }, 400);
    };
    files.observeDeep(onChange);
    inject(DestroyRef).onDestroy(() => {
      files.unobserveDeep(onChange);
      if (timer) {
        clearTimeout(timer);
      }
    });
    // Reading the signal for the first time is the initial state, not somebody asking for
    // anything: treating it as a request would boot the game on entry.
    let autoRunSettled = false;
    effect(() => {
      const on = this.ui.autoRun();
      untracked(() => {
        if (!autoRunSettled) {
          autoRunSettled = true;
          return;
        }
        if (on) {
          this.screen()?.runtime.play();
        }
      });
    });
    // Paused while hidden and resumed only if the pause was ours; never stopped, because a stop
    // ends the netplay session.
    effect(() => {
      const hidden = this.screenHidden();
      untracked(() => {
        const runtime = this.screen()?.runtime;
        if (!runtime) {
          return;
        }
        if (hidden) {
          if (runtime.state() === 'running') {
            runtime.pause();
            pausedByHiding = true;
          }
          return;
        }
        if (pausedByHiding) {
          pausedByHiding = false;
          runtime.resume();
        }
      });
    });
  }

  /**
   * Keeps the floating card inside the window, and places it the first time it floats: after
   * render, because its height is measured, and clear of the right column, which holds a panel on
   * every tab.
   */
  private fitToViewport(): void {
    const el = this.card()?.nativeElement;
    if (!el || !untracked(this.popped)) {
      return;
    }
    const box = el.getBoundingClientRect();
    if (!box.width) {
      return;
    }
    const chrome = box.height - box.width / PIP_PICTURE_RATIO;
    const max = Math.round(this.maxWidth(chrome));
    const wanted = untracked(this.ui.pipWidth);
    const width = wanted > max ? Math.max(PIP_MIN_WIDTH, max) : wanted;
    if (width !== wanted) {
      this.ui.setPipWidth(width);
    }
    this.grab.set(this.grabBar()?.nativeElement.offsetHeight ?? 0);
    if (!untracked(this.pipAt)) {
      this.pipAt.set({
        x: untracked(this.ui.viewportWidth) - PANEL_WIDTH - PIP_INSET - width,
        y: untracked(this.ui.viewportHeight) - (chrome + width / PIP_PICTURE_RATIO) - PIP_INSET,
      });
    }
  }

  /** The widest the card may be, */
  private maxWidth(chrome: number): number {
    const area = this.ui.viewportWidth() * this.ui.viewportHeight() * PIP_MAX_AREA_SHARE;
    const inverseRatio = 1 / PIP_PICTURE_RATIO;
    return (-chrome + Math.sqrt(chrome * chrome + 4 * inverseRatio * area)) / (2 * inverseRatio);
  }

  /**
   * Follow a drag on one element until the pointer is let go, whichever way the pointer leaves it.
   *
   * The capture is what makes `pointerup` reach the element the press started on rather than
   * whatever happens to be under the pointer at the end.
   */
  private trackPointer(
    el: HTMLElement,
    event: PointerEvent,
    move: (ev: PointerEvent) => void,
  ): void {
    el.setPointerCapture(event.pointerId);
    const up = (): void => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  /**
   * Resizes from any edge or corner, keeping the ratio and holding the opposite corner still; a
   * vertical grip reads the width off the pointer's vertical travel.
   */
  protected startResize(event: PointerEvent, grip: PipGrip): void {
    event.preventDefault();
    event.stopPropagation();
    const el = this.card()?.nativeElement;
    if (!el) {
      return;
    }
    const box = el.getBoundingClientRect();
    // Everything in the card that is not the picture, which stays that tall at any width.
    const chrome = box.height - box.width / PIP_PICTURE_RATIO;
    const west = grip === 'nw' || grip === 'w' || grip === 'sw';
    const north = grip === 'nw' || grip === 'n' || grip === 'ne';
    const vertical = grip === 'n' || grip === 's';
    const anchorX = west ? box.right : box.left;
    const anchorY = north ? box.bottom : box.top;

    this.trackPointer(event.currentTarget as HTMLElement, event, (ev) => {
      const reach = vertical
        ? north
          ? anchorY - ev.clientY
          : ev.clientY - anchorY
        : west
          ? anchorX - ev.clientX
          : ev.clientX - anchorX;
      const wanted = vertical ? (reach - chrome) * PIP_PICTURE_RATIO : reach;
      const width = Math.round(Math.min(Math.max(wanted, PIP_MIN_WIDTH), this.maxWidth(chrome)));
      this.ui.setPipWidth(width);
      this.pipAt.set({
        x: west ? anchorX - width : anchorX,
        y: north ? anchorY - (chrome + width / PIP_PICTURE_RATIO) : anchorY,
      });
    });
  }

  /** Drag the card by its title bar. Buttons in the bar keep their own clicks. */
  protected startDrag(event: PointerEvent): void {
    if ((event.target as HTMLElement).closest('button')) {
      return;
    }
    event.preventDefault();
    const bar = event.currentTarget as HTMLElement;
    const card = bar.parentElement;
    if (!card) {
      return;
    }
    const box = card.getBoundingClientRect();
    const dx = event.clientX - box.left;
    const dy = event.clientY - box.top;
    this.trackPointer(bar, event, (ev) => {
      this.pipAt.set({ x: ev.clientX - dx, y: ev.clientY - dy });
    });
  }

  protected onMounted(): void {
    const screen = this.screen();
    if (!screen) {
      return;
    }
    this.editorRuntime.host.set(screen.runtime);
    this.editorRuntime.bridge.set(screen.netBridge);
  }

  protected setTab(tab: string | undefined): void {
    if (tab === 'console' || tab === 'perf') {
      this.ui.setConsoleTab(tab);
    }
  }
}
