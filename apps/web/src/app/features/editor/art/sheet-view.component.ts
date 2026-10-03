import type { ElementRef } from '@angular/core';
import {
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
import { spanning, withinBounds } from '@app/shared/pixel/pixel-tools';
import { type SheetPainter } from '@app/shared/pixel/sheet-painter';
import { SPRITE_SIZE } from '@naucto/engine';

import { type SpriteRect } from './art.store';

/**
 * How tall the navigator may get, in CSS pixels, so a sheet taller than it is wide does not push
 * the sections below it off the panel.
 */
const MAX_HEIGHT = 384;

/**
 * One art pixel, in viewBox units: the box is sized in CSS and the viewBox scales to it, so this
 * sets the overlay's stroke proportions and not its size.
 */
const SCALE = 3;

/** The grip's leg, in drawing units. Half a cell, so a 1×1 region still has room to be moved. */
const GRIP = 12;

/** What a press started: `move` slides the region by the cell it was grabbed by, `span` draws a new
 * one from the cell pressed, `resize` holds the anchored corner and spans to the pointer. */
type Drag =
  | { kind: 'move'; grab: { x: number; y: number } }
  | { kind: 'span'; anchor: { x: number; y: number } }
  | { kind: 'resize'; anchor: { x: number; y: number } };

/** The whole sheet, with the worked-on region on it and — where the caller has one — the
 * frame of what its canvas is currently showing. */
@Component({
  selector: 'nc-sheet-view',
  templateUrl: './sheet-view.component.html',
  // One scale for both axes, so a cell stays square whatever shape the sheet is.
  host: {
    class: 'relative mx-auto block rounded-xs border border-line bg-inset',
    '[style.width]': "'100%'",
    '[style.aspect-ratio]': 'cols() + " / " + rows()',
    '[style.max-width.px]': '(MAX_HEIGHT * cols()) / rows()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SheetViewComponent {
  readonly painter = input.required<SheetPainter>();
  readonly region = model<SpriteRect>({ x: 0, y: 0, w: 1, h: 1 });
  /** What the caller's canvas shows, in fractional cells. Drawn as a frame; null draws nothing. */
  readonly viewport = input<SpriteRect | null>(null);
  readonly label = input('Sprite sheet');
  /** Where a middle-button drag has reached, in cells, for a caller that can move its own view. */
  readonly panTo = output<{ x: number; y: number }>();
  protected readonly GRIP = GRIP;
  protected readonly SPRITE_SIZE = SPRITE_SIZE;
  protected readonly MAX_HEIGHT = MAX_HEIGHT;
  /** Cells across and down, read through the painter's version so a resize is noticed. */
  protected readonly cols = computed(() => {
    this.painter().version();
    return this.painter().cols;
  });
  protected readonly rows = computed(() => {
    this.painter().version();
    return this.painter().rows;
  });
  protected readonly CELL = SPRITE_SIZE * SCALE;
  /** Every interior sprite boundary, each way. */
  protected readonly gridPath = computed(() => {
    const cell = this.CELL;
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
    const r = this.region();
    const cell = this.CELL;
    const x = (r.x + r.w) * cell - 1;
    const y = (r.y + r.h) * cell - 1;
    return {
      x,
      y,
      triangle: `${String(x)},${String(y)} ${String(x - GRIP)},${String(y)} ${String(x)},${String(y - GRIP)}`,
    };
  });
  protected readonly width = computed(() => this.cols() * this.CELL);
  protected readonly height = computed(() => this.rows() * this.CELL);
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

  /**
   * Where the pointer is, in cells and fractions of one; a pan is aimed by it, because a whole cell
   * here is a whole sprite on the caller's canvas.
   */
  private pointOf(e: PointerEvent): { x: number; y: number } {
    const r = this.surface().nativeElement.getBoundingClientRect();
    const cellW = (r.width || this.width()) / this.cols();
    const cellH = (r.height || this.height()) / this.rows();
    return {
      x: Math.max(0, Math.min(this.cols(), (e.clientX - r.left) / cellW)),
      y: Math.max(0, Math.min(this.rows(), (e.clientY - r.top) / cellH)),
    };
  }

  private cellOf(e: PointerEvent): { x: number; y: number } {
    const p = this.pointOf(e);
    return {
      x: Math.min(this.cols() - 1, Math.floor(p.x)),
      y: Math.min(this.rows() - 1, Math.floor(p.y)),
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
    const r = this.region();
    const p = this.pixelOf(e);
    const cell = this.CELL;
    const dx = (r.x + r.w) * cell - 1 - p.x;
    const dy = (r.y + r.h) * cell - 1 - p.y;
    // The grip is drawn as a triangle, so its hit area is one too: the square's far half would
    // claim pixels that show the sheet.
    return dx >= 0 && dy >= 0 && dx + dy <= GRIP;
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

  protected onDown(e: PointerEvent): void {
    if (e.button === 1) {
      // The middle button is the pan gesture everywhere else on this screen. Here it aims the
      // caller's own view rather than moving anything of ours, since this map does not scroll.
      e.preventDefault();
      this.surface().nativeElement.setPointerCapture(e.pointerId);
      this.panning = true;
      this.panTo.emit(this.pointOf(e));
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
    if (withinBounds(r, c)) {
      // Move: keep the size, and keep hold of the cell that was grabbed so the rectangle does not
      // jump its own width on the first move.
      this.drag = { kind: 'move', grab: { x: c.x - r.x, y: c.y - r.y } };
      this.moveTo(c);
      return;
    }
    this.drag = { kind: 'span', anchor: c };
    this.region.set({ x: c.x, y: c.y, w: 1, h: 1 });
  }

  protected onMove(e: PointerEvent): void {
    if (this.panning) {
      this.panTo.emit(this.pointOf(e));
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
    if (e.shiftKey) {
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

  /**
   * The sheet itself. Everything drawn over it is in the SVG above, and needs no repaint.
   *
   * Painted at its own pixel count and stretched by the CSS, rather than rasterised at the size it
   * happens to be shown: fewer pixels to push, and nothing to redraw when the panel changes width.
   */
  private draw(): void {
    const canvas = this.canvas().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    // Cleared rather than filled: the host carries the inset ground, so an empty cell shows it.
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(this.painter().canvas, 0, 0, canvas.width, canvas.height);
  }
}
