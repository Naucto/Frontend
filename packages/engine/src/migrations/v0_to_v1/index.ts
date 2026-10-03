import type * as Y from 'yjs';

import { EditableGame } from '../../game/EditableGame';
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
  const game = new EditableGame(doc);
  for (const file of game.files) {
    migrateCode(file.text, report, file.name);
  }
  game.destroy();
}
