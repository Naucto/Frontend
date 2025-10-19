import * as Y from "yjs";
import { palette } from "../../temporary/SpriteSheet.ts";

export class SpriteProvider implements Disposable {
  private _spriteMap: Y.Map<number>;
  private _rawListeners = new Set<RawContentListener>();
  private _listeners = new Set<ContentListener>();

  public palette: Uint8Array;
  public readonly spriteSize: Size;
  public readonly size: Size;
  public readonly stride: number = 1;

  constructor(doc: Y.Doc, spriteSize: Size = { width: 8, height: 8 }, size: Size = { width: 128, height: 128 }) {
    this._spriteMap = doc.getMap<number>("sprite");
    this.spriteSize = spriteSize;
    this.size = size;

    this.palette = palette;
    this._spriteMap.observe(this._callListeners.bind(this));
  }

  [Symbol.dispose](): void {
    this._listeners.clear();
    this._rawListeners.clear();
    this._spriteMap.unobserve(this._callListeners.bind(this));
  }

  private _callListeners(): void {
    const content = this.getPixelBuffer();
    this._listeners.forEach((callback) => callback(content));

    const rawContent = this.getHexRepresentation();
    this._rawListeners.forEach((callback) => callback(rawContent));
  }

  getPixel(x: number, y: number): number {
    const key = this._coordToKey(x, y);
    const value = this._spriteMap.get(key) || 0;
    return value;
  }

  setPixel(x: number, y: number, color: number): void {
    const key = this._coordToKey(x, y);
    this._spriteMap.set(key, color);
  }

  deletePixel(x: number, y: number): void {
    const key = this._coordToKey(x, y);
    this._spriteMap.set(key, 0);
  }

  private _coordToKey(x: number, y: number): string {
    const key = `${x},${y}`;
    return key;
  }

  getHexRepresentation(): string {
    let result = "";
    for (let y = 0; y < this.size.height; y++) {
      for (let x = 0; x < this.size.width; x++) {
        result += this.getPixel(x, y).toString(16);
      }
    }
    return result;
  }

  getPixelBuffer(): number[] {
    const result: number[] = [];
    for (let y = 0; y < this.size.height; y++) {
      for (let x = 0; x < this.size.width; x++) {
        result.push(this.getPixel(x, y));
      }
    }
    return result;
  }

  getU8PixelBuffer(): Uint8Array {
    return Uint8Array.from(this.getPixelBuffer());
  }

  observe(callback: ContentListener): void {
    this._listeners.add(callback);
  }

  observeRaw(callback: RawContentListener): void {
    this._rawListeners.add(callback);
  }
}
