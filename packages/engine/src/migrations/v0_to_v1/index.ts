import type * as Y from 'yjs';

import { Game } from '../../game/Game';
import { KEYS } from '../../game/keys';
import type { MigrationReport } from '../types';
import { migrateCode } from './code';
import { migrateData } from './data';
import { migrateSound } from './sound';

/**
 * The first schema: namespaced Lua, sprites and tiles under their own keys, sound as instruments
 * and patterns rather than a list of note names.
 */
export function migrateV0ToV1(doc: Y.Doc, report: MigrationReport): void {
  migrateData(doc, report);
  migrateSound(doc, report);
  const game = new Game(doc);
  for (const f of game.files) migrateCode(f.text, report, f.name);
  // Only a game that predates the namespaces needs the deprecating shims, so this belongs to this
  // step and not to the wrapper -- from the wrapper, every later migration would switch the legacy
  // prelude on for a game that never called a legacy global.
  doc.getMap(KEYS.meta).set('compat', true);
}
