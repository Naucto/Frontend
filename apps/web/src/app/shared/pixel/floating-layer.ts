import { signal } from '@angular/core';
import type * as Y from 'yjs';

import { type Pt, type Rect, type Transform, transformBlock, withinBounds } from './pixel-tools';

type Cells = Uint8Array | Uint16Array;

/** `rect` moved inside `bounds` without resizing it, so its cells keep their stride. */
export function slideInside(rect: Rect, bounds: Rect): Rect {
  return {
    ...rect,
    x: Math.max(bounds.x, Math.min(rect.x, bounds.x + bounds.w - rect.w)),
    y: Math.max(bounds.y, Math.min(rect.y, bounds.y + bounds.h - rect.h)),
  };
}

/** `rect` cut to the part of it inside `bounds`, never thinner than one cell. */
export function cutInside(rect: Rect, bounds: Rect): Rect {
  const x = Math.max(bounds.x, rect.x);
  const y = Math.max(bounds.y, rect.y);
  return {
    x,
    y,
    w: Math.max(1, Math.min(bounds.x + bounds.w, rect.x + rect.w) - x),
    h: Math.max(1, Math.min(bounds.y + bounds.h, rect.y + rect.h) - y),
  };
}

/**
 * Where a turned block lands when it no longer fits.
 *
 * `cut` keeps its top-left corner and loses what would land past the edge; `slide` keeps every cell
 * and moves back from the edge, away from where it was.
 */
export type Edge = 'cut' | 'slide';

/** The cells a layer is lifted from and settled into: a sheet's pixels, a map's tiles. */
export interface CellSurface {
  read(x: number, y: number): number;
  /** Unchecked; the layer holds a write to `bounds` wherever an overhang has to be dropped. */
  write(x: number, y: number, value: number): void;
  /** What may be written. A placed or carried layer is slid back inside it. */
  bounds(): Rect;
  /** Runs every write of one edit as one change. */
  transact(edit: () => void): void;
  /**
   * The manager a settle and a turn are fenced off in, so each is its own undo step: settling
   * happens on the press that starts the next stroke, which would otherwise be undone with it.
   */
  undo(): Y.UndoManager | null;
}

/**
 * Lifting, placing, carrying, settling and turning a rectangle of cells over a surface.
 *
 * A pasted block floats: while it is placed the surface is exactly as it was, so backing out costs
 * nothing and what it covers is still there underneath. It becomes part of the surface only when
 * it is settled.
 */
export class FloatingLayer<T extends Cells> {
  readonly placed = signal<{ rect: Rect; cells: T } | null>(null);

  constructor(
    private readonly surface: CellSurface,
    private readonly cellType: new (length: number) => T,
    /** Applies to a turn only; a paste and a carry always slide, so nothing placed is cut. */
    private readonly turnEdge: Edge,
  ) {}

  /** The cells under a rectangle, row-major, as the surface holds them now. */
  lift(rect: Rect): T {
    const cells = new this.cellType(rect.w * rect.h);
    for (let y = 0; y < rect.h; y++) {
      for (let x = 0; x < rect.w; x++) {
        cells[y * rect.w + x] = this.surface.read(rect.x + x, rect.y + y);
      }
    }
    return cells;
  }

  private clear(rect: Rect): void {
    for (let y = 0; y < rect.h; y++) {
      for (let x = 0; x < rect.w; x++) {
        this.surface.write(rect.x + x, rect.y + y, 0);
      }
    }
  }

  /** `cells`, `stride` wide, written over `rect`; whatever falls outside the bounds is dropped. */
  private writeBlock(rect: Rect, cells: T, stride: number): void {
    const bounds = this.surface.bounds();
    for (let y = 0; y < rect.h; y++) {
      for (let x = 0; x < rect.w; x++) {
        const point = { x: rect.x + x, y: rect.y + y };
        if (withinBounds(bounds, point)) {
          this.surface.write(point.x, point.y, cells[y * stride + x] ?? 0);
        }
      }
    }
  }

  /** Floats `cells` at `rect`, slid inside the bounds, and returns where it landed. */
  place(rect: Rect, cells: T): Rect {
    const placed = slideInside(rect, this.surface.bounds());
    this.placed.set({ rect: placed, cells });
    return placed;
  }

  /** Moves the placed layer by `offset`, slid inside the bounds. Null when there is none. */
  carry(offset: Pt): Rect | null {
    const layer = this.placed();
    if (!layer) {
      return null;
    }
    return this.place(
      { ...layer.rect, x: layer.rect.x + offset.x, y: layer.rect.y + offset.y },
      layer.cells,
    );
  }

  /** Writes the placed layer as one undo step and returns where it went. Null when there is none. */
  settle(): Rect | null {
    const layer = this.placed();
    if (!layer) {
      return null;
    }
    this.placed.set(null);
    this.surface.undo()?.stopCapturing();
    this.surface.transact(() => {
      this.writeBlock(layer.rect, layer.cells, layer.rect.w);
    });
    this.surface.undo()?.stopCapturing();
    return layer.rect;
  }

  /** Drops the placed layer. Nothing was written, so there is nothing to undo. */
  discard(): boolean {
    if (!this.placed()) {
      return false;
    }
    this.placed.set(null);
    return true;
  }

  /** Cuts `cells` from `rect` and lays them down at `offset`, together: a move never leaves a copy. */
  move(rect: Rect, cells: T, offset: Pt): void {
    this.surface.transact(() => {
      this.clear(rect);
      this.writeBlock({ ...rect, x: rect.x + offset.x, y: rect.y + offset.y }, cells, rect.w);
    });
  }

  /**
   * Turns the cells under `rect` over in place, as one undo step, and returns where they landed.
   * A rotation swaps the rectangle's sides; `turnEdge` says what happens when that no longer fits.
   */
  transform(rect: Rect, op: Transform): Rect {
    const turned = transformBlock({ cells: this.lift(rect), w: rect.w, h: rect.h }, op);
    const landed = { x: rect.x, y: rect.y, w: turned.w, h: turned.h };
    const bounds = this.surface.bounds();
    const target =
      this.turnEdge === 'cut' ? cutInside(landed, bounds) : slideInside(landed, bounds);
    this.surface.undo()?.stopCapturing();
    this.surface.transact(() => {
      this.clear(rect);
      this.writeBlock(target, turned.cells, turned.w);
    });
    this.surface.undo()?.stopCapturing();
    return target;
  }
}
