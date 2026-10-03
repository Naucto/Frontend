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
import { SPRITE_SIZE } from '@naucto/engine';

import { spanning, withinBounds } from '../../../shared/pixel/pixel-tools';
import { type SheetPainter } from '../../../shared/pixel/sheet-painter';
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
    const totalWidth = this.cols() * cell;
    const totalHeight = this.rows() * cell;
    const down = Array.from(
      { length: this.cols() - 1 },
      (_, i) => `M${String((i + 1) * cell + 0.5)} 0V${String(totalHeight)}`,
    );
    const across = Array.from(
      { length: this.rows() - 1 },
      (_, i) => `M0 ${String((i + 1) * cell + 0.5)}H${String(totalWidth)}`,
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
    const region = this.region();
    const cell = this.CELL;
    const x = (region.x + region.w) * cell - 1;
    const y = (region.y + region.h) * cell - 1;
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
  private pointOf(event: PointerEvent): { x: number; y: number } {
    const rect = this.surface().nativeElement.getBoundingClientRect();
    const cellW = (rect.width || this.width()) / this.cols();
    const cellH = (rect.height || this.height()) / this.rows();
    return {
      x: Math.max(0, Math.min(this.cols(), (event.clientX - rect.left) / cellW)),
      y: Math.max(0, Math.min(this.rows(), (event.clientY - rect.top) / cellH)),
    };
  }

  private cellOf(event: PointerEvent): { x: number; y: number } {
    const point = this.pointOf(event);
    return {
      x: Math.min(this.cols() - 1, Math.floor(point.x)),
      y: Math.min(this.rows() - 1, Math.floor(point.y)),
    };
  }

  /** Pointer position in drawing units, which is what the grip is measured in. */
  private pixelOf(event: PointerEvent): { x: number; y: number } {
    const rect = this.surface().nativeElement.getBoundingClientRect();
    const scale = this.width() / (rect.width || this.width());
    return { x: (event.clientX - rect.left) * scale, y: (event.clientY - rect.top) * scale };
  }

  /** Whether the pointer is on the grip in the region's bottom-right corner. */
  private onGrip(event: PointerEvent): boolean {
    const region = this.region();
    const point = this.pixelOf(event);
    const cell = this.CELL;
    const dx = (region.x + region.w) * cell - 1 - point.x;
    const dy = (region.y + region.h) * cell - 1 - point.y;
    // The grip is drawn as a triangle, so its hit area is one too: the square's far half would
    // claim pixels that show the sheet.
    return dx >= 0 && dy >= 0 && dx + dy <= GRIP;
  }

  private moveTo(cell: { x: number; y: number }): void {
    const region = this.region();
    const drag = this.drag;
    const grab = drag?.kind === 'move' ? drag.grab : { x: 0, y: 0 };
    this.region.set({
      x: Math.max(0, Math.min(this.cols() - region.w, cell.x - grab.x)),
      y: Math.max(0, Math.min(this.rows() - region.h, cell.y - grab.y)),
      w: region.w,
      h: region.h,
    });
  }

  protected onDown(event: PointerEvent): void {
    if (event.button === 1) {
      // The middle button is the pan gesture everywhere else on this screen. Here it aims the
      // caller's own view rather than moving anything of ours, since this map does not scroll.
      event.preventDefault();
      this.surface().nativeElement.setPointerCapture(event.pointerId);
      this.panning = true;
      this.panTo.emit(this.pointOf(event));
      return;
    }
    if (event.button !== 0) {
      return;
    }
    this.surface().nativeElement.setPointerCapture(event.pointerId);
    const region = this.region();
    // Tested before anything else: once the region covers the sheet there is no cell outside it
    // to start a new span from, and without this the selection could never be made smaller again.
    if (this.onGrip(event)) {
      this.drag = { kind: 'resize', anchor: { x: region.x, y: region.y } };
      return;
    }
    const cell = this.cellOf(event);
    if (withinBounds(region, cell)) {
      // Move: keep the size, and keep hold of the cell that was grabbed so the rectangle does not
      // jump its own width on the first move.
      this.drag = { kind: 'move', grab: { x: cell.x - region.x, y: cell.y - region.y } };
      this.moveTo(cell);
      return;
    }
    this.drag = { kind: 'span', anchor: cell };
    this.region.set({ x: cell.x, y: cell.y, w: 1, h: 1 });
  }

  protected onMove(event: PointerEvent): void {
    if (this.panning) {
      this.panTo.emit(this.pointOf(event));
      return;
    }
    const drag = this.drag;
    if (!drag) {
      // A grip has to say it is one before it is pressed, and which corner it is depends on where
      // the region has got to — so it is set here rather than by a class.
      this.surface().nativeElement.style.cursor = this.onGrip(event) ? 'nwse-resize' : '';
      return;
    }
    const cell = this.cellOf(event);
    if (drag.kind === 'move') {
      this.moveTo(cell);
    } else {
      this.region.set(spanning(drag.anchor, cell));
    }
  }

  protected onUp(event: PointerEvent): void {
    if (this.drag || this.panning) {
      this.surface().nativeElement.releasePointerCapture(event.pointerId);
    }
    this.panning = false;
    this.drag = null;
  }

  /** Arrows move the region, shift+arrows resize it — the drag, for anyone not using a pointer. */
  protected onKey(event: KeyboardEvent): void {
    const step = (
      { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<
        string,
        [number, number] | undefined
      >
    )[event.key];
    if (!step) {
      return;
    }
    event.preventDefault();
    const [dx, dy] = step;
    const region = this.region();
    if (event.shiftKey) {
      this.region.set({
        ...region,
        w: Math.max(1, Math.min(this.cols() - region.x, region.w + dx)),
        h: Math.max(1, Math.min(this.rows() - region.y, region.h + dy)),
      });
      return;
    }
    this.region.set({
      ...region,
      x: Math.max(0, Math.min(this.cols() - region.w, region.x + dx)),
      y: Math.max(0, Math.min(this.rows() - region.h, region.y + dy)),
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
    if (!ctx) {
      return;
    }
    ctx.imageSmoothingEnabled = false;
    // Cleared rather than filled: the host carries the inset ground, so an empty cell shows it.
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(this.painter().canvas, 0, 0, canvas.width, canvas.height);
  }
}
