import { SpriteSheet } from "./SpriteSheetType";

export type Map = {
    mapData: string;
    width: number;
    height: number;
    spriteSheet: SpriteSheet;
    stride: number;
};
