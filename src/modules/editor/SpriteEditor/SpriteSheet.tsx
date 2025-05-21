

import { Sprite, SpriteSize } from "@modules/editor/SpriteEditor/Sprite";

const spritePerSheet = 256
const spriteSheetSize = { width: 16, height: 16 };

export class SpriteSheet {
    private _sprites: Sprite[];

    constructor() {
        this._sprites = [];
        for (let i = 0; i < spritePerSheet; i++) {
            this._sprites.push(new Sprite());
        }
    }

    public toStride(): string {
        return this._sprites.map(sprite => sprite.toStride()).join("\n");
    }

    public draw(x: number, y: number, color: number): void {
        //the x and y are the coordinate of the pixel clicked on
        const spriteX = Math.floor(x / SpriteSize.width);
        const spriteY = Math.floor(y / SpriteSize.height);
        const spriteIndex = spriteX + spriteY * spriteSheetSize.width;
        this._sprites[spriteIndex].setPixel(x % SpriteSize.width, y % SpriteSize.height, color);
    }
}