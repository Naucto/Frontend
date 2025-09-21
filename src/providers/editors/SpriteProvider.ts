import * as Y from "yjs";
import { palette } from "../../temporary/SpriteSheet.ts";

interface Size {
  width: number;
  height: number;
}

export class SpriteProvider implements Disposable {
  private _spritemap: Y.Map<number>;
  private rawListeners = new Set<(content: string) => void>();
  private listeners = new Set<(content: number[]) => void>();

  public palette: Uint8Array;
  public readonly spriteSize: Size;
  public readonly size: Size;
  public readonly stride: number = 1;

  constructor(doc: Y.Doc, spriteSize: Size = { width: 8, height: 8 }, size: Size = { width: 128, height: 128 }) {
    this._spritemap = doc.getMap<number>("sprite");
    this.spriteSize = spriteSize;
    this.size = size;

    this.palette = palette;
    this._spritemap.observe(this._callListeners.bind(this));
  }

  [Symbol.dispose](): void {
    this.listeners.clear();
    this.rawListeners.clear();
    this._spritemap.unobserve(this._callListeners.bind(this));
  }

  private _callListeners(): void {
    const content = this.getContent();
    this.listeners.forEach((callback) => callback(content));

    const rawContent = this.getRawContent();
    this.rawListeners.forEach((callback) => callback(rawContent));
  }

  getPixel(x: number, y: number): number {
    const key = this.coordToKey(x, y);
    const value = this._spritemap.get(key) || 0;
    return value;
  }

  setPixel(x: number, y: number, color: number): void {
    const key = this.coordToKey(x, y);
    this._spritemap.set(key, color);
  }

  deletePixel(x: number, y: number): void {
    const key = this.coordToKey(x, y);
    this._spritemap.set(key, 0);
  }

  private coordToKey(x: number, y: number): string {
    const key = `${x},${y}`;
    return key;
  }

  getRawContent(): string {
    let result = "";
    for (let y = 0; y < this.size.height; y++) {
      for (let x = 0; x < this.size.width; x++) {
        result += this.getPixel(x, y).toString(16);
      }
    }
    return result;
  }

  getContent(): number[] {
    const result: number[] = [];
    for (let y = 0; y < this.size.height; y++) {
      for (let x = 0; x < this.size.width; x++) {
        result.push(this.getPixel(x, y));
      }
    }
    return result;
  }

  getContentAsUint8Array(): Uint8Array {
    const arr = new Uint8Array(this.size.width * this.size.height);
    for (let y = 0; y < this.size.height; y++) {
      for (let x = 0; x < this.size.width; x++) {
        arr[y * this.size.width + x] = this.getPixel(x, y);
      }
    }
    return arr;
  }

  observe(callback: (content: number[]) => void): void {
    this.listeners.add(callback);
  }

  observeRaw(callback: (content: string) => void): void {
    this.rawListeners.add(callback);
  }
}
