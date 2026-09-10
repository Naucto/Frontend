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
import { geometrySignal } from '@app/shared/pixel/geometry.signal';
import { cssVar, type Pt } from '@app/shared/pixel/pixel-tools';
import { type SheetAtlas } from '@app/shared/pixel/sheet-atlas';
import { type SheetPainter } from '@app/shared/pixel/sheet-painter';
import { type Game, SPRITE_SIZE } from '@naucto/engine';

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
  readonly painter = input.required<SheetPainter>();
  /** Every sheet's pixels, because a map's tiles may come from any of them. */
  readonly atlas = input.required<SheetAtlas>();
  readonly viewport = input<TileViewport | null>(null);
  readonly label = input('Whole map');
  readonly jump = output<Pt>();
  private readonly geometry = geometrySignal(this.game);
  protected readonly width = computed(() => this.geometry().mapWidth * SCALE);
  protected readonly height = computed(() => this.geometry().mapHeight * SCALE);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly theme = inject(ThemeService);
  private readonly tilesVersion = signal(0);
  protected readonly dragging = signal(false);
  private raf = 0;

  constructor() {
    effect((onCleanup) => {
      const unsub = this.game().onTilesChange(() => {
        this.tilesVersion.update((v) => v + 1);
      });
      this.tilesVersion.update((v) => v + 1);
      onCleanup(unsub);
    });
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(this.raf);
    });
    effect(() => {
      this.atlas().version();
      this.tilesVersion();
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

  private draw(): void {
    const el = this.canvas().nativeElement;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = cssVar(el, '--nc-inset');
    ctx.fillRect(0, 0, this.width(), this.height());
    const game = this.game();
    const atlas = this.atlas();
    const tiles = game.tiles;
    const { mapWidth, mapHeight } = this.geometry();
    for (let y = 0; y < mapHeight; y++)
      for (let x = 0; x < mapWidth; x++) {
        const spr = tiles[y * mapWidth + x] ?? 0;
        if (!spr) continue;
        const o = atlas.sourceOf(spr);
        if (!o) continue;
        ctx.drawImage(
          o.canvas,
          o.x,
          o.y,
          SPRITE_SIZE,
          SPRITE_SIZE,
          x * SCALE,
          y * SCALE,
          SCALE,
          SCALE,
        );
      }
    const v = this.viewport();
    if (v) {
      ctx.strokeStyle = cssVar(el, '--nc-gold');
      ctx.strokeRect(
        v.x * SCALE + 0.5,
        v.y * SCALE + 0.5,
        Math.min(v.w, this.geometry().mapWidth) * SCALE - 1,
        Math.min(v.h, this.geometry().mapHeight) * SCALE - 1,
      );
    }
  }
}
