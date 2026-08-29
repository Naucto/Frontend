import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
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

const SCALE = 3;

/** The whole 128×128 sheet at ×3 in a 2:1 viewport; click picks a sprite block. Used by ART (sheet) and MAP (tile picker). */
@Component({
  selector: 'nc-sheet-view',
  template: `
    <canvas
      #canvas
      class="pixelated block w-full cursor-crosshair"
      [width]="width"
      [height]="height"
      role="listbox"
      [attr.aria-label]="label()"
      (click)="onClick($event)"
    ></canvas>
  `,
  // The sheet fits the panel's width and scrolls vertically: a horizontal scrollbar under a
  // sprite sheet hides the very cells you are trying to pick.
  host: {
    class:
      'block h-[192px] overflow-x-hidden overflow-y-auto rounded-xs border border-line bg-inset',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SheetViewComponent {
  readonly painter = input.required<SheetPainter>();
  readonly value = model(1);
  readonly size = input(1);
  /** Which 32px band (0..3) to scroll into view. */
  readonly band = input(0);
  readonly label = input('Sprite sheet');
  protected readonly width = SHEET_WIDTH * SCALE;
  protected readonly height = SHEET_HEIGHT * SCALE;
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly theme = inject(ThemeService);
  private raf = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(this.raf);
    });
    effect(() => {
      this.painter().version();
      this.value();
      this.size();
      // Colours are read from CSS custom properties at paint time; repaint when the theme flips.
      this.theme.effective();
      untracked(() => {
        cancelAnimationFrame(this.raf);
        this.raf = requestAnimationFrame(() => {
          this.draw();
        });
      });
    });
    effect(() => {
      const band = this.band();
      const el = this.canvas().nativeElement;
      // The canvas is width-fitted, so a band offset in sheet pixels has to be converted through
      // the rendered width before it means anything to scrollTo.
      const rendered = el.getBoundingClientRect().width || this.width;
      this.host.nativeElement.scrollTo({
        top: (band * 32 * rendered) / SHEET_WIDTH,
        behavior: 'smooth',
      });
    });
  }

  protected onClick(e: MouseEvent): void {
    const r = this.canvas().nativeElement.getBoundingClientRect();
    const cell = (r.width || this.width) / SPRITES_PER_ROW;
    const max = SPRITES_PER_ROW - this.size();
    const cx = Math.max(0, Math.min(max, Math.floor((e.clientX - r.left) / cell)));
    const cy = Math.max(0, Math.min(max, Math.floor((e.clientY - r.top) / cell)));
    this.value.set(cy * SPRITES_PER_ROW + cx);
  }

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
    const v = this.value();
    const x = (v % SPRITES_PER_ROW) * cell;
    const y = Math.floor(v / SPRITES_PER_ROW) * cell;
    const s = this.size() * cell;
    ctx.strokeStyle = cssVar(el, '--nc-gold');
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
    ctx.lineWidth = 1;
  }
}
