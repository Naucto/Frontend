import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  model,
  signal,
  TemplateRef,
} from '@angular/core';

import { ButtonDirective } from '../components/button.directive';
import { IconComponent } from '../components/icon.component';
import { MarkComponent } from '../components/mark.component';
import { NoticeComponent } from '../components/notice.component';
import { OptionDirective } from '../components/option.directive';
import { PopoverDirective } from '../components/popover.directive';
import { PopoverPanelComponent } from '../components/popover-panel.component';
import { type PresenceDot, PresenceDotsComponent } from '../components/presence-dots.component';
import { TAB_LOOKS } from '../components/tabs.component';
import { type IconName } from '../icons/glyphs';
import {
  baseLayout,
  dock,
  dockBack,
  type DockFloat,
  type DockLayout,
  type DockLeaf,
  type DockNode,
  type DockRect,
  type DockSide,
  type DockZone,
  fits,
  floatingWindows,
  focus,
  leaves,
  moveFloat,
  popOut,
  resize,
  visibleCount,
} from './dock-layout';

export interface DockWindow {
  id: string;
  title: string;
  icon: IconName;
  peers?: readonly PresenceDot[];
}

export interface DockLabels {
  popOut: (title: string) => string;
  dock: (title: string) => string;
  addTab: string;
  resize: string;
  fallback: string;
  reset: string;
  empty: string;
  openHere: string;
  floating: string;
  elsewhere: string;
  drop: Record<DockZone | `edge-${DockSide}`, string>;
}

@Directive({ selector: 'ng-template[ncDockPane]' })
export class DockPaneDirective {
  readonly ncDockPane = input.required<string>();
  readonly template = inject<TemplateRef<unknown>>(TemplateRef);
}

type Hover =
  | { kind: 'zone'; leafId: string | null; zone: DockZone; preview: DockRect; label: string }
  | { kind: 'edge'; side: DockSide; preview: DockRect; label: string }
  | { kind: 'tabs'; leafId: string; index: number; marker: DockRect };

interface Compass {
  x: number;
  y: number;
  onlyCenter: boolean;
  off: DockZone[];
}

type Drag =
  | {
      kind: 'tab';
      window: string;
      startX: number;
      startY: number;
      started: boolean;
      x: number;
      y: number;
      hover: Hover | null;
    }
  | {
      kind: 'float';
      window: string;
      offsetX: number;
      offsetY: number;
      hover: Hover | null;
      compass: Compass | null;
      edgesOff: DockSide[];
    }
  | { kind: 'split'; splitId: string; area: DOMRect; direction: 'row' | 'column' }
  | { kind: 'size'; window: string; startX: number; startY: number; from: DockFloat };

const SQUARE = 45;
const STEP = 54;
const REACH = 24;
const EDGE = 10;
const EDGE_SHARE = 0.35;
const DRAG_START = 8;
const TAB_BAND = { above: 20, below: 40, across: 400 };
const MARKER_W = 4;
const FLOAT_MIN = { width: 320, height: 220 };
const FLOAT_SIZE = { width: 620, height: 460 };

/** The drawing inside a drop target: the half, or the middle, a window would take. */
const GLYPH: Record<DockZone, string> = {
  left: 'h-full w-1/2',
  right: 'ml-auto h-full w-1/2',
  top: 'h-1/2 w-full',
  bottom: 'mt-[50%] h-1/2 w-full',
  tab: 'm-auto mt-[25%] h-1/2 w-1/2',
};

const OFFSETS: Record<DockZone, [number, number]> = {
  top: [0, -STEP],
  left: [-STEP, 0],
  tab: [0, 0],
  right: [STEP, 0],
  bottom: [0, STEP],
};

function part(rect: DockRect, side: DockSide, share: number): DockRect {
  switch (side) {
    case 'left':
      return { ...rect, width: rect.width * share };
    case 'right':
      return { ...rect, x: rect.x + rect.width * (1 - share), width: rect.width * share };
    case 'top':
      return { ...rect, height: rect.height * share };
    case 'bottom':
      return { ...rect, y: rect.y + rect.height * (1 - share), height: rect.height * share };
  }
}

const EDGE_SIDES: readonly DockSide[] = ['top', 'bottom', 'left', 'right'];
const COMPASS_ZONES: readonly DockZone[] = ['top', 'left', 'tab', 'right', 'bottom'];

@Component({
  selector: 'nc-dock-workspace',
  imports: [
    NgTemplateOutlet,
    ButtonDirective,
    IconComponent,
    MarkComponent,
    NoticeComponent,
    OptionDirective,
    PopoverDirective,
    PopoverPanelComponent,
    PresenceDotsComponent,
  ],
  templateUrl: './dock-workspace.component.html',
  host: { class: 'relative block h-full min-h-0 overflow-hidden isolate' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DockWorkspaceComponent {
  readonly windows = input.required<readonly DockWindow[]>();
  readonly layout = model.required<DockLayout>();
  readonly active = model<string | null>(null);
  readonly marked = input<readonly string[]>([]);
  readonly minSize = input({ width: 360, height: 280 });
  readonly labels = input.required<DockLabels>();

  private readonly panes = contentChildren(DockPaneDirective);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  protected readonly box = signal({ width: 0, height: 0 });
  protected readonly drag = signal<Drag | null>(null);

  private readonly order = computed(() => this.windows().map((window) => window.id));
  protected readonly fallback = computed(() => {
    const { width, height } = this.box();
    const layout = this.layout();

    return (
      width > 0 &&
      leaves(layout.root).length > 1 &&
      !fits(layout, { x: 0, y: 0, width, height }, this.minSize())
    );
  });
  protected readonly shown = computed<DockLayout>(() =>
    this.fallback() ? baseLayout(this.order(), this.active() ?? undefined) : this.layout(),
  );
  protected readonly floats = computed(() => {
    const layout = this.shown();

    return floatingWindows(layout).flatMap((id) => {
      const float = layout.floats[id];

      return float ? [{ id, float }] : [];
    });
  });
  protected readonly several = computed(() => visibleCount(this.shown()) > 1);
  protected readonly floatDrag = computed(() => {
    const drag = this.drag();

    return drag?.kind === 'float' ? drag : null;
  });
  protected readonly tabDrag = computed(() => {
    const drag = this.drag();

    return drag?.kind === 'tab' && drag.started ? drag : null;
  });
  protected readonly hover = computed(() => {
    const drag = this.drag();

    return drag?.kind === 'float' || drag?.kind === 'tab' ? drag.hover : null;
  });
  protected readonly tabLook = TAB_LOOKS.panel;
  protected readonly SQUARE = SQUARE;
  protected readonly STEP = STEP;
  protected readonly EDGE = EDGE;
  protected readonly EDGE_SIDES = EDGE_SIDES;
  protected readonly COMPASS_ZONES = COMPASS_ZONES;

  constructor() {
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) {
        this.box.set({ width: rect.width, height: rect.height });
      }
    });
    observer.observe(this.host.nativeElement);
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => {
      observer.disconnect();
      this.stopListening();
    });
  }

  protected windowOf(id: string): DockWindow | undefined {
    return this.windows().find((window) => window.id === id);
  }

  protected paneFor(id: string): TemplateRef<unknown> | null {
    return this.panes().find((pane) => pane.ncDockPane() === id)?.template ?? null;
  }

  protected isMarked(id: string): boolean {
    return this.marked().includes(id);
  }

  protected missingFrom(leaf: DockLeaf): DockWindow[] {
    return this.windows().filter((window) => !leaf.tabs.includes(window.id));
  }

  protected asLeaf(node: DockNode): DockLeaf | null {
    return node.kind === 'leaf' ? node : null;
  }

  protected select(window: string): void {
    this.active.set(window);
    if (!this.fallback()) {
      this.layout.update((layout) => focus(layout, window));
    }
  }

  protected bringHere(window: string, leafId: string): void {
    this.layout.update((layout) => dock(layout, window, leafId, 'tab'));
    this.active.set(window);
  }

  protected isFloating(window: string): boolean {
    return this.shown().floats[window] !== undefined;
  }

  protected resetLayout(): void {
    this.layout.set(baseLayout(this.order(), this.active() ?? undefined));
  }

  protected popOutWindow(window: string): void {
    const { width, height } = this.box();
    const rect = this.clamp({
      x: Math.round(width / 2 - FLOAT_SIZE.width / 2),
      y: 48,
      width: Math.min(FLOAT_SIZE.width, Math.round(width * 0.6)),
      height: Math.min(FLOAT_SIZE.height, Math.round(height * 0.7)),
    });
    this.layout.update((layout) => popOut(layout, window, rect));
    this.active.set(window);
  }

  protected dockWindow(window: string): void {
    this.layout.update((layout) => dockBack(layout, window));
    this.active.set(window);
  }

  protected onTabDown(event: PointerEvent, window: string): void {
    if (event.button !== 0) {
      return;
    }
    this.select(window);
    if (this.fallback()) {
      return;
    }
    this.drag.set({
      kind: 'tab',
      window,
      startX: event.clientX,
      startY: event.clientY,
      started: false,
      x: 0,
      y: 0,
      hover: null,
    });
    this.listen();
  }

  protected onGrabDown(event: PointerEvent, window: string): void {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) {
      return;
    }
    const float = this.shown().floats[window];
    if (!float) {
      return;
    }
    event.preventDefault();
    const origin = this.origin();
    this.select(window);
    this.startFloatDrag(
      window,
      event.clientX - origin.x - float.x,
      event.clientY - origin.y - float.y,
    );
  }

  protected onSizeDown(event: PointerEvent, window: string): void {
    const float = this.shown().floats[window];
    if (event.button !== 0 || !float) {
      return;
    }
    event.preventDefault();
    this.drag.set({
      kind: 'size',
      window,
      startX: event.clientX,
      startY: event.clientY,
      from: float,
    });
    this.listen();
  }

  protected onGutterDown(event: PointerEvent, splitId: string, direction: 'row' | 'column'): void {
    const area = (event.currentTarget as HTMLElement).parentElement?.getBoundingClientRect();
    if (event.button !== 0 || !area) {
      return;
    }
    event.preventDefault();
    this.drag.set({ kind: 'split', splitId, area, direction });
    this.listen();
  }

  protected edgeStyle(side: DockSide): Record<string, string> {
    const middle = `calc(50% - ${String(SQUARE / 2)}px)`;
    switch (side) {
      case 'top':
        return { top: `${String(EDGE)}px`, left: middle };
      case 'bottom':
        return { bottom: `${String(EDGE)}px`, left: middle };
      case 'left':
        return { left: `${String(EDGE)}px`, top: middle };
      case 'right':
        return { right: `${String(EDGE)}px`, top: middle };
    }
  }

  protected isHot(zone: DockZone | DockSide, edge: boolean): boolean {
    const hover = this.hover();
    if (!hover) {
      return false;
    }
    return edge
      ? hover.kind === 'edge' && hover.side === zone
      : hover.kind === 'zone' && hover.zone === zone;
  }

  protected glyph(zone: DockZone, hot: boolean): string {
    return `block ${GLYPH[zone]} ${hot ? 'bg-on-accent' : 'bg-ink-3'}`;
  }

  private startFloatDrag(window: string, offsetX: number, offsetY: number): void {
    this.drag.set({
      kind: 'float',
      window,
      offsetX,
      offsetY,
      hover: null,
      compass: null,
      edgesOff: [],
    });
    this.listen();
  }

  private origin(): DOMRect {
    return this.host.nativeElement.getBoundingClientRect();
  }

  private clamp(rect: DockRect): DockRect {
    const { width, height } = this.box();
    const fitWidth = Math.max(FLOAT_MIN.width, Math.min(rect.width, width - EDGE));
    const fitHeight = Math.max(FLOAT_MIN.height, Math.min(rect.height, height - EDGE));

    return {
      x: Math.max(0, Math.min(rect.x, width - 80)),
      y: Math.max(0, Math.min(rect.y, height - 48)),
      width: fitWidth,
      height: fitHeight,
    };
  }

  private local(rect: DOMRect): DockRect {
    const origin = this.origin();

    return { x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height };
  }

  private under(clientX: number, clientY: number): HTMLElement | null {
    const el = this.document.elementFromPoint(clientX, clientY);

    return el instanceof HTMLElement && this.host.nativeElement.contains(el) ? el : null;
  }

  private tabBarAt(clientX: number, clientY: number, window: string): Hover | null {
    const bar = this.under(clientX, clientY)?.closest<HTMLElement>('[data-dock-tabs]');
    const leafId = bar?.closest<HTMLElement>('[data-dock-leaf]')?.dataset.dockLeaf;
    if (!bar || !leafId) {
      return null;
    }
    const tabs = [...bar.querySelectorAll<HTMLElement>('[role="tab"]')]
      .filter((tab) => tab.dataset.dockTab !== window)
      .map((tab) => tab.getBoundingClientRect());
    const found = tabs.findIndex((rect) => clientX < rect.left + rect.width / 2);
    const index = found === -1 ? tabs.length : found;
    const barRect = bar.getBoundingClientRect();
    const next = tabs[index];
    const last = tabs[tabs.length - 1];
    const x = next ? next.left - MARKER_W / 2 : last ? last.right : barRect.left + 12;
    const marker = this.local(new DOMRect(x, barRect.top + 2, MARKER_W, barRect.height - 4));

    return { kind: 'tabs', leafId, index, marker };
  }

  private edgeAt(x: number, y: number, off: DockSide[]): Hover | null {
    const { width, height } = this.box();
    const whole = { x: 0, y: 0, width, height };
    const middleX = width / 2;
    const middleY = height / 2;
    const centres: Record<DockSide, [number, number]> = {
      top: [middleX, EDGE + SQUARE / 2],
      bottom: [middleX, height - EDGE - SQUARE / 2],
      left: [EDGE + SQUARE / 2, middleY],
      right: [width - EDGE - SQUARE / 2, middleY],
    };
    for (const side of EDGE_SIDES) {
      const [cx, cy] = centres[side];
      if (!off.includes(side) && Math.abs(x - cx) <= REACH && Math.abs(y - cy) <= REACH) {
        return {
          kind: 'edge',
          side,
          preview: part(whole, side, EDGE_SHARE),
          label: this.labels().drop[`edge-${side}`],
        };
      }
    }

    return null;
  }

  private compassAt(
    clientX: number,
    clientY: number,
  ): { compass: Compass | null; hover: Hover | null } {
    const origin = this.origin();
    const x = clientX - origin.x;
    const y = clientY - origin.y;
    const min = this.minSize();
    let area: DockRect;
    let leafId: string | null = null;
    let onlyCenter = false;
    if (this.shown().root) {
      const leaf = this.under(clientX, clientY)?.closest<HTMLElement>('[data-dock-leaf]');
      leafId = leaf?.dataset.dockLeaf ?? null;
      if (!leaf || !leafId) {
        return { compass: null, hover: null };
      }
      area = this.local(leaf.getBoundingClientRect());
    } else {
      area = { x: 0, y: 0, ...this.box() };
      onlyCenter = true;
    }
    const cx = area.x + area.width / 2;
    const cy = area.y + area.height / 2;
    const off = COMPASS_ZONES.filter(
      (zone) =>
        zone !== 'tab' &&
        (onlyCenter ||
          ((zone === 'left' || zone === 'right') && area.width / 2 < min.width) ||
          ((zone === 'top' || zone === 'bottom') && area.height / 2 < min.height)),
    );
    const compass: Compass = { x: cx, y: cy, onlyCenter, off };
    const zone = COMPASS_ZONES.find((candidate) => {
      const [dx, dy] = OFFSETS[candidate];
      return (
        !off.includes(candidate) &&
        Math.abs(x - (cx + dx)) <= REACH &&
        Math.abs(y - (cy + dy)) <= REACH
      );
    });
    if (!zone) {
      return { compass, hover: null };
    }
    const label = this.labels().drop[onlyCenter ? 'tab' : zone];

    return {
      compass,
      hover: {
        kind: 'zone',
        leafId,
        zone,
        preview: zone === 'tab' ? area : part(area, zone, 0.5),
        label,
      },
    };
  }

  private readonly onMove = (event: PointerEvent): void => {
    const drag = this.drag();
    if (!drag) {
      return;
    }
    const origin = this.origin();
    const x = event.clientX - origin.x;
    const y = event.clientY - origin.y;
    switch (drag.kind) {
      case 'tab': {
        if (
          !drag.started &&
          Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_START
        ) {
          return;
        }
        const bar = this.tabBarAt(event.clientX, event.clientY, drag.window);
        const inBand =
          event.clientY > drag.startY - TAB_BAND.above &&
          event.clientY < drag.startY + TAB_BAND.below &&
          Math.abs(event.clientX - drag.startX) < TAB_BAND.across;
        if (bar || inBand) {
          this.drag.set({ ...drag, started: true, x, y, hover: bar });
          return;
        }
        const width = Math.min(FLOAT_SIZE.width, Math.round(this.box().width * 0.6));
        const height = Math.min(FLOAT_SIZE.height, Math.round(this.box().height * 0.7));
        const rect = this.clamp({ x: x - 90, y: y - 20, width, height });
        this.layout.update((layout) => popOut(layout, drag.window, rect));
        this.startFloatDrag(drag.window, x - rect.x, y - rect.y);
        return;
      }
      case 'float': {
        const float = this.layout().floats[drag.window];
        if (float) {
          const rect = this.clamp({ ...float, x: x - drag.offsetX, y: y - drag.offsetY });
          this.layout.update((layout) => moveFloat(layout, drag.window, rect));
        }
        const { width, height } = this.box();
        const min = this.minSize();
        const edgesOff = EDGE_SIDES.filter((side) =>
          side === 'left' || side === 'right'
            ? width * EDGE_SHARE < min.width
            : height * EDGE_SHARE < min.height,
        );
        const edge = this.shown().root ? this.edgeAt(x, y, edgesOff) : null;
        const bar = edge ? null : this.tabBarAt(event.clientX, event.clientY, drag.window);
        if (edge || bar) {
          this.drag.set({ ...drag, hover: edge ?? bar, compass: null, edgesOff });
          return;
        }
        const { compass, hover } = this.compassAt(event.clientX, event.clientY);
        this.drag.set({ ...drag, hover, compass, edgesOff });
        return;
      }
      case 'split': {
        const row = drag.direction === 'row';
        const size = row ? drag.area.width : drag.area.height;
        const least = Math.min(0.5, (row ? this.minSize().width : this.minSize().height) / size);
        const ratio = row
          ? (event.clientX - drag.area.x) / drag.area.width
          : (event.clientY - drag.area.y) / drag.area.height;
        const kept = Math.max(least, Math.min(1 - least, ratio));
        this.layout.update((layout) => resize(layout, drag.splitId, kept));
        return;
      }
      case 'size': {
        const rect = this.clamp({
          ...drag.from,
          width: drag.from.width + event.clientX - drag.startX,
          height: drag.from.height + event.clientY - drag.startY,
        });
        this.layout.update((layout) => moveFloat(layout, drag.window, rect));
        return;
      }
    }
  };

  private readonly onUp = (): void => {
    const drag = this.drag();
    this.drag.set(null);
    this.stopListening();
    if ((drag?.kind !== 'float' && drag?.kind !== 'tab') || !drag.hover) {
      return;
    }
    const hover = drag.hover;
    const window = drag.window;
    const root = this.layout().root?.id ?? null;
    this.layout.update((layout) => {
      switch (hover.kind) {
        case 'tabs':
          return dock(layout, window, hover.leafId, 'tab', hover.index);
        case 'edge':
          return dock(layout, window, root, hover.side, undefined, EDGE_SHARE);
        case 'zone':
          return dock(layout, window, hover.leafId, hover.zone);
      }
    });
    this.active.set(window);
  };

  private listen(): void {
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  }

  private stopListening(): void {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
  }
}
