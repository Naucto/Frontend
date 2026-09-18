import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ThemeService } from '@app/core/theme/theme.service';
import { collectionsSignal } from '@app/shared/pixel/collections.signal';
import { geometrySignal } from '@app/shared/pixel/geometry.signal';
import { cssVar, type Pt } from '@app/shared/pixel/pixel-tools';
import { type SheetAtlas } from '@app/shared/pixel/sheet-atlas';
import { type SheetPainter } from '@app/shared/pixel/sheet-painter';
import { FIRST_MAP_ID, type Game, type GameMap, SPRITE_SIZE } from '@naucto/engine';

import { type TileViewport } from './map-canvas.component';

const SCALE = 3;

/** WHOLE MAP: every tile as a 3×3 block plus the visible viewport; click to jump. */
@Component({
  selector: 'nc-minimap',
  template: `
    <canvas
      #canvas
      class="pixelated block w-full"
      [class]="dragging() ? 'cursor-grabbing' : 'cursor-pointer'"
      [width]="width()"
      [height]="height()"
      role="img"
      [attr.aria-label]="label()"
      (pointerdown)="onDown($event)"
      (pointermove)="onMove($event)"
      (pointerup)="onUp($event)"
      (pointercancel)="onUp($event)"
      (contextmenu)="$event.preventDefault()"
    ></canvas>
  `,
  host: { class: 'block rounded-xs border border-line bg-inset' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MinimapComponent {
  readonly game = input.required<Game>();
  /** Which of the game's maps is shown, as the canvas beside it. */
  readonly mapId = input(FIRST_MAP_ID);
  readonly painter = input.required<SheetPainter>();
  /** Every sheet's pixels, because a map's tiles may come from any of them. */
  readonly atlas = input.required<SheetAtlas>();
  readonly viewport = input<TileViewport | null>(null);
  readonly label = input('Whole map');
  readonly jump = output<Pt>();
  private readonly geometry = geometrySignal(this.game);
  private readonly collections = collectionsSignal(this.game);
  private readonly gameMap = computed(() => {
    this.collections();
    this.geometry();
    const maps = this.game().maps;

    return maps.find((m) => m.id === this.mapId()) ?? maps[0];
  });
  protected readonly width = computed(() => (this.gameMap()?.width ?? 0) * SCALE);
  protected readonly height = computed(() => (this.gameMap()?.height ?? 0) * SCALE);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly theme = inject(ThemeService);
  /**
   * The map at three pixels a tile, kept off screen and patched a tile at a time.
   *
   * Showing it is then one copy, so the viewport rectangle can follow every scroll of the canvas
   * beside it without a tile being drawn again.
   */
  private readonly picture = document.createElement('canvas');
  /** Cells to patch on the next frame, or null when the whole picture is to be painted. */
  private dirty: Set<number> | null = null;
  protected readonly dragging = signal(false);
  private raf = 0;

  constructor() {
    effect((onCleanup) => {
      const unsub = this.game().onTilesChange((changes) => {
        const map = this.gameMap();
        if (!map) return;
        let any = false;
        for (const c of changes) {
          if (c.map !== map.id) continue;
          this.dirty?.add(c.y * map.width + c.x);
          any = true;
        }
        if (any) this.requestDraw();
      });
      onCleanup(unsub);
    });
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(this.raf);
    });
    effect(() => {
      this.atlas().version();
      this.gameMap();
      // Colours are read from CSS custom properties at paint time; repaint when the theme flips.
      this.theme.effective();
      untracked(() => {
        this.dirty = null;
        this.requestDraw();
      });
    });
    effect(() => {
      this.viewport();
      untracked(() => {
        this.requestDraw();
      });
    });
  }

  protected onDown(e: PointerEvent): void {
    if (e.button !== 0 && e.button !== 1) return;
    // The middle button is the pan gesture everywhere else on this screen, so it works here too.
    e.preventDefault();
    this.canvas().nativeElement.setPointerCapture(e.pointerId);
    this.dragging.set(true);
    this.aim(e);
  }

  protected onMove(e: PointerEvent): void {
    if (this.dragging()) this.aim(e);
  }

  protected onUp(e: PointerEvent): void {
    if (!this.dragging()) return;
    this.dragging.set(false);
    const el = this.canvas().nativeElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  }

  /**
   * The tile under the pointer.
   *
   * Each axis takes its own factor. The element is stretched to the panel's width while its height
   * stays at what it was drawn, so one factor for both put every vertical aim short of where it was
   * pointed, by more the further down it was.
   */
  private aim(e: PointerEvent): void {
    const r = this.canvas().nativeElement.getBoundingClientRect();
    this.jump.emit({
      x: Math.floor(((e.clientX - r.left) * this.width()) / r.width / SCALE),
      y: Math.floor(((e.clientY - r.top) * this.height()) / r.height / SCALE),
    });
  }

  private requestDraw(): void {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => {
      const cells = this.dirty;
      this.dirty = new Set();
      if (cells) this.patch(cells);
      else this.paint();
      this.draw();
    });
  }

  /** One cell of the picture. Its floor first: a cell whose tile went is blank again. */
  private paintTile(
    ctx: CanvasRenderingContext2D,
    atlas: SheetAtlas,
    inset: string,
    map: GameMap,
    x: number,
    y: number,
  ): void {
    ctx.fillStyle = inset;
    ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
    const spr = map.tiles[y * map.width + x] ?? 0;
    if (!spr) return;
    const o = atlas.sourceOf(spr);
    if (!o) return;
    ctx.drawImage(o.canvas, o.x, o.y, SPRITE_SIZE, SPRITE_SIZE, x * SCALE, y * SCALE, SCALE, SCALE);
  }

  /** The whole picture, at the map's size. */
  private paint(): void {
    const map = this.gameMap();
    const w = this.width();
    const h = this.height();
    if (this.picture.width !== w) this.picture.width = w;
    if (this.picture.height !== h) this.picture.height = h;
    const ctx = this.picture.getContext('2d');
    if (!ctx || !map) return;
    ctx.imageSmoothingEnabled = false;
    const atlas = this.atlas();
    const inset = cssVar(this.canvas().nativeElement, '--nc-inset');
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) this.paintTile(ctx, atlas, inset, map, x, y);
  }

  /** The cells changed since the last frame, and only those. */
  private patch(cells: Set<number>): void {
    const map = this.gameMap();
    const ctx = this.picture.getContext('2d');
    if (!ctx || !map) return;
    ctx.imageSmoothingEnabled = false;
    const atlas = this.atlas();
    const inset = cssVar(this.canvas().nativeElement, '--nc-inset');
    for (const i of cells) {
      const x = i % map.width;
      const y = (i - x) / map.width;
      if (y < map.height) this.paintTile(ctx, atlas, inset, map, x, y);
    }
  }

  /** The picture, then the viewport over it. */
  private draw(): void {
    const el = this.canvas().nativeElement;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    // An empty picture cannot be a source, and there is nothing to show in its place.
    if (!this.picture.width || !this.picture.height) return;
    ctx.drawImage(this.picture, 0, 0);
    const v = this.viewport();
    const map = this.gameMap();
    if (v && map) {
      ctx.strokeStyle = cssVar(el, '--nc-gold');
      ctx.strokeRect(
        v.x * SCALE + 0.5,
        v.y * SCALE + 0.5,
        Math.min(v.w, map.width) * SCALE - 1,
        Math.min(v.h, map.height) * SCALE - 1,
      );
    }
  }
}
