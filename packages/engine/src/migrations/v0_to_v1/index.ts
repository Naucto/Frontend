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
  game.destroy();
  // Only a game that predates the namespaces needs the legacy shims.
  doc.getMap(KEYS.meta).set('compat', true);
}
