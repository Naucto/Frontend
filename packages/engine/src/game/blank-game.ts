import * as Y from 'yjs';

import { EditableGame } from './EditableGame';

/** A game holding one empty sheet and one empty map at the default sizes, and nothing else. */
export function blankGame(doc: Y.Doc = new Y.Doc()): EditableGame {
  const game = new EditableGame(doc);
  game.seedSheetAndMap();

  return game;
}
