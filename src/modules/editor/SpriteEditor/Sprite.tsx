import { Pixel } from "@modules/editor/SpriteEditor/Pixel";

export const SpriteSize = { width: 8, height: 8 };

export class Sprite {
  private _pixels: Pixel[];

  constructor() {
    this._pixels = [];
    for (let i = 0; i < SpriteSize.width * SpriteSize.height; i++) {
        this._pixels.push(new Pixel(0, 0, 0));
    }
  }

  public setPixel(x: number, y: number, color: number): void {
    this._pixels[y * SpriteSize.width + x] = new Pixel(x, y, color);
  }

  public getPixel(x: number, y: number): Pixel {
    return this._pixels[y * SpriteSize.width + x];
  }

  public draw(): void {
    // Implement drawing logic here
  }

  public toStride(): string {
    return ""
  }
}