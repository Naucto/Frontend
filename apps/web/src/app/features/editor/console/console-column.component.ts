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
import { GameScreenComponent } from '@app/shared/game-screen/game-screen.component';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
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
  PANEL_WIDTH,
  PIP_MAX_AREA_SHARE,
  PIP_MIN_WIDTH,
} from '../state/editor-ui.store';
import { WorkSessionService } from '../work-session/work-session.service';

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
    LcdComponent,
    TabsComponent,
    ToggleComponent,
    GameScreenComponent,
  ],
  templateUrl: './console-column.component.html',
  host: { class: 'block' },
  styles: `
    /* The floating viewer; its position and width are bound in the template. */
    .nc-pip {
      position: fixed;
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
  protected readonly popped = this.ui.pipOpen;
  /** Told rather than worked out: what shows in the track is the region's to decide, not a column's. */
  readonly shown = input(true);

  protected readonly screenHidden = computed(
    () =>
      this.ui.tooNarrow() ||
      this.ui.columnMode() === 'swap' ||
      (!this.popped() && this.ui.activeTab() !== 'code'),
  );
  /** How many screen pixels one console pixel takes. The column is a fixed track, so this is too. */
  protected readonly scale = computed(() => {
    const inner = CONSOLE_WIDTH - 24;
    return Math.max(1, Math.round((inner / 320) * 10) / 10);
  });
  protected readonly session = inject(WorkSessionService);
  private readonly editorRuntime = inject(EditorRuntimeService);
  private readonly transloco = inject(TranslocoService);
  private readonly pipAt = signal<{ x: number; y: number } | null>(null);
  /** The title bar's height as drawn, which is the least of the card that must stay in reach. */
  private readonly grab = signal(0);
  protected readonly grips = PIP_GRIPS;
  private readonly card = viewChild<ElementRef<HTMLElement>>('card');
  private readonly grabBar = viewChild<ElementRef<HTMLElement>>('grab');
  private readonly screen = viewChild<GameScreenComponent>('screen');
  protected readonly tabs = computed(() => [
    {
      value: 'console',
      label: this.transloco.translate('editor.console'),
      icon: 'command' as const,
      badge: this.errorCount() || undefined,
    },
    { value: 'perf', label: this.transloco.translate('editor.perf'), icon: 'chart' as const },
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
  protected readonly players = computed(() => {
    const bridge = this.editorRuntime.bridge();
    const session = bridge?.session();
    const info = bridge?.info();
    if (!bridge || !session || !info) return '—';
    const others = bridge.peers().filter((p) => p !== session.selfUserId).length;
    return `${String(others + 1)} / ${String(info.maxPlayers)}`;
  });

  /**
   * Where the card sits while it floats. Clamped so a window that narrows or shortens cannot leave
   * the card off the side, or its title bar — the one handle that brings it back — off the bottom.
   */
  protected readonly pip = computed(() => {
    const at = this.pipAt();
    if (!at || !this.popped()) return null;
    const w = this.ui.viewportWidth();
    const h = this.ui.viewportHeight();
    const own = this.ui.pipWidth();
    return {
      x: Math.min(Math.max(0, at.x), Math.max(0, w - own)),
      y: Math.min(Math.max(0, at.y), Math.max(0, h - this.grab())),
    };
  });

  constructor() {
    afterRenderEffect(() => {
      this.ui.viewportWidth();
      this.ui.viewportHeight();
      this.popped();
      this.fitToViewport();
    });
    let pausedByHiding = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const files = this.session.game.codeFiles;
    const onChange = (): void => {
      if (!this.ui.autoRun()) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const runtime = this.screen()?.runtime;
        if (!runtime) return;
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
      if (timer) clearTimeout(timer);
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
        if (on) this.screen()?.runtime.play();
      });
    });
    // Paused while hidden and resumed only if the pause was ours; never stopped, because a stop
    // ends the netplay session.
    effect(() => {
      const hidden = this.screenHidden();
      untracked(() => {
        const runtime = this.screen()?.runtime;
        if (!runtime) return;
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
    if (!el || !untracked(this.popped)) return;
    const box = el.getBoundingClientRect();
    if (!box.width) return;
    const chrome = box.height - box.width / PIP_PICTURE_RATIO;
    const max = Math.round(this.maxWidth(chrome));
    const wanted = untracked(this.ui.pipWidth);
    const w = wanted > max ? Math.max(PIP_MIN_WIDTH, max) : wanted;
    if (w !== wanted) this.ui.setPipWidth(w);
    this.grab.set(this.grabBar()?.nativeElement.offsetHeight ?? 0);
    if (!untracked(this.pipAt)) {
      this.pipAt.set({
        x: untracked(this.ui.viewportWidth) - PANEL_WIDTH - PIP_INSET - w,
        y: untracked(this.ui.viewportHeight) - (chrome + w / PIP_PICTURE_RATIO) - PIP_INSET,
      });
    }
  }

  /** The widest the card may be, */
  private maxWidth(chrome: number): number {
    const area = this.ui.viewportWidth() * this.ui.viewportHeight() * PIP_MAX_AREA_SHARE;
    const a = 1 / PIP_PICTURE_RATIO;
    return (-chrome + Math.sqrt(chrome * chrome + 4 * a * area)) / (2 * a);
  }

  /**
   * Follow a drag on one element until the pointer is let go, whichever way the pointer leaves it.
   *
   * The capture is what makes `pointerup` reach the element the press started on rather than
   * whatever happens to be under the pointer at the end.
   */
  private trackPointer(el: HTMLElement, e: PointerEvent, move: (ev: PointerEvent) => void): void {
    el.setPointerCapture(e.pointerId);
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
  protected startResize(e: PointerEvent, grip: PipGrip): void {
    e.preventDefault();
    e.stopPropagation();
    const el = this.card()?.nativeElement;
    if (!el) return;
    const box = el.getBoundingClientRect();
    // Everything in the card that is not the picture, which stays that tall at any width.
    const chrome = box.height - box.width / PIP_PICTURE_RATIO;
    const west = grip === 'nw' || grip === 'w' || grip === 'sw';
    const north = grip === 'nw' || grip === 'n' || grip === 'ne';
    const vertical = grip === 'n' || grip === 's';
    const anchorX = west ? box.right : box.left;
    const anchorY = north ? box.bottom : box.top;

    this.trackPointer(e.currentTarget as HTMLElement, e, (ev) => {
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
    });
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
    this.trackPointer(bar, e, (ev) => {
      this.pipAt.set({ x: ev.clientX - dx, y: ev.clientY - dy });
    });
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
