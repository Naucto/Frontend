import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { GAME_SCHEMA_VERSION, KEYS, MAIN_FILE } from './keys';
import { openGame } from './open';

describe('openGame', () => {
  it('opens nothing at all as the starter game', () => {
    const game = openGame(new Uint8Array(0));

    expect(game.files.map((file) => file.name)).toEqual([MAIN_FILE]);
    expect(game.schemaVersion).toBe(GAME_SCHEMA_VERSION);
  });

  it('refuses a document from a newer schema rather than show it wrong', () => {
    const doc = new Y.Doc();
    doc.getMap(KEYS.meta).set('schemaVersion', GAME_SCHEMA_VERSION + 1);

    expect(() => openGame(Y.encodeStateAsUpdate(doc))).toThrow(/newer version/);
  });
});
