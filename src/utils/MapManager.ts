import { convertSpritesheetToIndexArray } from "@shared/canvas/CanvasUtil";
import { MapManagerError } from "src/errors/MapManagerError";
import { Map } from "src/types/MapType";

export class MapManager {
  private _map: Map;

  private _tileIndexMap: number[][];
  private _spritePixelArray: Uint8Array;
  private _mapPixelArray: Uint8Array;
  private readonly _mapDataLength: number;

  constructor(map: Map) {
    if (map.width <= 0 || map.height <= 0) {
      throw new MapManagerError("Map _width and height must be greater than 0");
    }

    this._mapDataLength = map.width * map.height * map.stride;
    if (map.mapData.length !== this._mapDataLength) {
      throw new MapManagerError(`Map data length (${map.mapData.length}) does not match expected size (${this._mapDataLength})`);
    }

    this._map = map;

    //FIXME should aready be converted in Project
    this._spritePixelArray = convertSpritesheetToIndexArray(map.spriteSheet);
    this._tileIndexMap = this._parseMapData();
    this._mapPixelArray = this._buildMapPixelArray();
  }

  public getMapPixelArray(): Uint8Array {
    return this._mapPixelArray;
  }

  public getTileAt(x: number, y: number): number | undefined {
    if (x < 0 || x >= this._map.width || y < 0 || y >= this._map.height) {
      return undefined;
    }
    return this._tileIndexMap[y][x];
  }

  public setTileAt(x: number, y: number, spriteIndex: number): void {
    if (x < 0 || x >= this._map.width || y < 0 || y >= this._map.height) {
      throw new MapManagerError(`Tile position (${x}, ${y}) is out of bounds`);
    }

    this._tileIndexMap[y][x] = spriteIndex;

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
        const tileIndex = this._tileIndexMap[y][x];
        result += tileIndex.toString(16).padStart(2, "0");
      }
    }
    return result;
  }

  public updateMapData(new_mapData: string): void {
    if (new_mapData.length !== this._mapDataLength) {
      throw new MapManagerError(`New map data length (${new_mapData.length}) does not match expected size (${this._mapDataLength})`);
    }

    this._map.mapData = new_mapData;
    this._tileIndexMap = this._parseMapData();

    this._mapPixelArray = this._buildMapPixelArray();
  }

  // PRIVATE

  private _parseMapData(): number[][] {
    const tiles: number[][] = new Array(this._map.height);

    for (let y = 0; y < this._map.height; y++) {
      tiles[y] = new Array(this._map.width);

      for (let x = 0; x < this._map.width; x++) {
        const dataIndex = (y * this._map.width + x) * this._map.stride;
        const hexValue = this._map.mapData.slice(dataIndex, dataIndex + this._map.stride);
        const tileIndex = parseInt(hexValue, 16);
        tiles[y][x] = tileIndex;
      }
    }

    return tiles;
  }

  private _getSpritePixels(spriteIndex: number): Uint8Array {
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

        if (sheetPixelIndex < this._spritePixelArray.length) {
          spritePixels[spritePixelIndex] = this._spritePixelArray[sheetPixelIndex];
        } else {
          spritePixels[spritePixelIndex] = 0;
        }
      }
    }

    return spritePixels;
  }

  private _buildMapPixelArray(): Uint8Array {
    const totalPixels = this._getMapTotalPixels();

    const mapPixels = new Uint8Array(totalPixels);

    for (let tileY = 0; tileY < this._map.height; tileY++) {
      for (let tileX = 0; tileX < this._map.width; tileX++) {
        const spriteIndex = this._tileIndexMap[tileY][tileX];
        this._copySpriteToMapPixels(tileX, tileY, mapPixels, spriteIndex);
      }
    }

    return mapPixels;
  }

  private _getMapTotalPixels(): number {
    return this._map.width * this._map.height * this._map.spriteSheet.spriteSize.height * this._map.spriteSheet.spriteSize.width;
  }

  private _copySpriteToMapPixels(tileX: number, tileY: number, mapPixels: Uint8Array, spriteIndex: number): void {
    const spriteWidth = this._map.spriteSheet.spriteSize.width;
    const spriteHeight = this._map.spriteSheet.spriteSize.height;
    const mapPixelWidth = this._map.width * spriteWidth;
    const totalPixels = this._getMapTotalPixels();
    const spritePixels = this._getSpritePixels(spriteIndex);

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
