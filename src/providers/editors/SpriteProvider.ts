import * as Y from "yjs";
import { palette } from "../../temporary/SpriteSheet.ts";
import { SpriteProviderError } from "@errors/SpriteProviderError.ts";

type SpriteFlagListener = (flags: number[]) => void;

export class SpriteProvider implements Destroyable {
  private _spriteMap: Y.Map<number>;
  private _spriteFlags: Y.Map<number>;
  private _rawListeners = new Set<RawContentListener>();
  private _listeners = new Set<ContentListener>();
  private _flagListeners = new Set<SpriteFlagListener>();
  private readonly _boundCallListeners: () => void;
  private readonly _boundCallFlagListeners: () => void;

  public palette: Uint8Array;
  public readonly spriteSize: Size;
  public readonly size: Size;
  public readonly stride: number = 1;
  public readonly spriteCount: number;

  constructor(doc: Y.Doc, spriteSize: Size = { width: 8, height: 8 }, size: Size = { width: 128, height: 128 }) {
    this._spriteMap = doc.getMap<number>("sprite");
    this._spriteFlags = doc.getMap<number>("sprite_flags");
    this.spriteSize = spriteSize;
    this.size = size;
    this.spriteCount = (size.width / spriteSize.width) * (size.height / spriteSize.height);

    this.palette = palette;
    this._boundCallListeners = this._callListeners.bind(this);
    this._boundCallFlagListeners = this._callFlagListeners.bind(this);
    this._spriteMap.observe(this._boundCallListeners);
    this._spriteFlags.observe(this._boundCallFlagListeners);
  }

  destroy(): void {
    this._listeners.clear();
    this._rawListeners.clear();
    this._flagListeners.clear();
    this._spriteMap.unobserve(this._boundCallListeners);
    this._spriteFlags.unobserve(this._boundCallFlagListeners);
  }

  private _callListeners(): void {
    const content = this.getPixelBuffer();
    this._listeners.forEach((callback) => callback(content));

    const rawContent = this.getHexRepresentation();
    this._rawListeners.forEach((callback) => callback(rawContent));
  }

  private _callFlagListeners(): void {
    const flags = this.getFlags();
    this._flagListeners.forEach((callback) => callback(flags));
  }

  isPixelInBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.size.width && y >= 0 && y < this.size.height;
  }

  isSpriteIndexInBounds(index: number): boolean {
    return index >= 0 && index < this.spriteCount;
  }

  getPixel(x: number, y: number): number {
    if (!this.isPixelInBounds(x, y)) {
      throw new SpriteProviderError(`Coordinates out of bounds: (${x}, ${y})`);
    }
    const key = this._coordToKey(x, y);
    const value = this._spriteMap.get(key) || 0;
    return value;
  }

  setPixel(x: number, y: number, color: number): void {
    const key = this._coordToKey(x, y);
    if (color == 0)
      this._spriteMap.delete(key); // Optimize network by deleting black pixels
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

  private _spriteIndexToKey(index: number): string {
    return `${index}`;
  }

  private _validateFlagValue(value: number): number {
    value = Math.trunc(value);

    if (value < 0 || value > 255) {
      throw new SpriteProviderError(`Flag value out of bounds: ${value}`);
    }

    return value;
  }

  private _validateSpriteIndex(index: number): void {
    if (!this.isSpriteIndexInBounds(index)) {
      throw new SpriteProviderError(`Sprite index out of bounds: ${index}`);
    }
  }

  private _validateBitIndex(bit: number): number {
    const normalizedBit = Math.trunc(bit);

    if (normalizedBit < 0 || normalizedBit > 7) {
      throw new SpriteProviderError(`Bit index out of bounds: ${bit}`);
    }

    return normalizedBit;
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

  getFlag(index: number): number {
    this._validateSpriteIndex(index);
    return this._spriteFlags.get(this._spriteIndexToKey(index)) ?? 0;
  }

  setFlag(index: number, value: number): void {
    this._validateSpriteIndex(index);
    const normalizedValue = this._validateFlagValue(value);
    const key = this._spriteIndexToKey(index);

    if (normalizedValue === 0) {
      this._spriteFlags.delete(key);
      return;
    }

    this._spriteFlags.set(key, normalizedValue);
  }

  getFlagBit(index: number, bit: number): boolean {
    const normalizedBit = this._validateBitIndex(bit);
    const flags = this.getFlag(index);
    const bitValue = (flags >> normalizedBit) & 1;

    return bitValue === 1;
  }

  setFlagBit(index: number, bit: number, enabled: boolean): void {
    const normalizedBit = this._validateBitIndex(bit);
    const currentValue = this.getFlag(index);
    const nextValue = enabled
      ? (currentValue | (1 << normalizedBit))
      : (currentValue & ~(1 << normalizedBit));

    this.setFlag(index, nextValue);
  }

  getFlags(): number[] {
    const flags: number[] = [];

    for (let index = 0; index < this.spriteCount; index++) {
      flags.push(this.getFlag(index));
    }

    return flags;
  }

  observe(callback: ContentListener): void {
    this._listeners.add(callback);
  }

  observeRaw(callback: RawContentListener): void {
    this._rawListeners.add(callback);
  }

  observeFlags(callback: SpriteFlagListener): void {
    this._flagListeners.add(callback);
  }
}
