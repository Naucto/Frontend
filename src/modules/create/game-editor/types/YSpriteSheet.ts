import * as Y from "yjs";

export class YSpriteSheet {
  private _spriteMap: Y.Map<number>;
  private readonly _width: number;
  private readonly _height: number;

  constructor(doc: Y.Doc, name: string, width: number = 128, height: number = 128) {
    this._spriteMap = doc.getMap<number>(name);
    this._width = width;
    this._height = height;
  }

  getPixel(x: number, y: number): number {
    const key = this.coordToKey(x, y);
    const value = this._spriteMap.get(key) || 0;
    return value;
  }

  setPixel(x: number, y: number, color: number): void {
    const key = this.coordToKey(x, y);
    this._spriteMap.set(key, color);
  }

  deletePixel(x: number, y: number): void {
    const key = this.coordToKey(x, y);
    this._spriteMap.set(key, 0);
  }

  private coordToKey(x: number, y: number): string {
    const key = `${x},${y}`;
    return key;
  }

  toString(): string {
    let result = "";
    for (let y = 0; y < this._height; y++) {
      for (let x = 0; x < this._width; x++) {
        result += this.getPixel(x, y).toString(16);
      }
    }
    return result;
  }

  toArray(): number[] {
    const result: number[] = [];
    for (let y = 0; y < this._height; y++) {
      for (let x = 0; x < this._width; x++) {
        result.push(this.getPixel(x, y));
      }
    }
    return result;
  }

  fromString(data: string): void {
    let index = 0;
    for (let y = 0; y < this._height; y++) {
      for (let x = 0; x < this._width; x++) {
        if (index < data.length) {
          const color = parseInt(data[index], 16);
          this.setPixel(x, y, color);
          index++;
        }
      }
    }
  }

  observe(callback: (event: Y.YMapEvent<number>) => void): void {
    this._spriteMap.observe(callback);
  }
}
