import type { ElementRef } from '@angular/core';
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  model,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import { type SheetPainter } from '@app/shared/pixel/sheet-painter';
import { SPRITE_SIZE } from '@naucto/engine';

import { type SpriteRect } from './art.store';

/**
 * The navigator's box, in drawing units.
 *
 * A cap rather than a size: the map has to fit the panel it sits in, and a sheet twice as wide as
 * the one this was drawn for would otherwise push it out. Three units per art pixel is what a
 * 128-pixel sheet gets, which is what it has always been drawn at.
 */
const MAX_BOX = 384;
const MAX_SCALE = 3;

/** The grip's leg, in drawing units. Half a cell, so a 1×1 region still has room to be moved. */
const GRIP = 12;

/**
 * What a press started.
 *
 * `move` slides the region and keeps the cell it was grabbed by; `span` draws a new region from
 * the cell pressed; `resize` holds one corner still and spans to the pointer — which is the only
 * one of the three a region covering the whole sheet leaves reachable, since every cell of it is
 * then a cell you would rather move than redraw.
 */
type Drag =
  | { kind: 'move'; grab: { x: number; y: number } }
  | { kind: 'span'; anchor: { x: number; y: number } }
  | { kind: 'resize'; anchor: { x: number; y: number } };

/**
 * The whole sheet, with the worked-on region on it and — where the caller has one — the
 * frame of what its canvas is currently showing.
 *
 * Used by ART, where the region is drawn by dragging, and by MAP, where a press just moves a
 * brush-sized region to the tile under it.
 */
@Component({
  selector: 'nc-sheet-view',
  template: `
    <!-- The sheet's own pixels, and nothing else: a canvas is how image data is shown, and every
         mark laid over it below is a piece of interface, which SVG draws at whatever the page is
         zoomed to instead of at the one size it was rasterised for. -->
    <canvas
      #canvas
      class="pixelated absolute inset-0 h-full w-full"
      [width]="width()"
      [height]="height()"
      aria-hidden="true"
    ></canvas>
    <svg
      #surface
      class="absolute inset-0 cursor-crosshair touch-none"
      [attr.viewBox]="'0 0 ' + width() + ' ' + height()"
      role="img"
      [attr.aria-label]="label()"
      tabindex="0"
      (pointerdown)="onDown($event)"
      (pointermove)="onMove($event)"
      (pointerup)="onUp($event)"
      (pointercancel)="onUp($event)"
      (keydown)="onKey($event)"
    >
      <path
        [attr.d]="gridPath()"
        fill="none"
        stroke="var(--nc-line)"
        shape-rendering="crispEdges"
      />
      <!-- The view frame goes under the region: the region is what you are editing, and it has to
           stay legible when the two overlap — which, at a fitted zoom, they always do. -->
      @if (viewport(); as v) {
        <rect
          [attr.x]="v.x * CELL() + 0.5"
          [attr.y]="v.y * CELL() + 0.5"
          [attr.width]="v.w * CELL() - 1"
          [attr.height]="v.h * CELL() - 1"
          fill="none"
          stroke="var(--nc-ink)"
          stroke-opacity="0.45"
          stroke-dasharray="3 3"
          shape-rendering="crispEdges"
        />
      }
      <rect
        [attr.x]="region().x * CELL() + 1"
        [attr.y]="region().y * CELL() + 1"
        [attr.width]="region().w * CELL() - 2"
        [attr.height]="region().h * CELL() - 2"
        fill="none"
        stroke="var(--nc-gold)"
        stroke-width="2"
        shape-rendering="crispEdges"
      />
      <!-- Its long edge is ruled rather than the whole corner being backed: what has to be told
           apart from the sheet is where the grip ends, and the sheet behind it is often the same
           gold the frame is drawn in. No crispEdges here — snapping a diagonal is the staircase
           this grip was moved out of the canvas to be rid of. -->
      @if (grip(); as g) {
        <polygon [attr.points]="g.triangle" fill="var(--nc-gold)" />
        <line
          [attr.x1]="g.x - GRIP"
          [attr.y1]="g.y"
          [attr.x2]="g.x"
          [attr.y2]="g.y - GRIP"
          stroke="var(--nc-inset)"
        />
      }
    </svg>
  `,
  // Drawn at the size it is painted: one art pixel has to be a whole number of screen pixels, or
  // the grid of sprite boundaries falls between them. Where there is not room, the panel scrolls
  // rather than the drawing shrinking.
  host: {
    class: 'relative box-content block shrink-0 rounded-xs border border-line bg-inset',
    '[style.width.px]': 'width()',
    '[style.height.px]': 'height()',
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
  /** Where a middle-button drag has reached, in cells, for a caller that can move its own view. */
  readonly panTo = output<{ x: number; y: number }>();
  protected readonly GRIP = GRIP;
  /** Cells across and down, read through the painter's version so a resize is noticed. */
  private readonly cols = computed(() => {
    this.painter().version();
    return this.painter().cols;
  });
  private readonly rows = computed(() => {
    this.painter().version();
    return this.painter().rows;
  });
  private readonly scale = computed(() =>
    Math.max(
      1,
      Math.min(MAX_SCALE, Math.floor(MAX_BOX / (SPRITE_SIZE * Math.max(this.cols(), this.rows())))),
    ),
  );
  protected readonly CELL = computed(() => SPRITE_SIZE * this.scale());
  /** Every interior sprite boundary, each way. */
  protected readonly gridPath = computed(() => {
    const cell = this.CELL();
    const w = this.cols() * cell;
    const h = this.rows() * cell;
    const down = Array.from(
      { length: this.cols() - 1 },
      (_, i) => `M${String((i + 1) * cell + 0.5)} 0V${String(h)}`,
    );
    const across = Array.from(
      { length: this.rows() - 1 },
      (_, i) => `M0 ${String((i + 1) * cell + 0.5)}H${String(w)}`,
    );
    return [...down, ...across].join('');
  });

  /**
   * The grip in the region's bottom-right corner, or null where a new span cannot be dragged.
   *
   * `x`/`y` is that corner itself, which is where its long edge starts; the triangle runs from
   * there up and left, so it stays inside the frame it belongs to.
   */
  protected readonly grip = computed(() => {
    if (!this.resizable()) return null;
    const r = this.region();
    const cell = this.CELL();
    const x = (r.x + r.w) * cell - 1;
    const y = (r.y + r.h) * cell - 1;
    return {
      x,
      y,
      triangle: `${String(x)},${String(y)} ${String(x - GRIP)},${String(y)} ${String(x)},${String(y - GRIP)}`,
    };
  });
  protected readonly width = computed(() => this.cols() * this.CELL());
  protected readonly height = computed(() => this.rows() * this.CELL());
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly surface = viewChild.required<ElementRef<SVGSVGElement>>('surface');
  private panning = false;
  private drag: Drag | null = null;
  private raf = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(this.raf);
    });
    effect(() => {
      this.painter().version();
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
    const r = this.surface().nativeElement.getBoundingClientRect();
    const cellW = (r.width || this.width()) / this.cols();
    const cellH = (r.height || this.height()) / this.rows();
    const clamp = (v: number, n: number): number => Math.max(0, Math.min(n - 1, Math.floor(v)));
    return {
      x: clamp((e.clientX - r.left) / cellW, this.cols()),
      y: clamp((e.clientY - r.top) / cellH, this.rows()),
    };
  }

  /** Pointer position in drawing units, which is what the grip is measured in. */
  private pixelOf(e: PointerEvent): { x: number; y: number } {
    const r = this.surface().nativeElement.getBoundingClientRect();
    const k = this.width() / (r.width || this.width());
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
  }

  /** Whether the pointer is on the grip in the region's bottom-right corner. */
  private onGrip(e: PointerEvent): boolean {
    if (!this.resizable()) return false;
    const r = this.region();
    const p = this.pixelOf(e);
    const cell = this.CELL();
    const dx = (r.x + r.w) * cell - 1 - p.x;
    const dy = (r.y + r.h) * cell - 1 - p.y;
    // The grip is drawn as a triangle, so its hit area is one too: the square's far half would
    // claim pixels that show the sheet.
    return dx >= 0 && dy >= 0 && dx + dy <= GRIP;
  }

  protected onDown(e: PointerEvent): void {
    if (e.button === 1) {
      // The middle button is the pan gesture everywhere else on this screen. Here it aims the
      // caller's own view rather than moving anything of ours, since this map does not scroll.
      e.preventDefault();
      this.surface().nativeElement.setPointerCapture(e.pointerId);
      this.panning = true;
      this.panTo.emit(this.cellOf(e));
      return;
    }
    if (e.button !== 0) return;
    this.surface().nativeElement.setPointerCapture(e.pointerId);
    const r = this.region();
    // Tested before anything else: once the region covers the sheet there is no cell outside it
    // to start a new span from, and without this the selection could never be made smaller again.
    if (this.onGrip(e)) {
      this.drag = { kind: 'resize', anchor: { x: r.x, y: r.y } };
      return;
    }
    const c = this.cellOf(e);
    const inside = c.x >= r.x && c.y >= r.y && c.x < r.x + r.w && c.y < r.y + r.h;
    if (inside || !this.resizable()) {
      // Move: keep the size, and keep hold of the cell that was grabbed so the rectangle does not
      // jump its own width on the first move.
      this.drag = { kind: 'move', grab: inside ? { x: c.x - r.x, y: c.y - r.y } : { x: 0, y: 0 } };
      this.moveTo(c);
      return;
    }
    this.drag = { kind: 'span', anchor: c };
    this.region.set({ x: c.x, y: c.y, w: 1, h: 1 });
  }

  protected onMove(e: PointerEvent): void {
    if (this.panning) {
      this.panTo.emit(this.cellOf(e));
      return;
    }
    const d = this.drag;
    if (!d) {
      // A grip has to say it is one before it is pressed, and which corner it is depends on where
      // the region has got to — so it is set here rather than by a class.
      this.surface().nativeElement.style.cursor = this.onGrip(e) ? 'nwse-resize' : '';
      return;
    }
    const c = this.cellOf(e);
    if (d.kind === 'move') this.moveTo(c);
    else this.region.set(spanning(d.anchor, c));
  }

  protected onUp(e: PointerEvent): void {
    if (this.drag || this.panning) this.surface().nativeElement.releasePointerCapture(e.pointerId);
    this.panning = false;
    this.drag = null;
  }

  private moveTo(c: { x: number; y: number }): void {
    const r = this.region();
    const d = this.drag;
    const g = d?.kind === 'move' ? d.grab : { x: 0, y: 0 };
    this.region.set({
      x: Math.max(0, Math.min(this.cols() - r.w, c.x - g.x)),
      y: Math.max(0, Math.min(this.rows() - r.h, c.y - g.y)),
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
        w: Math.max(1, Math.min(this.cols() - r.x, r.w + dx)),
        h: Math.max(1, Math.min(this.rows() - r.y, r.h + dy)),
      });
      return;
    }
    this.region.set({
      ...r,
      x: Math.max(0, Math.min(this.cols() - r.w, r.x + dx)),
      y: Math.max(0, Math.min(this.rows() - r.h, r.y + dy)),
    });
  }

  // ---- drawing --------------------------------------------------------------

  /** The sheet itself. Everything drawn over it is in the SVG above, and needs no repaint. */
  private draw(): void {
    const ctx = this.canvas().nativeElement.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    // Cleared rather than filled: the host carries the inset ground, so an empty cell shows it.
    ctx.clearRect(0, 0, this.width(), this.height());
    ctx.drawImage(this.painter().canvas, 0, 0, this.width(), this.height());
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
