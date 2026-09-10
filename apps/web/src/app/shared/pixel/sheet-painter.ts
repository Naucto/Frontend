import { signal } from '@angular/core';
import { FIRST_SHEET_ID, type Game, hexToRgb, type Sheet } from '@naucto/engine';

/**
 * Keeps an RGBA copy of the sprite sheet on an offscreen canvas, patched from
 * Yjs pixel events, so every editor view (sprite canvas, sheet picker, map,
 * minimap) can `drawImage` from one source. Colour 0 is transparent.
 */
export class SheetPainter {
  /** Which sheet this mirrors. Setting it takes effect on the next {@link follow}. */
  readonly sheetId = signal(FIRST_SHEET_ID);
  private shown = FIRST_SHEET_ID;
  readonly canvas = document.createElement('canvas');
  /** Bumps on every repaint so views can redraw in an effect. */
  readonly version = signal(0);
  private readonly ctx: CanvasRenderingContext2D;
  private image: ImageData;
  private rgb = new Uint8Array(16 * 3);
  private readonly unsub: (() => void)[] = [];

  constructor(private readonly game: Game) {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.image = ctx.createImageData(1, 1);
    this.resize();
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
      game.onGeometryChange(() => {
        this.resize();
        this.paintAll();
      }),
      // A sheet resized or removed elsewhere changes the shape of what this is looking at.
      game.onCollectionsChange(() => {
        this.follow();
      }),
    );
  }

  /** Matches the buffer to the sheet. Setting a canvas dimension also clears it, so a repaint follows. */
  private resize(): void {
    const sheetWidth = this.sheet?.width ?? this.game.geometry.sheetWidth;
    const sheetHeight = this.sheet?.height ?? this.game.geometry.sheetHeight;
    if (this.canvas.width === sheetWidth && this.canvas.height === sheetHeight) return;
    this.canvas.width = sheetWidth;
    this.canvas.height = sheetHeight;
    this.image = this.ctx.createImageData(sheetWidth, sheetHeight);
  }

  /**
   * Repaints if the sheet in hand has changed.
   *
   * Nothing here watches the id, so without this the buffer goes on showing whichever sheet it was
   * last filled from.
   */
  follow(): void {
    const id = this.sheetId();
    const sheet = this.sheet;
    if (
      id === this.shown &&
      sheet?.width === this.canvas.width &&
      sheet.height === this.canvas.height
    )
      return;
    this.shown = id;
    this.resize();
    this.paintAll();
  }

  get palette(): string[] {
    return this.game.palette;
  }

  /** The sheet this mirrors, in cells. Views hold a painter, not the game it came from. */
  get cols(): number {
    return this.sheet?.cols ?? this.game.geometry.spritesPerRow;
  }

  get rows(): number {
    return this.sheet?.rows ?? this.game.geometry.spriteRows;
  }

  private get sheet(): Sheet | undefined {
    const id = this.sheetId();
    const sheets = this.game.sheets;
    return sheets.find((s) => s.id === id) ?? sheets[0];
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
    const i = (y * this.canvas.width + x) * 4;
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
    const sheet = this.sheet;
    if (!sheet) return;
    for (let y = 0; y < sheet.height; y++)
      for (let x = 0; x < sheet.width; x++) this.paintPixel(x, y, sheet.getPixel(x, y));
    this.flush();
  }

  private flush(): void {
    this.ctx.putImageData(this.image, 0, 0);
    this.version.update((v) => v + 1);
  }
}
