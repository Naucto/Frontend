import type * as Y from 'yjs';

import {
  DEFAULT_PLAYER_SPRITE,
  DEFAULT_SPRITE_COLOUR_V0,
  PICO8_PALETTE,
} from '../../game/defaults';
import { EditableGame } from '../../game/EditableGame';
import { coordKey } from '../../game/Game';
import { KEYS, LEGACY_KEYS, MAIN_FILE } from '../../game/keys';
import type { MigrationReport } from '../types';
import { V1_ROOTS } from '../v1_to_v2/shape';

/**
 * Where v1's starter player sits on its 128-pixel sheet: sprites 1, 2, 17 and 18, a 16×16 block one
 * sprite in from the left.
 */
const STARTER_ORIGIN = { x: 8, y: 0 };

/** Copies v0 sprite / flag / map / permission / code entries into the v1 keys. */
export function migrateData(doc: Y.Doc, report: MigrationReport): void {
  const sprites = doc.getMap<number>(LEGACY_KEYS.sprites);
  const flags = doc.getMap<number>(LEGACY_KEYS.flags);
  const tiles = doc.getMap<number>(LEGACY_KEYS.tiles);
  const perms = doc.getMap<{ flags: number }>(LEGACY_KEYS.netPermissions);
  const code = doc.getText(LEGACY_KEYS.code);

  const newSprites = doc.getMap<number>(V1_ROOTS.sprites);
  const newFlags = doc.getMap<number>(V1_ROOTS.flags);
  const newTiles = doc.getMap<number>(V1_ROOTS.tiles);
  const newPerms = doc.getMap<{ flags: number }>(KEYS.netPermissions);

  let count = 0;
  sprites.forEach((value, key) => {
    if (value !== 0) {
      newSprites.set(key, value);
      count++;
    }
  });
  report.counts.sprites = count;
  count = 0;
  flags.forEach((value, key) => {
    if (value !== 0) {
      newFlags.set(key, value);
      count++;
    }
  });
  report.counts.flags = count;
  count = 0;
  tiles.forEach((value, key) => {
    if (value !== 0) {
      newTiles.set(key, value);
      count++;
    }
  });
  report.counts.tiles = count;
  count = 0;
  perms.forEach((value, key) => {
    newPerms.set(key, { flags: value.flags });
    count++;
  });
  report.counts.permissions = count;

  // Old games were drawn against PICO-8; keep it so nothing changes colour.
  const game = new EditableGame(doc);
  game.setPalette(PICO8_PALETTE);

  // Code: the single Monaco text becomes the main.lua tab.
  if (game.files.length === 0) {
    game.addFile(MAIN_FILE, code.toString());
    report.counts.codeBytes = code.length;
  }

  // A v0 doc whose sprite slots were never touched still needs the starter moon.
  if (game.files.length === 1 && sprites.size === 0 && newSprites.size === 0) {
    DEFAULT_PLAYER_SPRITE.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === 'a') {
          newSprites.set(
            coordKey(STARTER_ORIGIN.x + x, STARTER_ORIGIN.y + y),
            DEFAULT_SPRITE_COLOUR_V0,
          );
        }
      }
    });
  }
  game.destroy();

  // Clear legacy keys so the old app cannot keep writing them unnoticed.
  sprites.clear();
  flags.clear();
  tiles.clear();
  perms.clear();
  if (code.length) {
    code.delete(0, code.length);
  }
}
