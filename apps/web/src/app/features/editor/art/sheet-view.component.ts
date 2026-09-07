import type { ElementRef } from '@angular/core';
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  model,
  untracked,
  viewChild,
} from '@angular/core';
import { ThemeService } from '@app/core/theme/theme.service';
import { cssVar } from '@app/shared/pixel/pixel-tools';
import { type SheetPainter } from '@app/shared/pixel/sheet-painter';
import { SHEET_HEIGHT, SHEET_WIDTH, SPRITE_SIZE, SPRITES_PER_ROW } from '@naucto/engine';

import { type SpriteRect } from './art.store';

const SCALE = 3;

/**
 * The whole 128×128 sheet, with the worked-on region on it and — where the caller has one — the
 * frame of what its canvas is currently showing.
 *
 * Used by ART, where the region is drawn by dragging, and by MAP, where a press just moves a
 * brush-sized region to the tile under it.
 */
@Component({
  selector: 'nc-sheet-view',
  template: `
    <canvas
      #canvas
      class="pixelated block h-full w-full cursor-crosshair touch-none"
      [width]="width"
      [height]="height"
      role="img"
      [attr.aria-label]="label()"
      (pointerdown)="onDown($event)"
      (pointermove)="onMove($event)"
      (pointerup)="onUp($event)"
      (pointercancel)="onUp($event)"
      (keydown)="onKey($event)"
      tabindex="0"
    ></canvas>
  `,
  // Drawn at the size it is painted: one art pixel has to be a whole number of screen pixels, or
  // the grid of sprite boundaries falls between them. Where there is not room, the panel scrolls
  // rather than the drawing shrinking.
  host: {
    class: 'box-content block shrink-0 rounded-xs border border-line bg-inset',
    '[style.width.px]': 'width',
    '[style.height.px]': 'height',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SheetViewComponent {
  readonly painter = input.required<SheetPainter>();
  readonly region = model<SpriteRect>({ x: 0, y: 0, w: 1, h: 1 });
  /** What the caller's canvas shows, in fractional cells. Drawn as a frame; null draws nothing. */
  readonly viewport = input<SpriteRect | null>(null);
  /** Whether dragging outside the region draws a new one, or just moves the one there is. */
  readonly resizable = input(false, { transform: booleanAttribute });
  readonly label = input('Sprite sheet');
  protected readonly width = SHEET_WIDTH * SCALE;
  protected readonly height = SHEET_HEIGHT * SCALE;
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly theme = inject(ThemeService);
  private drag: { anchor: { x: number; y: number }; grab: { x: number; y: number } | null } | null =
    null;
  private raf = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(this.raf);
    });
    effect(() => {
      this.painter().version();
      this.region();
      this.viewport();
      // Colours are read from CSS custom properties at paint time; repaint when the theme flips.
      this.theme.effective();
      untracked(() => {
        cancelAnimationFrame(this.raf);
        this.raf = requestAnimationFrame(() => {
          this.draw();
        });
      });
    });
  }

  // ---- pointer --------------------------------------------------------------

  /** Whole cell under the pointer. */
  private cellOf(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas().nativeElement.getBoundingClientRect();
    const cell = (r.width || this.width) / SPRITES_PER_ROW;
    const clamp = (v: number): number => Math.max(0, Math.min(SPRITES_PER_ROW - 1, Math.floor(v)));
    return { x: clamp((e.clientX - r.left) / cell), y: clamp((e.clientY - r.top) / cell) };
  }

  protected onDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.canvas().nativeElement.setPointerCapture(e.pointerId);
    const c = this.cellOf(e);
    const r = this.region();
    const inside = c.x >= r.x && c.y >= r.y && c.x < r.x + r.w && c.y < r.y + r.h;
    if (inside || !this.resizable()) {
      // Move: keep the size, and keep hold of the cell that was grabbed so the rectangle does not
      // jump its own width on the first move.
      this.drag = { anchor: c, grab: inside ? { x: c.x - r.x, y: c.y - r.y } : { x: 0, y: 0 } };
      this.moveTo(c);
      return;
    }
    this.drag = { anchor: c, grab: null };
    this.region.set({ x: c.x, y: c.y, w: 1, h: 1 });
  }

  protected onMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const c = this.cellOf(e);
    if (d.grab) this.moveTo(c);
    else this.region.set(spanning(d.anchor, c));
  }

  protected onUp(e: PointerEvent): void {
    if (this.drag) this.canvas().nativeElement.releasePointerCapture(e.pointerId);
    this.drag = null;
  }

  private moveTo(c: { x: number; y: number }): void {
    const r = this.region();
    const g = this.drag?.grab ?? { x: 0, y: 0 };
    this.region.set({
      x: Math.max(0, Math.min(SPRITES_PER_ROW - r.w, c.x - g.x)),
      y: Math.max(0, Math.min(SPRITES_PER_ROW - r.h, c.y - g.y)),
      w: r.w,
      h: r.h,
    });
  }

  /** Arrows move the region, shift+arrows resize it — the drag, for anyone not using a pointer. */
  protected onKey(e: KeyboardEvent): void {
    const step = (
      { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<
        string,
        [number, number] | undefined
      >
    )[e.key];
    if (!step) return;
    e.preventDefault();
    const [dx, dy] = step;
    const r = this.region();
    if (e.shiftKey && this.resizable()) {
      this.region.set({
        ...r,
        w: Math.max(1, Math.min(SPRITES_PER_ROW - r.x, r.w + dx)),
        h: Math.max(1, Math.min(SPRITES_PER_ROW - r.y, r.h + dy)),
      });
      return;
    }
    this.region.set({
      ...r,
      x: Math.max(0, Math.min(SPRITES_PER_ROW - r.w, r.x + dx)),
      y: Math.max(0, Math.min(SPRITES_PER_ROW - r.h, r.y + dy)),
    });
  }

  // ---- drawing --------------------------------------------------------------

  private draw(): void {
    const el = this.canvas().nativeElement;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = cssVar(el, '--nc-inset');
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.drawImage(this.painter().canvas, 0, 0, this.width, this.height);
    ctx.strokeStyle = cssVar(el, '--nc-line');
    ctx.beginPath();
    const cell = SPRITE_SIZE * SCALE;
    for (let i = cell; i < this.width; i += cell) {
      ctx.moveTo(i + 0.5, 0);
      ctx.lineTo(i + 0.5, this.height);
      ctx.moveTo(0, i + 0.5);
      ctx.lineTo(this.width, i + 0.5);
    }
    ctx.stroke();

    // The view frame goes under the region: the region is what you are editing, and it has to stay
    // legible when the two overlap — which, at a fitted zoom, they always do.
    const v = this.viewport();
    if (v) {
      ctx.strokeStyle = cssVar(el, '--nc-ink');
      ctx.globalAlpha = 0.45;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(v.x * cell + 0.5, v.y * cell + 0.5, v.w * cell - 1, v.h * cell - 1);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    const r = this.region();
    ctx.strokeStyle = cssVar(el, '--nc-gold');
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x * cell + 1, r.y * cell + 1, r.w * cell - 2, r.h * cell - 2);
    ctx.lineWidth = 1;
  }
}

/** The smallest whole-cell rectangle covering both cells. */
function spanning(a: { x: number; y: number }, b: { x: number; y: number }): SpriteRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x) + 1,
    h: Math.abs(a.y - b.y) + 1,
  };
}
