import { mapData } from "src/temporary/map.ts";
import { SpriteProvider } from "./SpriteProvider.ts";
import { MapProviderError } from "@errors/MapProviderError.ts";
import * as Y from "yjs";

interface Size {
  width: number;
  height: number;
}

export class MapProvider implements Disposable {
  private _tilemap: Y.Map<number>;
  public width: number;
  public height: number;
  public stride: number;

  private rawListeners = new Set<(content: string) => void>();
  private listeners = new Set<(content: number[]) => void>();

  private _sprite: SpriteProvider;
  private readonly _mapDataLength: number;

  constructor(ydoc: Y.Doc, size: Size, stride: number, sprite: SpriteProvider) {
    if (size.width <= 0 || size.height <= 0) {
      throw new MapProviderError("Map width and height must be greater than 0");
    }

    this._tilemap = ydoc.getMap<number>("map");
    this._tilemap.observe(this._callListeners.bind(this));

    this.width = size.width;
    this.height = size.height;
    this.stride = stride;

    const data = this._parseMapData(mapData);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.setTileAt({ x, y }, data[y][x]);
      }
    }

    this._mapDataLength = size.width * size.height * stride;
    if (mapData.length !== this._mapDataLength) {
      throw new MapProviderError(`Map data length (${mapData.length}) does not match expected size (${this._mapDataLength})`);
    }

    this._sprite = sprite;
  }

  [Symbol.dispose](): void {
    this.listeners.clear();
    this.rawListeners.clear();
    this._tilemap.unobserve(this._callListeners.bind(this));
  }

  private _callListeners(): void {
    const content = this.getContent();
    this.listeners.forEach((callback) => callback(content));

    const rawContent = this.getRawContent();
    this.rawListeners.forEach((callback) => callback(rawContent));
  }

  getTileAt(pos: Point2D): number {
    const key = this.coordToKey(pos);
    const value = this._tilemap.get(key) || 0;
    return value;
  }

  setTileAt(pos: Point2D, spriteIndex: number): void {
    const key = this.coordToKey(pos);
    this._tilemap.set(key, spriteIndex);
  }

  deleteTileAt(pos: Point2D): void {
    const key = this.coordToKey(pos);
    this._tilemap.set(key, 0);
  }

  private coordToKey(pos: Point2D): string {
    const key = `${pos.x},${pos.y}`;
    return key;
  }

  public getMapDimensions(): Point2D {
    return {
      x: this.width,
      y: this.height
    };
  }

  getRawContent(): string {
    let result = "";
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        result += this.getTileAt({ x, y }).toString(16);
      }
    }
    return result;
  }

  getContent(): number[] {
    const result: number[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        result.push(this.getTileAt({ x, y }));
      }
    }
    return result;
  }

  private _getSpritePixels(spriteIndex: number, spritepixelarray: Uint8Array<ArrayBufferLike>): Uint8Array {
    const spriteWidth = this._sprite.spriteSize.width;
    const spriteHeight = this._sprite.spriteSize.height;
    const spritePixelCount = spriteWidth * spriteHeight;
    const sheetWidth = this._sprite.size.width;
    const spritesPerRow = Math.floor(sheetWidth / spriteWidth);

    const spriteX = (spriteIndex % spritesPerRow) * spriteWidth;
    const spriteY = Math.floor(spriteIndex / spritesPerRow) * spriteHeight;

    const spritePixels = new Uint8Array(spritePixelCount);

    for (let y = 0; y < spriteHeight; y++) {
      for (let x = 0; x < spriteWidth; x++) {
        const sheetPixelIndex = (spriteY + y) * sheetWidth + (spriteX + x);
        const spritePixelIndex = y * spriteWidth + x;

        if (sheetPixelIndex < spritepixelarray.length) {
          spritePixels[spritePixelIndex] = spritepixelarray[sheetPixelIndex];
        } else {
          spritePixels[spritePixelIndex] = 0;
        }
      }
    }

    return spritePixels;
  }

  private _copySpriteToMapPixels(tile: Point2D, mapPixels: Uint8Array, spriteIndex: number, spritepixelarray: Uint8Array<ArrayBufferLike>): void {
    const spriteWidth = this._sprite.spriteSize.width;
    const spriteHeight = this._sprite.spriteSize.height;
    const mapPixelWidth = this.width * spriteWidth;
    const totalPixels = this._sprite.spriteSize.height * this._sprite.spriteSize.width * this.width * this.height ;
    const spritePixels = this._getSpritePixels(spriteIndex, spritepixelarray);

    for (let pY = 0; pY < spriteHeight; pY++) {
      for (let pX = 0; pX < spriteWidth; pX++) {
        const spritePixelIndex = pY * spriteWidth + pX;
        const mapPixelX = tile.x * spriteWidth + pX;
        const mapPixelY = tile.y * spriteHeight + pY;
        const mapPixelIndex = mapPixelY * mapPixelWidth + mapPixelX;

        if (mapPixelIndex < totalPixels && spritePixelIndex < spritePixels.length) {
          mapPixels[mapPixelIndex] = spritePixels[spritePixelIndex];
        }
      }
    }
  }

  private _getMapTotalPixels(): number {
    return (
      this.width *
      this.height *
      this._sprite.spriteSize.height *
      this._sprite.spriteSize.width
    );
  }

  getContentAsUint8Array(): Uint8Array {
    const arr = new Uint8Array(this._getMapTotalPixels());
    const spritepixelarray = this._sprite.getContentAsUint8Array();
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const key = this.coordToKey({ x, y });
        const spriteIndex = this._tilemap.get(key) || 0;
        this._copySpriteToMapPixels({ x, y }, arr, spriteIndex, spritepixelarray)!;
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

  // PRIVATE

  private _parseMapData(mapData: string): number[][] {
    const tiles: number[][] = new Array(this.height);

    for (let y = 0; y < this.height; y++) {
      tiles[y] = new Array(this.width);

      for (let x = 0; x < this.width; x++) {
        const dataIndex = (y * this.width + x) * this.stride;
        const hexValue = mapData.slice(dataIndex, dataIndex + this.stride);
        const tileIndex = parseInt(hexValue, 16);
        tiles[y][x] = tileIndex;
      }
    }

    return tiles;
  }
}
