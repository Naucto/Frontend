import type * as Y from 'yjs';

import { DEFAULT_SPRITE_COLOUR_V0, PICO8_PALETTE } from '../../game/defaults';
import { Game } from '../../game/Game';
import { KEYS, LEGACY_KEYS, MAIN_FILE } from '../../game/keys';
import type { MigrationReport } from '../types';

/** Copies v0 sprite / flag / map / permission / code entries into the v1 keys. */
export function migrateData(doc: Y.Doc, report: MigrationReport): void {
  const sprites = doc.getMap<number>(LEGACY_KEYS.sprites);
  const flags = doc.getMap<number>(LEGACY_KEYS.flags);
  const tiles = doc.getMap<number>(LEGACY_KEYS.tiles);
  const perms = doc.getMap<{ flags: number }>(LEGACY_KEYS.netPermissions);
  const code = doc.getText(LEGACY_KEYS.code);

  const newSprites = doc.getMap<number>(KEYS.sprites);
  const newFlags = doc.getMap<number>(KEYS.flags);
  const newTiles = doc.getMap<number>(KEYS.tiles);
  const newPerms = doc.getMap<{ flags: number }>(KEYS.netPermissions);

  let n = 0;
  sprites.forEach((v, k) => {
    if (v !== 0) {
      newSprites.set(k, v);
      n++;
    }
  });
  report.counts.sprites = n;
  n = 0;
  flags.forEach((v, k) => {
    if (v !== 0) {
      newFlags.set(k, v);
      n++;
    }
  });
  report.counts.flags = n;
  n = 0;
  tiles.forEach((v, k) => {
    if (v !== 0) {
      newTiles.set(k, v);
      n++;
    }
  });
  report.counts.tiles = n;
  n = 0;
  perms.forEach((v, k) => {
    newPerms.set(k, { flags: v.flags });
    n++;
  });
  report.counts.permissions = n;

  // Old games were drawn against PICO-8; keep it so nothing changes colour.
  const game = new Game(doc);
  game.setPalette(PICO8_PALETTE);

  // Code: the single Monaco text becomes the main.lua tab.
  if (game.files.length === 0) {
    game.addFile(MAIN_FILE, code.toString());
    report.counts.codeBytes = code.length;
  }

  // A v0 doc whose sprite slots were never touched still needs the starter moon.
  if (
    game.files.length === 1 &&
    [1, 2, 17, 18].every((i) => game.isSpriteEmpty(i)) &&
    sprites.size === 0
  ) {
    game.seedDefaultSprite(DEFAULT_SPRITE_COLOUR_V0);
  }

  // Clear legacy keys so the old app cannot keep writing them unnoticed.
  sprites.clear();
  flags.clear();
  tiles.clear();
  perms.clear();
  if (code.length) code.delete(0, code.length);
}
