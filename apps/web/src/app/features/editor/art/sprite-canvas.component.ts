import {
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
import { type Game, SPRITE_SIZE, SPRITES_PER_ROW } from '@naucto/engine';
import { PresenceFlagComponent } from '@naucto/ui';

import { type Collaborator } from '../work-session/work-session.service';
import { type ArtTool, type PixelRect } from './art.store';

interface Drag {
  tool: ArtTool;
  start: Pt;
  last: Pt;
  colour: number;
  /** For MOVE: the lifted pixels and where they came from. */
  lifted?: { rect: PixelRect; pixels: Uint8Array };
}

/**
 * The big pixel canvas: one sprite block (size×size cells) zoomed to fit.
 * Applies the active tool straight to the game document.
 */
@Component({
  selector: 'nc-sprite-canvas',
  imports: [PresenceFlagComponent],
  template: `
    <div class="relative" [style.width.px]="cssSize()" [style.height.px]="cssSize()">
      <canvas
        #canvas
        class="pixelated block cursor-crosshair touch-none"
        [width]="cssSize()"
        [height]="cssSize()"
        [attr.aria-label]="label()"
        role="img"
        (pointerdown)="onDown($event)"
        (pointermove)="onMove($event)"
        (pointerup)="onUp($event)"
        (pointercancel)="onUp($event)"
        (pointerleave)="onLeave()"
        (contextmenu)="$event.preventDefault()"
      ></canvas>
      @for (f of flags(); track f.clientId) {
        <nc-presence-flag
          class="absolute"
          [style.left.px]="f.x"
          [style.top.px]="f.y"
          [name]="f.name"
          [colour]="f.colour"
        />
      }
    </div>
  `,
  host: {
    class: 'flex items-center justify-center overflow-auto',
    tabindex: '0',
    '(wheel)': 'onWheel($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpriteCanvasComponent {
  readonly game = input.required<Game>();
  readonly painter = input.required<SheetPainter>();
  readonly sprite = input.required<number>();
  readonly size = input(1);
  readonly tool = input<ArtTool>('pen');
  readonly colour = input(4);
  readonly grid = input(true);
  readonly onion = input(false);
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

  /**
   * One step of zoom. Multiplicative rather than ±1: the scale is screen pixels per art pixel, so
   * it sits anywhere from 4 to well over 100 depending on the sprite size and the panel width, and
   * a fixed step would be imperceptible at one end and violent at the other.
   */
  zoomBy(delta: number): void {
    const current = this.scale();
    const next = delta > 0 ? Math.ceil(current * 1.25) : Math.floor(current / 1.25);
    this.userScale.set(Math.max(1, Math.min(256, next)));
  }

  /** Back to filling the well, and back to following it when the panel resizes. */
  resetZoom(): void {
    this.userScale.set(null);
  }

  protected onWheel(e: WheelEvent): void {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    this.zoomBy(e.deltaY < 0 ? 1 : -1);
  }

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly theme = inject(ThemeService);
  /**
   * The well, as the ResizeObserver last measured it. The fit used to be computed *inside* that
   * callback, so it only ever changed when the host resized — and switching to a 4x4 sprite does
   * not resize the host. The canvas stayed at the 1x1 sprite's zoom, which put a 32x32 block at
   * 79px a cell and pushed most of it out of the panel.
   */
  private readonly well = signal({ w: 0, h: 0 });
  /**
   * What the sprite would take to fill the well. Whole pixels only, so a drawn cell is never a
   * fraction wide.
   */
  private readonly fitScale = computed(() => {
    const { w, h } = this.well();
    if (!w || !h) return 8;
    return Math.max(1, Math.floor((Math.min(w, h) - 16) / this.px()));
  });
  /**
   * Null until somebody zooms, and from then on theirs. The scale used to be the fit and nothing
   * else — the readout beside the canvas showed whatever number the panel width happened to
   * produce (×116 for an 8×8 sprite), and there was no way to change it.
   */
  private readonly userScale = signal<number | null>(null);
  private readonly scale = computed(() => this.userScale() ?? this.fitScale());
  private readonly hoverCell = signal<Pt | null>(null);
  private readonly preview = signal<Pt[] | null>(null);
  private readonly moveOffset = signal<Pt | null>(null);
  private drag: Drag | null = null;
  private raf = 0;

  /** Pixel size of the block (8, 16 … 64). */
  protected readonly px = computed(() => this.size() * SPRITE_SIZE);
  protected readonly cssSize = computed(() => this.px() * this.scale());
  protected readonly flags = computed(() => {
    const { x: ox, y: oy } = this.game().spriteOrigin(this.sprite());
    const px = this.px();
    const s = this.scale();
    return this.collaborators()
      .filter((c) => !c.isSelf && c.cursor?.tab === 'art')
      .map((c) => ({
        clientId: c.clientId,
        name: c.name,
        colour: c.colour,
        x: ((c.cursor?.x ?? 0) - ox) * s,
        y: ((c.cursor?.y ?? 0) - oy) * s,
      }))
      .filter((f) => f.x >= 0 && f.y >= 0 && f.x < px * s && f.y < px * s);
  });

  constructor() {
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      this.well.set({ w: r.width, h: r.height });
    });
    ro.observe(this.host.nativeElement);
    inject(DestroyRef).onDestroy(() => {
      ro.disconnect();
      cancelAnimationFrame(this.raf);
    });
    effect(() => {
      this.zoom.set(this.scale());
    });
    effect(() => {
      this.painter().version();
      this.sprite();
      this.size();
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

  // ---- pointer --------------------------------------------------------------

  private cellOf(e: PointerEvent): Pt {
    const p = this.pointOf(e);
    return {
      x: Math.max(0, Math.min(this.px() - 1, Math.floor(p.x))),
      y: Math.max(0, Math.min(this.px() - 1, Math.floor(p.y))),
    };
  }

  /** The same position, unsnapped. */
  private pointOf(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas().nativeElement.getBoundingClientRect();
    const s = this.scale();
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
  }

  private origin(): Pt {
    return this.game().spriteOrigin(this.sprite());
  }

  private getLocal(x: number, y: number): number {
    const o = this.origin();
    return this.game().getPixel(o.x + x, o.y + y);
  }

  private paint(points: readonly Pt[], colour: number): void {
    const o = this.origin();
    const px = this.px();
    this.game().transact(() => {
      for (const p of points)
        if (p.x >= 0 && p.y >= 0 && p.x < px && p.y < px)
          this.game().setPixel(o.x + p.x, o.y + p.y, colour);
    });
  }

  protected onDown(e: PointerEvent): void {
    if (e.button !== 0 && e.button !== 2) return;
    this.host.nativeElement.focus({ preventScroll: true });
    this.canvas().nativeElement.setPointerCapture(e.pointerId);
    const cell = this.cellOf(e);
    const colour = e.button === 2 ? 0 : this.colour();
    const tool = this.tool();
    this.drag = { tool, start: cell, last: cell, colour };
    switch (tool) {
      case 'pen':
        this.paint([cell], colour);
        break;
      case 'fill': {
        const px = this.px();
        this.paint(
          floodFill((x, y) => this.getLocal(x, y), cell, px, px),
          colour,
        );
        this.drag = null;
        break;
      }
      case 'eyedropper':
        this.pick.emit(this.getLocal(cell.x, cell.y));
        this.drag = null;
        break;
      case 'move': {
        const rect = this.selection() ?? { x: 0, y: 0, w: this.px(), h: this.px() };
        const pixels = new Uint8Array(rect.w * rect.h);
        for (let y = 0; y < rect.h; y++)
          for (let x = 0; x < rect.w; x++)
            pixels[y * rect.w + x] = this.getLocal(rect.x + x, rect.y + y);
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
    const o = this.origin();
    this.hover.emit({ x: o.x + cell.x, y: o.y + cell.y });
    const pt = this.pointOf(e);
    this.pointer.emit({ x: o.x + pt.x, y: o.y + pt.y });
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
        this.selection.set(normalise(d.start, cell));
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
      const o = this.origin();
      const px = this.px();
      this.game().transact(() => {
        for (let y = 0; y < rect.h; y++)
          for (let x = 0; x < rect.w; x++)
            this.game().setPixel(o.x + rect.x + x, o.y + rect.y + y, 0);
        for (let y = 0; y < rect.h; y++)
          for (let x = 0; x < rect.w; x++) {
            const tx = rect.x + x + off.x;
            const ty = rect.y + y + off.y;
            if (tx >= 0 && ty >= 0 && tx < px && ty < px)
              this.game().setPixel(o.x + tx, o.y + ty, pixels[y * rect.w + x] ?? 0);
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
    this.raf = requestAnimationFrame(() => {
      this.draw();
    });
  }

  private draw(): void {
    const el = this.canvas().nativeElement;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const s = this.scale();
    const px = this.px();
    const css = px * s;
    const o = this.origin();
    ctx.imageSmoothingEnabled = false;
    // 8px squares, fixed in viewport pixels: the transparency check should not zoom with the art,
    // or it reads as part of the sprite. Inset against sunken is the one-step pair the design
    // draws, and it inverts correctly in daylight.
    checkerboard(ctx, css, css, 8, cssVar(el, '--nc-inset'), cssVar(el, '--nc-sunken'));

    const sheet = this.painter().canvas;
    if (this.onion() && this.sprite() > 0) {
      const prev = this.game().spriteOrigin(this.sprite() - 1);
      ctx.globalAlpha = 0.3;
      ctx.drawImage(sheet, prev.x, prev.y, px, px, 0, 0, css, css);
      ctx.globalAlpha = 1;
    }
    const lifted = this.drag?.lifted;
    const off = this.moveOffset();
    if (lifted && off) {
      // Draw the sheet with the lifted region hidden, then the lifted pixels at their offset.
      ctx.drawImage(sheet, o.x, o.y, px, px, 0, 0, css, css);
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
    } else {
      ctx.drawImage(sheet, o.x, o.y, px, px, 0, 0, css, css);
    }

    const preview = this.preview();
    if (preview) {
      const colour = this.drag?.colour ?? this.colour();
      ctx.fillStyle =
        colour === 0 ? cssVar(el, '--nc-inset') : (this.painter().palette[colour] ?? '#fff');
      for (const p of preview) ctx.fillRect(p.x * s, p.y * s, s, s);
    }

    if (this.grid() && s >= 4) {
      // A veil of ink rather than the line colour: the guides sit *over* the art, so they have to
      // stay faint at every zoom and follow the theme without becoming a drawn border.
      ctx.strokeStyle = cssVar(el, '--nc-ink');
      ctx.globalAlpha = 0.07;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < px; i++) {
        if (i % SPRITE_SIZE === 0) continue;
        ctx.moveTo(i * s + 0.5, 0);
        ctx.lineTo(i * s + 0.5, css);
        ctx.moveTo(0, i * s + 0.5);
        ctx.lineTo(css, i * s + 0.5);
      }
      ctx.stroke();
      ctx.strokeStyle = cssVar(el, '--nc-gold');
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      for (let i = SPRITE_SIZE; i < px; i += SPRITE_SIZE) {
        ctx.moveTo(i * s + 0.5, 0);
        ctx.lineTo(i * s + 0.5, css);
        ctx.moveTo(0, i * s + 0.5);
        ctx.lineTo(css, i * s + 0.5);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // The frame is a neutral hairline; gold on this screen means the 8px cell guides and the
    // selected sheet cell, not the canvas edge.
    ctx.strokeStyle = cssVar(el, '--nc-line-strong');
    ctx.strokeRect(0.5, 0.5, css - 1, css - 1);

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
