import { mapData } from "../../temporary/map.ts";

export class MapProvider implements Disposable {
  public mapData: string;
  public width: number;
  public height: number;
  public stride: number;

  constructor() {
    this.mapData = mapData;
    this.width = 128;
    this.height = 32;
    this.stride = 2;
  }

  [Symbol.dispose](): void {
    throw new Error("Method not implemented.");
  }
}
