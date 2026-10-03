import { bench, describe } from 'vitest';
import * as Y from 'yjs';

import { EditableGame } from './EditableGame';

/** The renderer's question, asked once per sprite drawn: which sheet holds this number. */
describe('sheetOf on a three-sheet game', () => {
  const game = new EditableGame(new Y.Doc());
  game.addSheet('b', 64, 64, 'b');
  game.addSheet('c', 32, 32, 'c');

  bench('sheetOf(300)', () => {
    game.sheetOf(300);
  });
});
