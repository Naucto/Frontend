import { DEFAULT_LUA_PROJECT_CODE } from "@shared/lua/defaultProjectCode";

import * as Y from "yjs";

const SPRITE_MAP_NAME = "sprite";
const DEFAULT_PLAYER_SPRITE_INDICES = [1, 2, 17, 18] as const;
const SPRITE_SIZE = 8;
const SPRITE_SHEET_WIDTH = 128;
const PALETTE_YELLOW = 10;

const DEFAULT_PLAYER_SPRITE = [
  "00000aaaaaa00000",
  "0000aaaaaaaaa000",
  "000aa0aaaaaaa000",
  "00aa000aaa000000",
  "00a00000a0000000",
  "0aaa000a00000000",
  "0aaaa0aa00000000",
  "0aaaaaa000000000",
  "0aaaaaa00000000a",
  "0aaaaaaa000000aa",
  "00aaaaaa00000aaa",
  "00aaaaaaa000aaaa",
  "000aaaaaaaaaaaa0",
  "0000aaaaaaaaaa00",
  "00000aaaaaaaa000",
  "0000000000000000",
];

function getSpriteOrigin(spriteIndex: number): Point2D {
  const spritesPerRow = SPRITE_SHEET_WIDTH / SPRITE_SIZE;

  return {
    x: (spriteIndex % spritesPerRow) * SPRITE_SIZE,
    y: Math.floor(spriteIndex / spritesPerRow) * SPRITE_SIZE,
  };
}

function coordToKey(x: number, y: number): string {
  return `${x},${y}`;
}

function isSpriteEmpty(spriteMap: Y.Map<number>, spriteIndex: number): boolean {
  const origin = getSpriteOrigin(spriteIndex);

  for (let y = 0; y < SPRITE_SIZE; y += 1) {
    for (let x = 0; x < SPRITE_SIZE; x += 1) {
      if ((spriteMap.get(coordToKey(origin.x + x, origin.y + y)) ?? 0) !== 0) {
        return false;
      }
    }
  }

  return true;
}

function areDefaultSpriteSlotsEmpty(spriteMap: Y.Map<number>): boolean {
  return DEFAULT_PLAYER_SPRITE_INDICES.every((spriteIndex) => isSpriteEmpty(spriteMap, spriteIndex));
}

function seedSpriteTile(spriteMap: Y.Map<number>, spriteIndex: number, rows: string[]): void {
  const origin = getSpriteOrigin(spriteIndex);

  rows.forEach((row, y) => {
    [...row].forEach((color, x) => {
      if (color !== "a") {
        return;
      }

      spriteMap.set(coordToKey(origin.x + x, origin.y + y), PALETTE_YELLOW);
    });
  });
}

function seedDefaultPlayerSprite(doc: Y.Doc): void {
  const spriteMap = doc.getMap<number>(SPRITE_MAP_NAME);

  if (!areDefaultSpriteSlotsEmpty(spriteMap)) {
    return;
  }

  seedSpriteTile(spriteMap, 1, DEFAULT_PLAYER_SPRITE.slice(0, 8).map((row) => row.slice(0, 8)));
  seedSpriteTile(spriteMap, 2, DEFAULT_PLAYER_SPRITE.slice(0, 8).map((row) => row.slice(8, 16)));
  seedSpriteTile(spriteMap, 17, DEFAULT_PLAYER_SPRITE.slice(8, 16).map((row) => row.slice(0, 8)));
  seedSpriteTile(spriteMap, 18, DEFAULT_PLAYER_SPRITE.slice(8, 16).map((row) => row.slice(8, 16)));
}

export function seedDefaultProjectContent(doc: Y.Doc): void {
  const codeText = doc.getText("monaco");

  if (codeText.length === 0) {
    codeText.insert(0, DEFAULT_LUA_PROJECT_CODE);
    seedDefaultPlayerSprite(doc);
  }
}
