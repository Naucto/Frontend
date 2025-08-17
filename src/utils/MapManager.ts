import { convertSpritesheetToIndexArray } from "@shared/canvas/CanvasUtil";
import { Map } from "src/types/MapType";

export class MapManager {
  private _map: Map;

  private tileIndexMap: number[][];
  private spritePixelArray: Uint8Array;
  private mapPixelArray: Uint8Array;

  constructor(map: Map) {
    if (map.width <= 0 || map.height <= 0) {
      throw new Error("Map _width and height must be greater than 0");
    }

    if (map.mapData.length !== map.width * map.height * map.stride) {
      throw new Error(`Map data length (${map.mapData.length}) does not match expected size (${map.width * map.height * map.stride})`);
    }

    this._map = map;

    //FIXME should aready be converted in Project
    this.spritePixelArray = convertSpritesheetToIndexArray(map.spriteSheet);
    this.tileIndexMap = this.parseMapData();
    this.mapPixelArray = this.buildMapPixelArray();
  }

  public getMapPixelArray(): Uint8Array {
    return this.mapPixelArray;
  }

  public getTileAt(x: number, y: number): number | null {
    if (x < 0 || x >= this._map.width || y < 0 || y >= this._map.height) {
      return null;
    }
    return this.tileIndexMap[y][x];
  }

  public setTileAt(x: number, y: number, spriteIndex: number): void {
    if (x < 0 || x >= this._map.width || y < 0 || y >= this._map.height) {
      throw new Error(`Tile position (${x}, ${y}) is out of bounds`);
    }

    this.tileIndexMap[y][x] = spriteIndex;

  }

  public getMapDimensions(): { width: number; height: number } {
    return {
      width: this._map.width,
      height: this._map.height
    };
  }

  public exportMapData(): string {
    let result = "";
    for (let y = 0; y < this._map.height; y++) {
      for (let x = 0; x < this._map.width; x++) {
        const tileIndex = this.tileIndexMap[y][x];
        result += tileIndex.toString(16).padStart(2, "0");
      }
    }
    return result;
  }

  public updateMapData(new_mapData: string): void {
    if (new_mapData.length !== this._map.width * this._map.height * 2) {
      throw new Error(`New map data length (${new_mapData.length}) does not match expected size (${this._map.width * this._map.height * 2})`);
    }

    this._map.mapData = new_mapData;
    this.tileIndexMap = this.parseMapData();

    this.mapPixelArray = this.buildMapPixelArray();
  }

  // PRIVATE

  private parseMapData(): number[][] {
    const tiles: number[][] = [];

    for (let y = 0; y < this._map.height; y++) {
      tiles[y] = [];
      for (let x = 0; x < this._map.width; x++) {
        const dataIndex = (y * this._map.width + x) * this._map.stride;
        const hexValue = this._map.mapData.slice(dataIndex, dataIndex + this._map.stride);
        const tileIndex = parseInt(hexValue, 16);
        tiles[y][x] = tileIndex;
      }
    }

    return tiles;
  }

  private getSpritePixels(spriteIndex: number): Uint8Array {
    const spriteWidth = this._map.spriteSheet.spriteSize.width;
    const spriteHeight = this._map.spriteSheet.spriteSize.height;
    const spritePixelCount = spriteWidth * spriteHeight;
    const sheet_width = this._map.spriteSheet.size.width;
    const spritesPerRow = Math.floor(sheet_width / spriteWidth);

    const spriteX = (spriteIndex % spritesPerRow) * spriteWidth;
    const spriteY = Math.floor(spriteIndex / spritesPerRow) * spriteHeight;

    const spritePixels = new Uint8Array(spritePixelCount);

    for (let y = 0; y < spriteHeight; y++) {
      for (let x = 0; x < spriteWidth; x++) {
        const sheetPixelIndex = (spriteY + y) * sheet_width + (spriteX + x);
        const spritePixelIndex = y * spriteWidth + x;

        if (sheetPixelIndex < this.spritePixelArray.length) {
          spritePixels[spritePixelIndex] = this.spritePixelArray[sheetPixelIndex];
        } else {
          spritePixels[spritePixelIndex] = 0;
        }
      }
    }

    return spritePixels;
  }

  private buildMapPixelArray(): Uint8Array {
    const totalPixels = this.getMapTotalPixels();

    const mapPixels = new Uint8Array(totalPixels);

    for (let tileY = 0; tileY < this._map.height; tileY++) {
      for (let tileX = 0; tileX < this._map.width; tileX++) {
        const spriteIndex = this.tileIndexMap[tileY][tileX];
        this.copySpriteToMapPixels(tileX, tileY, mapPixels, spriteIndex);
      }
    }

    return mapPixels;
  }

  private getMapTotalPixels(): number {
    return this._map.width * this._map.height * this._map.spriteSheet.spriteSize.height * this._map.spriteSheet.spriteSize.width;
  }

  private copySpriteToMapPixels(tileX: number, tileY: number, mapPixels: Uint8Array, spriteIndex: number): void {
    const spriteWidth = this._map.spriteSheet.spriteSize.width;
    const spriteHeight = this._map.spriteSheet.spriteSize.height;
    const mapPixelWidth = this._map.width * spriteWidth;
    const totalPixels = this.getMapTotalPixels();
    const spritePixels = this.getSpritePixels(spriteIndex);

    for (let pY = 0; pY < spriteHeight; pY++) {
      for (let pX = 0; pX < spriteWidth; pX++) {

        const spritePixelIndex = pY * spriteWidth + pX;
        const mapPixelX = tileX * spriteWidth + pX;
        const mapPixelY = tileY * spriteHeight + pY;
        const mapPixelIndex = mapPixelY * mapPixelWidth + mapPixelX;

        if (mapPixelIndex < totalPixels && spritePixelIndex < spritePixels.length) {
          mapPixels[mapPixelIndex] = spritePixels[spritePixelIndex];
        }
      }
    }
  }
}
