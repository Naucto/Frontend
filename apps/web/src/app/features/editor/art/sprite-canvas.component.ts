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
import {
  checkerboard,
  cssVar,
  ellipsePoints,
  floodFill,
  linePoints,
  type Pt,
  rectPoints,
} from '@app/shared/pixel/pixel-tools';
import { type SheetPainter } from '@app/shared/pixel/sheet-painter';
import { type Game, SHEET_WIDTH, SPRITE_SIZE, SPRITES_PER_ROW } from '@naucto/engine';
import { PresenceLayerComponent, type PresenceMark, type PresenceViewport } from '@naucto/ui';

import { type Collaborator } from '../work-session/work-session.service';
import { type ArtTool, type PixelRect, type SpriteRect } from './art.store';

/**
 * Screen pixels per art pixel, at the ends. The whole sheet is drawn at once rather than the part
 * on screen, so the ceiling is set by what a canvas that large costs, not by how far into a sprite
 * anybody would want to go.
 */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 32;

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
export function stepZoom(scale: number, delta: number): number {
  const next =
    delta > 0
      ? Math.max(Math.floor(scale * 1.25), Math.floor(scale) + 1)
      : Math.min(Math.ceil(scale / 1.25), Math.ceil(scale) - 1);
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
}

/** How far a tool may reach: the region while the lock holds, the whole sheet once it is off. */
export function toolBounds(region: SpriteRect, clip: boolean): PixelRect {
  if (!clip) return { x: 0, y: 0, w: SHEET_WIDTH, h: SHEET_WIDTH };
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
}

/**
 * The whole 128×128 sheet, zoomed and scrolled, with the worked-on region marked on it.
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
      <nc-presence-layer [marks]="marks()" [viewport]="viewPx()" />
    </div>
  `,
  // `m-auto` on the content rather than `justify-center` on the host: centring a flex child that
  // overflows its container makes the overflowing start unreachable by scrolling, which at any
  // zoom past the fit is most of the sheet.
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

  /** What of the sheet is on screen, in fractional cells — for whatever draws a map of it. */
  readonly view = signal<SpriteRect>({ x: 0, y: 0, w: SPRITES_PER_ROW, h: SPRITES_PER_ROW });

  zoomBy(delta: number): void {
    this.setZoom(stepZoom(this.scale(), delta));
  }

  setZoom(scale: number): void {
    this.userScale.set(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale)));
  }

  /** Back to fitting the sheet, and back to following it when the panel resizes. */
  resetZoom(): void {
    this.userScale.set(null);
  }

  protected onWheel(e: WheelEvent): void {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    this.zoomBy(e.deltaY < 0 ? 1 : -1);
  }

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
    const subject = this.crop() ? Math.max(r.w, r.h) : SHEET_WIDTH;
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

  protected readonly px = SHEET_WIDTH;
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
  private readonly bounds = computed(() => toolBounds(this.region(), this.clip()));
  protected readonly marks = computed<PresenceMark[]>(() => {
    const s = this.scale();
    return this.collaborators()
      .filter((c) => !c.isSelf && c.cursor?.tab === 'art')
      .map((c) => ({
        id: c.clientId,
        name: c.name,
        colour: c.colour,
        x: (c.cursor?.x ?? 0) * s,
        y: (c.cursor?.y ?? 0) * s,
      }));
  });
  /** The same frame `view` reports, in the drawn pixels the marks are placed in. */
  protected readonly viewPx = computed<PresenceViewport>(() => {
    const v = this.view();
    const k = SPRITE_SIZE * this.scale();
    return { x: v.x * k, y: v.y * k, w: v.w * k, h: v.h * k };
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

  /** Publishes what is on screen, in cells. */
  measure(): void {
    const el = this.host.nativeElement;
    const s = this.scale();
    const css = this.px * s;
    const span = (client: number, scroll: number): [number, number] =>
      css <= client ? [0, this.px] : [scroll / s, client / s];
    const [x, w] = span(el.clientWidth, el.scrollLeft);
    const [y, h] = span(el.clientHeight, el.scrollTop);
    this.view.set({
      x: x / SPRITE_SIZE,
      y: y / SPRITE_SIZE,
      w: w / SPRITE_SIZE,
      h: h / SPRITE_SIZE,
    });
  }

  private reveal(r: PixelRect, s: number): void {
    const el = this.host.nativeElement;
    if (this.px * s <= el.clientWidth && this.px * s <= el.clientHeight) return;
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
      x: Math.max(0, Math.min(this.px - 1, Math.floor(p.x))),
      y: Math.max(0, Math.min(this.px - 1, Math.floor(p.y))),
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
      for (const p of points) if (this.inBounds(p)) this.game().setPixel(p.x, p.y, colour);
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
    this.drag = { tool, start: cell, last: cell, colour };
    switch (tool) {
      case 'pen':
        this.paint([cell], colour);
        break;
      case 'fill': {
        const b = this.bounds();
        this.paint(
          floodFill(
            (x, y) => this.game().getPixel(b.x + x, b.y + y),
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
        this.pick.emit(this.game().getPixel(cell.x, cell.y));
        this.drag = null;
        break;
      case 'move': {
        const rect = this.selection() ?? this.bounds();
        const pixels = new Uint8Array(rect.w * rect.h);
        for (let y = 0; y < rect.h; y++)
          for (let x = 0; x < rect.w; x++)
            pixels[y * rect.w + x] = this.game().getPixel(rect.x + x, rect.y + y);
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
    if (d.tool === 'move' && d.lifted) {
      const off = { x: cell.x - d.start.x, y: cell.y - d.start.y };
      this.moveOffset.set(null);
      if (off.x === 0 && off.y === 0) return;
      const { rect, pixels } = d.lifted;
      this.game().transact(() => {
        for (let y = 0; y < rect.h; y++)
          for (let x = 0; x < rect.w; x++) this.game().setPixel(rect.x + x, rect.y + y, 0);
        for (let y = 0; y < rect.h; y++)
          for (let x = 0; x < rect.w; x++) {
            const p = { x: rect.x + x + off.x, y: rect.y + y + off.y };
            if (this.inBounds(p)) this.game().setPixel(p.x, p.y, pixels[y * rect.w + x] ?? 0);
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
    if (this.canvas().nativeElement.width !== this.px * Math.ceil(this.scale())) {
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
    const scale = this.scale();
    // Drawn at the whole scale above, shown at the real one. At a whole scale every art pixel is
    // exactly as wide as its neighbour and the cell guides land on hard edges; the browser then
    // resamples the finished picture once, evenly, on its way down to the size asked for.
    const s = Math.ceil(scale);
    const px = this.px;
    // The whole sheet, in canvas units. Everything below draws in sheet coordinates; what the
    // cropped view does is move the origin, not change what anything means.
    const sheetPx = px * s;
    const view = this.regionPx();
    const cropped = this.crop();
    const viewW = cropped ? view.w : px;
    const viewH = cropped ? view.h : px;
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
    ctx.imageSmoothingEnabled = false;
    // 8px squares, fixed in viewport pixels: the transparency check should not zoom with the art,
    // or it reads as part of the sprite. Inset against sunken is the one-step pair the design
    // draws, and it inverts correctly in daylight.
    checkerboard(
      ctx,
      cw,
      ch,
      Math.round((8 * s) / scale),
      cssVar(el, '--nc-inset'),
      cssVar(el, '--nc-sunken'),
    );
    if (cropped) ctx.translate(-view.x * s, -view.y * s);

    const sheet = this.painter().canvas;
    const r = this.regionPx();
    if (this.onion() && r.x >= SPRITE_SIZE) {
      // The cell before the region, ghosted underneath it — an animation's previous frame.
      ctx.globalAlpha = 0.3;
      ctx.drawImage(sheet, r.x - SPRITE_SIZE, r.y, r.w, r.h, r.x * s, r.y * s, r.w * s, r.h * s);
      ctx.globalAlpha = 1;
    }
    const lifted = this.drag?.lifted;
    const off = this.moveOffset();
    ctx.drawImage(sheet, 0, 0, px, px, 0, 0, sheetPx, sheetPx);
    if (lifted && off) {
      // Hide the lifted region where it was, then draw its pixels at their offset.
      ctx.clearRect(lifted.rect.x * s, lifted.rect.y * s, lifted.rect.w * s, lifted.rect.h * s);
      checkerboardRegion(ctx, lifted.rect, s, el);
      const pal = this.painter().palette;
      for (let y = 0; y < lifted.rect.h; y++)
        for (let x = 0; x < lifted.rect.w; x++) {
          const c = lifted.pixels[y * lifted.rect.w + x] ?? 0;
          if (!c) continue;
          ctx.fillStyle = pal[c] ?? '#000';
          ctx.fillRect((lifted.rect.x + x + off.x) * s, (lifted.rect.y + y + off.y) * s, s, s);
        }
    }

    const preview = this.preview();
    if (preview) {
      const colour = this.drag?.colour ?? this.colour();
      ctx.fillStyle =
        colour === 0 ? cssVar(el, '--nc-inset') : (this.painter().palette[colour] ?? '#fff');
      for (const p of preview) ctx.fillRect(p.x * s, p.y * s, s, s);
    }

    if (this.grid()) {
      // A veil of ink rather than the line colour: the guides sit *over* the art, so they have to
      // stay faint at every zoom and follow the theme without becoming a drawn border. The finest
      // ones only appear once an art pixel is big enough for a line between two of them to read as
      // a gap — across a whole 128px sheet at the fitted zoom they would be a grey wash.
      if (s >= 8) {
        ctx.strokeStyle = cssVar(el, '--nc-ink');
        ctx.globalAlpha = 0.07;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < px; i++) {
          if (i % SPRITE_SIZE === 0) continue;
          ctx.moveTo(i * s + 0.5, 0);
          ctx.lineTo(i * s + 0.5, sheetPx);
          ctx.moveTo(0, i * s + 0.5);
          ctx.lineTo(sheetPx, i * s + 0.5);
        }
        ctx.stroke();
      }
      // The cell guides are a stronger veil of the same ink, not gold. Gold on this screen means
      // what is being worked on, and a permanent grid wearing it left the region outline competing
      // with a hundred lines of its own colour for the eye.
      ctx.strokeStyle = cssVar(el, '--nc-ink');
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = SPRITE_SIZE; i < px; i += SPRITE_SIZE) {
        ctx.moveTo(i * s + 0.5, 0);
        ctx.lineTo(i * s + 0.5, sheetPx);
        ctx.moveTo(0, i * s + 0.5);
        ctx.lineTo(sheetPx, i * s + 0.5);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // What is being worked on. Gold, two pixels, over everything: at the fitted zoom a whole sheet
    // is on screen and this outline is the only thing saying which part of it the flags, the
    // preview and — unless the lock is off — the tools are about.
    ctx.strokeStyle = cssVar(el, '--nc-gold');
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x * s + 1, r.y * s + 1, r.w * s - 2, r.h * s - 2);
    ctx.lineWidth = 1;

    // The sheet's own edge is a neutral hairline; gold on this screen means the region alone.
    ctx.strokeStyle = cssVar(el, '--nc-line-strong');
    ctx.strokeRect(0.5, 0.5, sheetPx - 1, sheetPx - 1);

    const sel = this.selection();
    if (sel) {
      ctx.setLineDash([s / 2, s / 2]);
      ctx.strokeStyle = cssVar(el, '--nc-ink');
      ctx.strokeRect(sel.x * s + 0.5, sel.y * s + 0.5, sel.w * s - 1, sel.h * s - 1);
      ctx.setLineDash([]);
    }
    const h = this.hoverCell();
    if (h) {
      ctx.strokeStyle = cssVar(el, '--nc-ink');
      ctx.lineWidth = 2;
      ctx.strokeRect(h.x * s + 1, h.y * s + 1, s - 2, s - 2);
      ctx.lineWidth = 1;
    }
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
  el: Element,
): void {
  ctx.save();
  ctx.translate(r.x * s, r.y * s);
  checkerboard(ctx, r.w * s, r.h * s, 8, cssVar(el, '--nc-inset'), cssVar(el, '--nc-sunken'));
  ctx.restore();
}

export const SPRITE_COLUMNS = SPRITES_PER_ROW;
