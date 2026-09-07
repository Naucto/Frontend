import { signal } from '@angular/core';
import { type Game, hexToRgb, SHEET_HEIGHT, SHEET_WIDTH } from '@naucto/engine';

/**
 * Keeps an RGBA copy of the sprite sheet on an offscreen canvas, patched from
 * Yjs pixel events, so every editor view (sprite canvas, sheet picker, map,
 * minimap) can `drawImage` from one source. Colour 0 is transparent.
 */
export class SheetPainter {
  readonly canvas = document.createElement('canvas');
  /** Bumps on every repaint so views can redraw in an effect. */
  readonly version = signal(0);
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private rgb = new Uint8Array(16 * 3);
  private readonly unsub: (() => void)[] = [];

  constructor(private readonly game: Game) {
    this.canvas.width = SHEET_WIDTH;
    this.canvas.height = SHEET_HEIGHT;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.image = ctx.createImageData(SHEET_WIDTH, SHEET_HEIGHT);
    this.readPalette();
    this.paintAll();
    this.unsub.push(
      game.onPixelsChange((changes) => {
        for (const c of changes) this.paintPixel(c.x, c.y, c.colour);
        this.flush();
      }),
      game.onPaletteChange(() => {
        this.readPalette();
        this.paintAll();
      }),
    );
  }

  get palette(): string[] {
    return this.game.palette;
  }

  destroy(): void {
    for (const u of this.unsub) u();
  }

  private readPalette(): void {
    const rgb = new Uint8Array(16 * 3);
    this.game.palette.forEach((hex, i) => {
      const [r, g, b] = hexToRgb(hex);
      rgb[i * 3] = r;
      rgb[i * 3 + 1] = g;
      rgb[i * 3 + 2] = b;
    });
    this.rgb = rgb;
  }

  private paintPixel(x: number, y: number, colour: number): void {
    const i = (y * SHEET_WIDTH + x) * 4;
    const d = this.image.data;
    if (colour === 0) {
      d[i + 3] = 0;
      return;
    }
    d[i] = this.rgb[colour * 3] ?? 0;
    d[i + 1] = this.rgb[colour * 3 + 1] ?? 0;
    d[i + 2] = this.rgb[colour * 3 + 2] ?? 0;
    d[i + 3] = 255;
  }

  private paintAll(): void {
    const sheet = this.game.sheet;
    for (let y = 0; y < SHEET_HEIGHT; y++)
      for (let x = 0; x < SHEET_WIDTH; x++) this.paintPixel(x, y, sheet[y * SHEET_WIDTH + x] ?? 0);
    this.flush();
  }

  private flush(): void {
    this.ctx.putImageData(this.image, 0, 0);
    this.version.update((v) => v + 1);
  }
}
