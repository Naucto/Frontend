import * as Y from "yjs";
import { DEFAULT_LUA_PROJECT_CODE } from "@shared/lua/defaultProjectCode";

const SPRITE_MAP_NAME = "sprite";
const DEFAULT_PLAYER_SPRITE_INDEX = 1;
const SPRITE_SIZE = 8;
const SPRITE_SHEET_WIDTH = 128;

const DEFAULT_PLAYER_SPRITE = [
  "000cc000",
  "00c77c00",
  "0c7777c0",
  "0c7aa7c0",
  "00cccc00",
  "00666600",
  "00600600",
  "06600660",
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

function seedDefaultPlayerSprite(doc: Y.Doc): void {
  const spriteMap = doc.getMap<number>(SPRITE_MAP_NAME);

  if (!isSpriteEmpty(spriteMap, DEFAULT_PLAYER_SPRITE_INDEX)) {
    return;
  }

  const origin = getSpriteOrigin(DEFAULT_PLAYER_SPRITE_INDEX);

  DEFAULT_PLAYER_SPRITE.forEach((row, y) => {
    [...row].forEach((color, x) => {
      const colorIndex = Number.parseInt(color, 16);
      if (colorIndex === 0) {
        return;
      }

      spriteMap.set(coordToKey(origin.x + x, origin.y + y), colorIndex);
    });
  });
}

export function seedDefaultProjectContent(doc: Y.Doc): void {
  const codeText = doc.getText("monaco");

  if (codeText.length === 0) {
    codeText.insert(0, DEFAULT_LUA_PROJECT_CODE);
    seedDefaultPlayerSprite(doc);
  }
}
