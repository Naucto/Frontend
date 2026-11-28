import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  type Decision,
  type DiffKind,
  type SheetCellChange,
  type SheetFlagsChange,
  SPRITE_SIZE,
} from '@naucto/engine';
import { ChangeChipComponent } from '@naucto/ui';

import { DiffStore } from './diff.store';
import { HunkActionsComponent } from './hunk-actions.component';
import { SpriteThumbComponent } from './sprite-thumb.component';

/** The part of the sheet a surface shows, in sheet pixels. */
export interface SheetFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Cell {
  key: string;
  col: number;
  row: number;
  kind: DiffKind;
  pixels: SheetCellChange | null;
  flags: SheetFlagsChange | null;
  decision: Decision;
  /** Where it sits on the surface, as shares of its width and height. */
  left: number;
  top: number;
  width: number;
  height: number;
}

const FRAME: Record<DiffKind, string> = {
  NEW: 'shadow-[inset_0_0_0_3px_var(--nc-jade)]',
  EDIT: 'shadow-[inset_0_0_0_3px_var(--nc-orange)]',
  DELETED: 'shadow-[inset_0_0_0_3px_var(--nc-hot)]',
};

/**
 * The changes of a sheet, over a surface that shows it: each changed sprite framed in the colour
 * of its kind with its chip on the corner, a removed one hatched, and an F inside where its flags
 * change. Pointing at a sprite shows it before and after; a click pins that card with its accept
 * and reject, until a click elsewhere.
 */
@Component({
  selector: 'nc-sheet-diff-layer',
  imports: [TranslocoDirective, ChangeChipComponent, HunkActionsComponent, SpriteThumbComponent],
  templateUrl: './sheet-diff-layer.component.html',
  host: {
    class: 'pointer-events-none absolute inset-0 z-10 block',
    '(document:pointerdown)': 'pinned.set(null)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SheetDiffLayerComponent {
  readonly sheetId = input.required<string>();
  readonly frame = input.required<SheetFrame>();
  /** Chips on the corners: the canvas has room for them, the small sheet map does not. */
  readonly chips = input(true);
  protected readonly diff = inject(DiffStore);
  protected readonly frameOf = FRAME;
  protected readonly hovered = signal<string | null>(null);
  protected readonly pinned = signal<string | null>(null);

  protected readonly palette = computed(() => {
    this.diff.decisions();
    return this.diff.shown().palette;
  });

  protected readonly cells = computed<Cell[]>(() => {
    const frame = this.frame();
    const byCell = new Map<string, Cell>();
    for (const item of this.diff.itemsOf('art')) {
      if (
        (item.type !== 'sheet-cell' && item.type !== 'sheet-flags') ||
        item.sheetId !== this.sheetId()
      ) {
        continue;
      }
      const at = `${String(item.col)},${String(item.row)}`;
      const cell = byCell.get(at) ?? {
        key: item.key,
        col: item.col,
        row: item.row,
        kind: 'EDIT' as DiffKind,
        pixels: null,
        flags: null,
        decision: 'pending' as Decision,
        left: ((item.col * SPRITE_SIZE - frame.x) / frame.w) * 100,
        top: ((item.row * SPRITE_SIZE - frame.y) / frame.h) * 100,
        width: (SPRITE_SIZE / frame.w) * 100,
        height: (SPRITE_SIZE / frame.h) * 100,
      };
      if (item.type === 'sheet-cell') {
        cell.pixels = item;
        cell.kind = item.kind;
        cell.key = item.key;
      } else {
        cell.flags = item;
      }
      byCell.set(at, cell);
    }
    const decisions = this.diff.decisions();
    return [...byCell.values()]
      .map((cell) => ({
        ...cell,
        decision: decisions.get(cell.pixels?.key ?? cell.flags?.key ?? '') ?? 'pending',
      }))
      .filter(
        (cell) =>
          cell.left + cell.width > 0 &&
          cell.top + cell.height > 0 &&
          cell.left < 100 &&
          cell.top < 100,
      );
  });

  /** The card shown: the pinned sprite, or the one pointed at. */
  protected readonly card = computed(() => {
    const key = this.pinned() ?? this.hovered();
    return this.cells().find((cell) => cell.key === key) ?? null;
  });

  protected keysOf(cell: Cell): string[] {
    return [cell.pixels?.key, cell.flags?.key].filter((key): key is string => !!key);
  }

  protected pin(cell: Cell, event: Event): void {
    event.stopPropagation();
    this.pinned.set(cell.key);
    this.diff.currentKey.set(cell.key);
  }

  protected readonly empty = new Uint8Array(SPRITE_SIZE * SPRITE_SIZE);
}
