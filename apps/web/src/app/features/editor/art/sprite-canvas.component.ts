import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ThemeService } from '@app/core/theme/theme.service';
import { geometrySignal } from '@app/shared/pixel/geometry.signal';
import {
  checkerboard,
  ellipsePoints,
  floodFill,
  linePoints,
  type Pt,
  rectPoints,
} from '@app/shared/pixel/pixel-tools';
import { type SheetPainter } from '@app/shared/pixel/sheet-painter';
import { DEFAULT_GEOMETRY, FIRST_SHEET_ID, type Game, SPRITE_SIZE } from '@naucto/engine';
import {
  DragPanDirective,
  PresenceLayerComponent,
  type PresenceMark,
  type PresenceViewport,
} from '@naucto/ui';
import type * as Y from 'yjs';

import { type Clip } from '../state/clipboard.store';
import { type Collaborator } from '../work-session/work-session.service';
import { type ArtTool, type PixelRect, type SpriteRect } from './art.store';

/**
 * Screen pixels per art pixel, at the ends. The whole sheet is drawn at once rather than the part
 * on screen, so the ceiling is set by what a canvas that large costs, not by how far into a sprite
 * anybody would want to go.
 */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 64;

/**
 * One press of a magnifier: a quarter more or less, landing on a whole scale.
 *
 * Whole, because that is where nothing is resampled and the art is at its crispest — the buttons
 * are how you get back to a clean multiple, and the track is how you get everywhere else. Each
 * direction rounds towards where it started, so one press each way is a round trip.
 *
 * The floor of one whole step is not tidiness: a quarter more than a small scale rounds back onto
 * itself, which would leave the buttons dead at the bottom of the range.
 */
export function stepZoom(scale: number, delta: number, min = MIN_ZOOM, max = MAX_ZOOM): number {
  const next =
    delta > 0
      ? Math.max(Math.floor(scale * 1.25), Math.floor(scale) + 1)
      : Math.min(Math.ceil(scale / 1.25), Math.ceil(scale) - 1);
  return Math.max(min, Math.min(max, next));
}

/**
 * How far a tool may reach: the region while the lock holds, the whole sheet once it is off.
 *
 * The sheet's two dimensions are both given because they are no longer the same number.
 */
export function toolBounds(
  region: SpriteRect,
  clip: boolean,
  sheetWidth: number,
  sheetHeight: number,
): PixelRect {
  if (!clip) return { x: 0, y: 0, w: sheetWidth, h: sheetHeight };
  return {
    x: region.x * SPRITE_SIZE,
    y: region.y * SPRITE_SIZE,
    w: region.w * SPRITE_SIZE,
    h: region.h * SPRITE_SIZE,
  };
}

export function withinBounds(b: PixelRect, p: Pt): boolean {
  return p.x >= b.x && p.y >= b.y && p.x < b.x + b.w && p.y < b.y + b.h;
}

interface Drag {
  tool: ArtTool;
  start: Pt;
  last: Pt;
  colour: number;
  /** For MOVE: the lifted pixels and where they came from. */
  lifted?: { rect: PixelRect; pixels: Uint8Array };
  /** MOVE, on a pasted layer: the drag carries the layer, and the sheet under it is untouched. */
  carrying?: boolean;
}

/**
 * The whole sheet, zoomed and scrolled, with the worked-on region marked on it.
 *
 * The canvas shows everything; the region says what the flags, the preview and the onion refer to,
 * and — while `clip` holds — how far a tool may reach. Panning is the host's own scrollbars: the
 * content is the sheet at its full drawn size, so there is no second scrolling model to keep in
 * step with the first.
 */
@Component({
  selector: 'nc-sprite-canvas',
  imports: [PresenceLayerComponent],
  template: `
    <div #wrap class="relative m-auto">
      <canvas
        #canvas
        class="block cursor-crosshair touch-none"
        [attr.aria-label]="label()"
        role="img"
        (pointerdown)="onDown($event)"
        (pointermove)="onMove($event)"
        (pointerup)="onUp($event)"
        (pointercancel)="onUp($event)"
        (pointerleave)="onLeave()"
        (contextmenu)="$event.preventDefault()"
      ></canvas>
      <!-- Clipped to the drawn surface: a chip is half a chip wide past the point it marks, and
           an absolute child hanging over the edge is scrollable overflow — which showed up as
           scrollbars on a cropped canvas that fits its frame. -->
      <div class="pointer-events-none absolute inset-0 overflow-hidden">
        <nc-presence-layer [marks]="marks()" [viewport]="viewPx()" />
      </div>
    </div>
  `,
  // `m-auto` on the content rather than `justify-center` on the host: centring a flex child that
  // overflows its container makes the overflowing start unreachable by scrolling, which at any
  // zoom past the fit is most of the sheet.
  hostDirectives: [DragPanDirective],
  host: {
    class: 'flex overflow-auto',
    tabindex: '0',
    '(wheel)': 'onWheel($event)',
    '(scroll)': 'measure()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpriteCanvasComponent {
  readonly game = input.required<Game>();
  /** Every pixel read and written below goes to this sheet. */
  readonly sheetId = input(FIRST_SHEET_ID);
  readonly painter = input.required<SheetPainter>();
  /** The cells being worked on, in whole 8×8 units. */
  readonly region = input.required<SpriteRect>();
  /** Whether a tool stops at the region's edge or may paint anywhere on the sheet. */
  readonly clip = input(true, { transform: booleanAttribute });
  readonly crop = input(false, { transform: booleanAttribute });
  readonly tool = input<ArtTool>('pen');
  readonly colour = input(4);
  readonly grid = input(true);
  readonly onion = input(false);
  /** In sheet pixels, like everything else the tools speak. */
  readonly selection = model<PixelRect | null>(null);
  readonly collaborators = input<readonly Collaborator[]>([]);
  /**
   * The manager the tab owns, so settling a paste is its own step.
   *
   * Settling happens on the press that starts the next stroke, and a stroke landing in the same
   * breath would otherwise be undone together with the paste it was drawn over.
   */
  readonly undo = input<Y.UndoManager | null>(null);
  readonly label = input('Sprite canvas');
  /** Pointer cell in sheet coordinates, null when outside. */
  readonly hover = output<Pt | null>();
  /**
   * Where the pointer actually is, in fractional sheet cells.
   *
   * `hover` is snapped to whole cells because that is the pixel you are about to paint. A cursor
   * shown to somebody else wants the opposite: at a high zoom one cell is a hundred screen pixels,
   * so a snapped position makes a peer's cursor jump across the canvas in visible steps.
   */
  readonly pointer = output<{ x: number; y: number } | null>();
  readonly pick = output<number>();
  readonly zoom = model(1);
  /** A paste has been placed and wants the tool that can move it. */
  readonly pasted = output();

  /** What of the sheet is on screen, in fractional cells — for whatever draws a map of it. */
  readonly view = signal<SpriteRect>({
    x: 0,
    y: 0,
    w: DEFAULT_GEOMETRY.spritesPerRow,
    h: DEFAULT_GEOMETRY.spriteRows,
  });

  /**
   * A pasted clip, placed but not written.
   *
   * While it exists the sheet is exactly as it was, so backing out costs nothing and the pixels it
   * covers are still there underneath. It becomes part of the drawing only when it is settled.
   */
  private readonly floating = signal<{ rect: PixelRect; cells: Uint8Array } | null>(null);

  zoomBy(delta: number): void {
    this.setZoom(stepZoom(this.scale(), delta));
  }

  setZoom(scale: number): void {
    this.holdCentre();
    this.userScale.set(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale)));
  }

  /** Scrolls so the given sheet cell is centred. */
  scrollToCell(x: number, y: number): void {
    const el = this.host.nativeElement;
    const s = this.scale();
    el.scrollTo({
      left: (x + 0.5) * SPRITE_SIZE * s - el.clientWidth / 2,
      top: (y + 0.5) * SPRITE_SIZE * s - el.clientHeight / 2,
    });
  }

  /** Back to fitting the sheet, and back to following it when the panel resizes. */
  resetZoom(): void {
    this.holdCentre();
    this.userScale.set(null);
  }

  /**
   * Remembers what is in the middle of the well, for the next draw to put back there.
   *
   * The content scales about its own origin, so offsets left alone hold the top-left corner and
   * nothing else. Read here rather than after, because it means nothing at the new scale.
   */
  private holdCentre(): void {
    const el = this.host.nativeElement;
    const s = this.scale();
    this.centre = {
      x: (el.scrollLeft + el.clientWidth / 2) / s,
      y: (el.scrollTop + el.clientHeight / 2) / s,
    };
  }

  /** Scrolling is the wheel's; zooming asks for the modifier the browser reserves for it. */
  protected onWheel(e: WheelEvent): void {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    this.zoomBy(e.deltaY < 0 ? 1 : -1);
  }

  /** Consumed by the draw that follows a scale change, once the content has its new size. */
  private centre: { x: number; y: number } | null = null;

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly wrap = viewChild.required<ElementRef<HTMLElement>>('wrap');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly theme = inject(ThemeService);
  /** The well, as the ResizeObserver last measured it. */
  private readonly well = signal({ w: 0, h: 0 });
  /** What the whole sheet would take to fill the well. Whole pixels only. */
  private readonly fitScale = computed(() => {
    const { w, h } = this.well();
    if (!w || !h) return 4;
    const r = this.regionPx();
    const subject = this.crop() ? Math.max(r.w, r.h) : Math.max(this.pxW(), this.pxH());
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.floor((Math.min(w, h) - 16) / subject)));
  });
  /**
   * Null until somebody zooms, and from then on theirs. Because the sheet is the whole subject,
   * this number means one thing at all times — it used to divide by the sprite-block size, so the
   * same picture on screen read ×85 at one block size and ×10 at another.
   */
  private readonly userScale = signal<number | null>(null);
  private readonly scale = computed(() => this.userScale() ?? this.fitScale());
  private readonly hoverCell = signal<Pt | null>(null);
  private readonly preview = signal<Pt[] | null>(null);
  private readonly moveOffset = signal<Pt | null>(null);
  private drag: Drag | null = null;
  private raf = 0;

  private readonly geometry = geometrySignal(this.game);
  /**
   * The sheet in hand.
   *
   * Resolved per use rather than held: the projection is rebuilt whenever the collection changes,
   * and a stale one would point at a pixel buffer that has been replaced.
   */
  protected readonly sheet = computed(() => {
    this.geometry();
    const id = this.sheetId();
    const sheets = this.game().sheets;
    return sheets.find((s) => s.id === id) ?? sheets[0];
  });
  /** The sheet in pixels. Two of them, because a sheet is no longer square by construction. */
  protected readonly pxW = computed(() => this.sheet()?.width ?? this.geometry().sheetWidth);
  protected readonly pxH = computed(() => this.sheet()?.height ?? this.geometry().sheetHeight);
  /** The region in sheet pixels: what the tools are held to, and what is outlined on the canvas. */
  private readonly regionPx = computed<PixelRect>(() => {
    const r = this.region();
    return {
      x: r.x * SPRITE_SIZE,
      y: r.y * SPRITE_SIZE,
      w: r.w * SPRITE_SIZE,
      h: r.h * SPRITE_SIZE,
    };
  });
  // A drag that leaves the canvas still lands on the sheet, so cropping has to confine the tools
  // as well as the view. The smaller canvas alone does not.
  private readonly bounds = computed(() =>
    toolBounds(this.region(), this.clip() || this.crop(), this.pxW(), this.pxH()),
  );
  /**
   * Where the drawn surface starts, in drawn pixels. Cropped, the canvas holds the region alone
   * and takes the region's corner as its own origin, so anything laid over it in sheet
   * coordinates has to come back to that corner before it means anything.
   */
  private readonly originPx = computed(() => {
    const s = this.scale();
    const r = this.crop() ? this.regionPx() : { x: 0, y: 0 };
    return { x: r.x * s, y: r.y * s };
  });
  protected readonly marks = computed<PresenceMark[]>(() => {
    const s = this.scale();
    const o = this.originPx();
    return this.collaborators()
      .filter((c) => !c.isSelf && c.cursor?.tab === 'art')
      .map((c) => ({
        id: c.clientId,
        name: c.name,
        colour: c.colour,
        x: (c.cursor?.x ?? 0) * s - o.x,
        y: (c.cursor?.y ?? 0) * s - o.y,
      }));
  });
  /** The same frame `view` reports, in the drawn pixels the marks are placed in. */
  protected readonly viewPx = computed<PresenceViewport>(() => {
    const v = this.view();
    const o = this.originPx();
    const k = SPRITE_SIZE * this.scale();
    return { x: v.x * k - o.x, y: v.y * k - o.y, w: v.w * k, h: v.h * k };
  });

  constructor() {
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      this.well.set({ w: r.width, h: r.height });
      this.measure();
    });
    ro.observe(this.host.nativeElement);
    inject(DestroyRef).onDestroy(() => {
      ro.disconnect();
      cancelAnimationFrame(this.raf);
    });
    effect(() => {
      this.zoom.set(this.scale());
    });
    /**
     * A placed paste settles when attention moves off it — another tool, another region.
     *
     * The layer is read untracked, because placing one must not settle it in the same breath; and
     * the region is compared rather than merely watched, because the effect re-runs for the tool
     * too and only an actual change of region means the layer has been left behind.
     */
    let lastRegion: SpriteRect | undefined;
    effect(() => {
      const movable = this.tool() === 'move';
      const region = this.region();
      untracked(() => {
        const leftBehind = lastRegion !== undefined && region !== lastRegion;
        lastRegion = region;
        if (!movable || leftBehind) this.settleFloating();
      });
    });
    // Picking a region off screen — in the sheet map, or with the arrow keys — has to bring it back
    // into view, or the pick silently does nothing you can see.
    effect(() => {
      const r = this.regionPx();
      const s = this.scale();
      untracked(() => {
        this.reveal(r, s);
      });
    });
    effect(() => {
      this.painter().version();
      this.region();
      this.crop();
      this.clip();
      this.grid();
      this.onion();
      this.selection();
      this.scale();
      this.hoverCell();
      this.preview();
      this.moveOffset();
      this.colour();
      // Colours are read from CSS custom properties at paint time; repaint when the theme flips.
      this.theme.effective();
      untracked(() => {
        this.requestRedraw();
      });
    });
  }

  /**
   * Publishes what is on screen, in sheet cells.
   *
   * Cropped, the canvas holds the region rather than the sheet: what it scrolls over is that much
   * smaller and starts at the region's own corner. Measured against the sheet either way, the
   * rectangle handed to the sheet map described a place on it nobody was looking at.
   */
  measure(): void {
    const el = this.host.nativeElement;
    const s = this.scale();
    const cropped = this.crop();
    const r = this.regionPx();
    const content = cropped ? r : { x: 0, y: 0, w: this.pxW(), h: this.pxH() };
    const span = (client: number, scroll: number, size: number): [number, number] =>
      size * s <= client ? [0, size] : [scroll / s, client / s];
    const [x, w] = span(el.clientWidth, el.scrollLeft, content.w);
    const [y, h] = span(el.clientHeight, el.scrollTop, content.h);
    this.view.set({
      x: (content.x + x) / SPRITE_SIZE,
      y: (content.y + y) / SPRITE_SIZE,
      w: w / SPRITE_SIZE,
      h: h / SPRITE_SIZE,
    });
  }

  private reveal(r: PixelRect, s: number): void {
    const el = this.host.nativeElement;
    if (this.pxW() * s <= el.clientWidth && this.pxH() * s <= el.clientHeight) return;
    const axis = (start: number, size: number, scroll: number, client: number): number => {
      const a = start * s;
      const b = (start + size) * s;
      if (a < scroll) return a - 8;
      if (b > scroll + client) return b - client + 8;
      return scroll;
    };
    el.scrollTo({
      left: axis(r.x, r.w, el.scrollLeft, el.clientWidth),
      top: axis(r.y, r.h, el.scrollTop, el.clientHeight),
      behavior: 'smooth',
    });
  }

  // ---- pointer --------------------------------------------------------------

  private cellOf(e: PointerEvent): Pt {
    const p = this.pointOf(e);
    return {
      x: Math.max(0, Math.min(this.pxW() - 1, Math.floor(p.x))),
      y: Math.max(0, Math.min(this.pxH() - 1, Math.floor(p.y))),
    };
  }

  /** The same position, unsnapped. */
  /** Sheet coordinates, whatever the view is showing: cropped, its own origin is the region's. */
  private pointOf(e: PointerEvent): { x: number; y: number } {
    const box = this.canvas().nativeElement.getBoundingClientRect();
    const s = this.scale();
    const origin = this.crop() ? this.regionPx() : { x: 0, y: 0 };
    return {
      x: origin.x + (e.clientX - box.left) / s,
      y: origin.y + (e.clientY - box.top) / s,
    };
  }

  private inBounds(p: Pt): boolean {
    return withinBounds(this.bounds(), p);
  }

  private paint(points: readonly Pt[], colour: number): void {
    this.game().transact(() => {
      for (const p of points) if (this.inBounds(p)) this.sheet()?.setPixel(p.x, p.y, colour);
    });
  }

  protected onDown(e: PointerEvent): void {
    if (e.button !== 0 && e.button !== 2) return;
    this.host.nativeElement.focus({ preventScroll: true });
    const cell = this.cellOf(e);
    // A press outside what the tools may touch is not the start of a stroke — silently clamping it
    // to the nearest legal pixel would paint somewhere nobody aimed.
    if (!this.inBounds(cell)) return;
    this.canvas().nativeElement.setPointerCapture(e.pointerId);
    const colour = e.button === 2 ? 0 : this.colour();
    const tool = this.tool();
    const layer = this.floating();
    if (layer && tool === 'move' && withinBounds(layer.rect, cell)) {
      this.drag = { tool, start: cell, last: cell, colour, carrying: true };
      this.moveOffset.set({ x: 0, y: 0 });
      return;
    }
    // Anything else is done with the layer: a press elsewhere settles it rather than losing it.
    this.settleFloating();
    this.drag = { tool, start: cell, last: cell, colour };
    switch (tool) {
      case 'pen':
        this.paint([cell], colour);
        break;
      case 'fill': {
        const b = this.bounds();
        this.paint(
          floodFill(
            (x, y) => this.sheet()?.getPixel(b.x + x, b.y + y) ?? 0,
            { x: cell.x - b.x, y: cell.y - b.y },
            b.w,
            b.h,
          ).map((p) => ({ x: p.x + b.x, y: p.y + b.y })),
          colour,
        );
        this.drag = null;
        break;
      }
      case 'eyedropper':
        this.pick.emit(this.sheet()?.getPixel(cell.x, cell.y) ?? 0);
        this.drag = null;
        break;
      case 'move': {
        const rect = this.selection() ?? this.bounds();
        const pixels = new Uint8Array(rect.w * rect.h);
        for (let y = 0; y < rect.h; y++)
          for (let x = 0; x < rect.w; x++)
            pixels[y * rect.w + x] = this.sheet()?.getPixel(rect.x + x, rect.y + y) ?? 0;
        this.drag.lifted = { rect, pixels };
        this.moveOffset.set({ x: 0, y: 0 });
        break;
      }
      case 'select':
        this.selection.set(null);
        break;
      default:
        this.preview.set([cell]);
    }
  }

  protected onMove(e: PointerEvent): void {
    const cell = this.cellOf(e);
    this.hoverCell.set(cell);
    this.hover.emit(cell);
    const pt = this.pointOf(e);
    this.pointer.emit(pt);
    const d = this.drag;
    if (!d) return;
    if (cell.x === d.last.x && cell.y === d.last.y) return;
    switch (d.tool) {
      case 'pen':
        this.paint(linePoints(d.last, cell), d.colour);
        break;
      case 'line':
        this.preview.set(linePoints(d.start, cell));
        break;
      case 'rect':
        this.preview.set(rectPoints(d.start, cell));
        break;
      case 'circle':
        this.preview.set(ellipsePoints(d.start, cell));
        break;
      case 'select':
        this.selection.set(clampRect(normalise(d.start, cell), this.bounds()));
        break;
      case 'move':
        this.moveOffset.set({ x: cell.x - d.start.x, y: cell.y - d.start.y });
        break;
      default:
        break;
    }
    d.last = cell;
  }

  protected onUp(e: PointerEvent): void {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const cell = this.cellOf(e);
    const preview = this.preview();
    this.preview.set(null);
    if (d.tool === 'line' || d.tool === 'rect' || d.tool === 'circle') {
      if (preview) this.paint(preview, d.colour);
      return;
    }
    if (d.carrying) {
      const layer = this.floating();
      this.moveOffset.set(null);
      if (!layer) return;
      const off = { x: cell.x - d.start.x, y: cell.y - d.start.y };
      const rect = clampRect(
        { ...layer.rect, x: layer.rect.x + off.x, y: layer.rect.y + off.y },
        this.bounds(),
      );
      this.floating.set({ ...layer, rect });
      this.selection.set(rect);
      return;
    }
    if (d.tool === 'move' && d.lifted) {
      const off = { x: cell.x - d.start.x, y: cell.y - d.start.y };
      this.moveOffset.set(null);
      if (off.x === 0 && off.y === 0) return;
      const { rect, pixels } = d.lifted;
      this.game().transact(() => {
        for (let y = 0; y < rect.h; y++)
          for (let x = 0; x < rect.w; x++) this.sheet()?.setPixel(rect.x + x, rect.y + y, 0);
        for (let y = 0; y < rect.h; y++)
          for (let x = 0; x < rect.w; x++) {
            const p = { x: rect.x + x + off.x, y: rect.y + y + off.y };
            if (this.inBounds(p)) this.sheet()?.setPixel(p.x, p.y, pixels[y * rect.w + x] ?? 0);
          }
      });
      if (this.selection()) this.selection.set({ ...rect, x: rect.x + off.x, y: rect.y + off.y });
    }
  }

  protected onLeave(): void {
    this.hoverCell.set(null);
    this.hover.emit(null);
    this.pointer.emit(null);
  }

  /** Falls back to what a tool may reach, so copying the sprite in hand needs no selection. */
  copySelection(): Clip {
    const rect = this.selection() ?? this.bounds();
    const cells = new Uint8Array(rect.w * rect.h);
    const game = this.game();
    for (let y = 0; y < rect.h; y++)
      for (let x = 0; x < rect.w; x++)
        cells[y * rect.w + x] = game.getPixel(rect.x + x, rect.y + y);
    return { kind: 'pixels', w: rect.w, h: rect.h, cells };
  }

  /**
   * Lands in the middle of what the tools may reach, and writes nothing yet.
   *
   * The pointer used to decide, which is right for a keystroke and impossible for a button: the
   * click that asks for the paste is the same gesture that takes the pointer off the canvas, so
   * the aim was always null and the paste fell back onto the selection it came from. The middle is
   * somewhere it will be seen, and it is only a starting point -- the layer is there to be moved.
   */
  pasteClip(clip: Clip): void {
    // A second paste settles the first rather than dropping it: work already placed is work.
    this.settleFloating();
    // The middle of what is on screen, not of the sheet: at a zoom where most of the sheet is
    // scrolled away, the sheet's middle is somewhere nobody is looking.
    const v = this.view();
    const rect = clampRect(
      {
        x: Math.round((v.x + v.w / 2) * SPRITE_SIZE - clip.w / 2),
        y: Math.round((v.y + v.h / 2) * SPRITE_SIZE - clip.h / 2),
        w: clip.w,
        h: clip.h,
      },
      this.bounds(),
    );
    this.floating.set({ rect, cells: clip.cells });
    this.selection.set(rect);
    this.pasted.emit();
  }

  /** Writes the placed layer into the sheet, as one undo step. Silent when there is none. */
  settleFloating(): void {
    const layer = this.floating();
    if (!layer) return;
    this.floating.set(null);
    const { rect, cells } = layer;
    const game = this.game();
    this.undo()?.stopCapturing();
    game.transact(() => {
      for (let y = 0; y < rect.h; y++)
        for (let x = 0; x < rect.w; x++) {
          const p = { x: rect.x + x, y: rect.y + y };
          if (this.inBounds(p)) game.setPixel(p.x, p.y, cells[y * rect.w + x] ?? 0);
        }
    });
    this.undo()?.stopCapturing();
    this.selection.set(rect);
  }

  /** Drops the placed layer. Nothing was written, so there is nothing to undo. */
  discardFloating(): boolean {
    if (!this.floating()) return false;
    this.floating.set(null);
    return true;
  }

  /** Clears the selected pixels (Delete / Backspace). */
  clearSelection(): void {
    const sel = this.selection();
    if (!sel) return;
    this.paint(
      rectPoints({ x: sel.x, y: sel.y }, { x: sel.x + sel.w - 1, y: sel.y + sel.h - 1 }, true),
      0,
    );
  }

  // ---- drawing --------------------------------------------------------------

  private requestRedraw(): void {
    cancelAnimationFrame(this.raf);
    // Writing a canvas's width clears it, so a repaint that follows a size change one frame later
    // leaves a blank frame on screen.
    if (this.canvas().nativeElement.width !== this.pxW() * Math.ceil(this.scale())) {
      this.draw();
      return;
    }
    this.raf = requestAnimationFrame(() => {
      this.draw();
    });
  }

  private draw(): void {
    const el = this.canvas().nativeElement;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    // One style object for the whole frame: reading a token is a getComputedStyle, which makes the
    // browser settle pending style work before it answers, and this frame also writes styles.
    const tokens = getComputedStyle(el);
    const token = (name: string): string => tokens.getPropertyValue(name).trim();
    const scale = this.scale();
    // Drawn at the whole scale above, shown at the real one. At a whole scale every art pixel is
    // exactly as wide as its neighbour and the cell guides land on hard edges; the browser then
    // resamples the finished picture once, evenly, on its way down to the size asked for.
    const s = Math.ceil(scale);
    const pxW = this.pxW();
    const pxH = this.pxH();
    // Everything below draws in sheet coordinates; cropping moves the origin and nothing else.
    const sheetW = pxW * s;
    const sheetH = pxH * s;
    const view = this.regionPx();
    const cropped = this.crop();
    const viewW = cropped ? view.w : pxW;
    const viewH = cropped ? view.h : pxH;
    const cw = viewW * s;
    const ch = viewH * s;
    if (el.width !== cw) el.width = cw;
    if (el.height !== ch) el.height = ch;
    el.style.width = `${String(viewW * scale)}px`;
    el.style.height = `${String(viewH * scale)}px`;
    el.style.imageRendering = s === scale ? 'pixelated' : 'auto';
    const wrap = this.wrap().nativeElement;
    wrap.style.width = `${String(viewW * scale)}px`;
    wrap.style.height = `${String(viewH * scale)}px`;
    // Assigning a size resets the transform and nothing else does, so a view whose size has not
    // changed would translate again on top of the last one and walk off the canvas.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    // 8px squares, fixed in viewport pixels: the transparency check should not zoom with the art,
    // or it reads as part of the sprite. Inset against sunken is the one-step pair the design
    // draws, and it inverts correctly in daylight.
    checkerboard(
      ctx,
      cw,
      ch,
      Math.round((8 * s) / scale),
      token('--nc-inset'),
      token('--nc-sunken'),
    );
    if (cropped) ctx.translate(-view.x * s, -view.y * s);

    const sheet = this.painter().canvas;
    const r = this.regionPx();
    if (this.onion() && r.x >= r.w) {
      // The frame before this one, ghosted underneath it — a step of the region's own width, since
      // an animation drawn two cells wide has its previous frame two cells back.
      ctx.globalAlpha = 0.3;
      ctx.drawImage(sheet, r.x - r.w, r.y, r.w, r.h, r.x * s, r.y * s, r.w * s, r.h * s);
      ctx.globalAlpha = 1;
    }
    const lifted = this.drag?.lifted;
    const off = this.moveOffset();
    ctx.drawImage(sheet, 0, 0, pxW, pxH, 0, 0, sheetW, sheetH);
    if (lifted && off) {
      // Hide the lifted region where it was, then draw its pixels at their offset.
      ctx.clearRect(lifted.rect.x * s, lifted.rect.y * s, lifted.rect.w * s, lifted.rect.h * s);
      checkerboardRegion(ctx, lifted.rect, s, token('--nc-inset'), token('--nc-sunken'));
      const pal = this.painter().palette;
      for (let y = 0; y < lifted.rect.h; y++)
        for (let x = 0; x < lifted.rect.w; x++) {
          const c = lifted.pixels[y * lifted.rect.w + x] ?? 0;
          if (!c) continue;
          ctx.fillStyle = pal[c] ?? '#000';
          ctx.fillRect((lifted.rect.x + x + off.x) * s, (lifted.rect.y + y + off.y) * s, s, s);
        }
    }

    const layer = this.floating();
    if (layer) {
      // Over the sheet, not into it: what it covers is still there, and still there if it moves on.
      const pal = this.painter().palette;
      const carry = this.drag?.carrying === true ? (off ?? { x: 0, y: 0 }) : { x: 0, y: 0 };
      for (let y = 0; y < layer.rect.h; y++)
        for (let x = 0; x < layer.rect.w; x++) {
          const c = layer.cells[y * layer.rect.w + x] ?? 0;
          if (!c) continue;
          ctx.fillStyle = pal[c] ?? '#000';
          ctx.fillRect((layer.rect.x + x + carry.x) * s, (layer.rect.y + y + carry.y) * s, s, s);
        }
    }

    const preview = this.preview();
    if (preview) {
      const colour = this.drag?.colour ?? this.colour();
      ctx.fillStyle =
        colour === 0 ? token('--nc-inset') : (this.painter().palette[colour] ?? '#fff');
      for (const p of preview) ctx.fillRect(p.x * s, p.y * s, s, s);
    }

    if (this.grid()) {
      // A veil of ink rather than the line colour: the guides sit *over* the art, so they have to
      // stay faint at every zoom and follow the theme without becoming a drawn border. The finest
      // ones only appear once an art pixel is big enough for a line between two of them to read as
      // a gap — across a whole 128px sheet at the fitted zoom they would be a grey wash.
      if (s >= 8) {
        ctx.strokeStyle = token('--nc-ink');
        ctx.globalAlpha = 0.07;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < pxW; i++) {
          if (i % SPRITE_SIZE === 0) continue;
          ctx.moveTo(i * s + 0.5, 0);
          ctx.lineTo(i * s + 0.5, sheetH);
        }
        for (let i = 1; i < pxH; i++) {
          if (i % SPRITE_SIZE === 0) continue;
          ctx.moveTo(0, i * s + 0.5);
          ctx.lineTo(sheetW, i * s + 0.5);
        }
        ctx.stroke();
      }
      // The cell guides are a stronger veil of the same ink, not gold. Gold on this screen means
      // what is being worked on, and a permanent grid wearing it left the region outline competing
      // with a hundred lines of its own colour for the eye.
      ctx.strokeStyle = token('--nc-ink');
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = SPRITE_SIZE; i < pxW; i += SPRITE_SIZE) {
        ctx.moveTo(i * s + 0.5, 0);
        ctx.lineTo(i * s + 0.5, sheetH);
      }
      for (let i = SPRITE_SIZE; i < pxH; i += SPRITE_SIZE) {
        ctx.moveTo(0, i * s + 0.5);
        ctx.lineTo(sheetW, i * s + 0.5);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // What is being worked on. Gold, two pixels, over everything: at the fitted zoom a whole sheet
    // is on screen and this outline is the only thing saying which part of it the flags, the
    // preview and — unless the lock is off — the tools are about.
    ctx.strokeStyle = token('--nc-gold');
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x * s + 1, r.y * s + 1, r.w * s - 2, r.h * s - 2);
    ctx.lineWidth = 1;

    // The sheet's own edge is a neutral hairline; gold on this screen means the region alone.
    ctx.strokeStyle = token('--nc-line-strong');
    ctx.strokeRect(0.5, 0.5, sheetW - 1, sheetH - 1);

    const sel = this.selection();
    if (sel) {
      ctx.setLineDash([s / 2, s / 2]);
      ctx.strokeStyle = token('--nc-ink');
      ctx.strokeRect(sel.x * s + 0.5, sel.y * s + 0.5, sel.w * s - 1, sel.h * s - 1);
      ctx.setLineDash([]);
    }
    const h = this.hoverCell();
    if (h) {
      ctx.strokeStyle = token('--nc-ink');
      ctx.lineWidth = 2;
      ctx.strokeRect(h.x * s + 1, h.y * s + 1, s - 2, s - 2);
      ctx.lineWidth = 1;
    }

    // Both are measured against the content, so neither can run before it has been given its size.
    const centre = this.centre;
    if (centre) {
      this.centre = null;
      const well = this.host.nativeElement;
      well.scrollLeft = centre.x * scale - well.clientWidth / 2;
      well.scrollTop = centre.y * scale - well.clientHeight / 2;
    }
    this.measure();
  }
}

function normalise(a: Pt, b: Pt): PixelRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 };
}

/** A selection never reaches further than the tools that will act on it. */
function clampRect(r: PixelRect, b: PixelRect): PixelRect {
  const x = Math.max(b.x, r.x);
  const y = Math.max(b.y, r.y);
  return {
    x,
    y,
    w: Math.max(1, Math.min(b.x + b.w, r.x + r.w) - x),
    h: Math.max(1, Math.min(b.y + b.h, r.y + r.h) - y),
  };
}

function checkerboardRegion(
  ctx: CanvasRenderingContext2D,
  r: PixelRect,
  s: number,
  a: string,
  b: string,
): void {
  ctx.save();
  ctx.translate(r.x * s, r.y * s);
  checkerboard(ctx, r.w * s, r.h * s, 8, a, b);
  ctx.restore();
}
