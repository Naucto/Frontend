import * as Y from 'yjs';

import { isFromFutureSchema, migrateGame } from '../migrations';
import { EditableGame } from './EditableGame';
import type { Game } from './Game';

/**
 * Opens a saved game to be played: migrated and seeded in memory, never written back.
 *
 * Refuses a document from a newer schema, since nothing here writes back and so a newer document
 * could only be shown wrong -- which for a game being played is the whole of it.
 */
export function openGame(bytes: Uint8Array): Game {
  const doc = new Y.Doc();
  if (bytes.byteLength > 0) {
    Y.applyUpdate(doc, bytes);
  }
  if (isFromFutureSchema(doc)) {
    throw new Error('This game needs a newer version of Naucto');
  }
  migrateGame(doc);
  const game = new EditableGame(doc);
  game.seedDefaults();

  return game;
}
