import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
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
import { cssVar, type Pt } from '@app/shared/pixel/pixel-tools';
import { type SheetPainter } from '@app/shared/pixel/sheet-painter';
import { type Game, MAP_HEIGHT, MAP_WIDTH, SPRITE_SIZE } from '@naucto/engine';

import { type TileViewport } from './map-canvas.component';

const SCALE = 3;

/** WHOLE MAP: every tile as a 3×3 block plus the visible viewport; click to jump. */
@Component({
  selector: 'nc-minimap',
  template: `
    <canvas
      #canvas
      class="pixelated block w-full cursor-pointer"
      [width]="width"
      [height]="height"
      role="img"
      [attr.aria-label]="label()"
      (click)="onClick($event)"
    ></canvas>
  `,
  host: { class: 'block rounded-xs border border-line bg-inset' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MinimapComponent {
  readonly game = input.required<Game>();
  readonly painter = input.required<SheetPainter>();
  readonly viewport = input<TileViewport | null>(null);
  readonly label = input('Whole map');
  readonly jump = output<Pt>();
  protected readonly width = MAP_WIDTH * SCALE;
  protected readonly height = MAP_HEIGHT * SCALE;
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly theme = inject(ThemeService);
  private readonly tilesVersion = signal(0);
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
      this.painter().version();
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

  protected onClick(e: MouseEvent): void {
    const r = this.canvas().nativeElement.getBoundingClientRect();
    const sx = this.width / r.width;
    this.jump.emit({
      x: Math.floor(((e.clientX - r.left) * sx) / SCALE),
      y: Math.floor(((e.clientY - r.top) * sx) / SCALE),
    });
  }

  private draw(): void {
    const el = this.canvas().nativeElement;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = cssVar(el, '--nc-inset');
    ctx.fillRect(0, 0, this.width, this.height);
    const game = this.game();
    const sheet = this.painter().canvas;
    const tiles = game.tiles;
    for (let y = 0; y < MAP_HEIGHT; y++)
      for (let x = 0; x < MAP_WIDTH; x++) {
        const spr = tiles[y * MAP_WIDTH + x] ?? 0;
        if (!spr) continue;
        const o = game.spriteOrigin(spr);
        ctx.drawImage(
          sheet,
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
        Math.min(v.w, MAP_WIDTH) * SCALE - 1,
        Math.min(v.h, MAP_HEIGHT) * SCALE - 1,
      );
    }
  }
}
