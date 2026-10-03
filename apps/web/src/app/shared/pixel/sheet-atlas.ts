import { computed, type Signal, signal } from '@angular/core';
import type { Game } from '@naucto/engine';

import { SheetPainter } from './sheet-painter';

/** Where a sprite's pixels are: which canvas, and where on it. */
export interface SpriteSource {
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
}

/**
 * One painter per sheet, so a view can draw a sprite whatever sheet it is on.
 *
 * A single painter holds a single sheet, which is enough where a view looks at one — the sprite
 * canvas, the tile picker. It is not enough for a map: its tiles are sprite numbers, those run
 * across every sheet, and a tile drawn from the wrong sheet's pixels is not a wrong colour, it is
 * a different picture.
 */
export class SheetAtlas {
  private readonly painters = new Map<string, SheetPainter>();
  /** Bumped when a sheet is first asked for, so the version below picks the new painter up. */
  private readonly known = signal(0);

  /**
   * Something to read in a redraw effect: it changes whenever any of the sheets is repainted.
   *
   * A sum rather than a flag, because what matters is only that it differs from last time.
   */
  readonly version: Signal<number> = computed(() => {
    this.known();
    let n = 0;
    for (const p of this.painters.values()) n += p.version();

    return n;
  });

  constructor(private readonly game: Game) {}

  /** The painter holding this sheet, made the first time it is asked for. */
  painterFor(id: string): SheetPainter {
    const held = this.painters.get(id);
    if (held) return held;
    const made = new SheetPainter(this.game);
    made.sheetId.set(id);
    made.follow();
    this.painters.set(id, made);
    this.known.update((n) => n + 1);

    return made;
  }

  /**
   * Where a sprite number's pixels are, or nothing where no sheet answers to it.
   *
   * A number nothing claims is not drawn at all: taking the first sheet's pixels at that offset
   * would put a picture on the map that belongs to no sprite.
   */
  sourceOf(sprite: number): SpriteSource | null {
    const sheet = this.game.sheetOf(sprite);
    if (!sheet) return null;
    const { x, y } = sheet.originOf(sprite);

    return { canvas: this.painterFor(sheet.id).canvas, x, y };
  }

  destroy(): void {
    for (const p of this.painters.values()) p.destroy();
    this.painters.clear();
  }
}
