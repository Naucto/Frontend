import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { EditableGame } from './EditableGame';
import { GAME_SCHEMA_VERSION, KEYS } from './keys';
import { encodeState, openState } from './state';

const saved = (): string => {
  const doc = new Y.Doc();
  new EditableGame(doc).seedDefaults();
  return encodeState(doc);
};

describe('a saved state', () => {
  it('opens as a game, and saves what was edited', () => {
    const open = openState(saved());
    expect(open.game.files.map((file) => file.name)).toContain('main');
    open.game.setNetPermission('players', 1);
    const again = openState(open.save());
    expect(again.game.netPermissions.get('players')).toEqual({ flags: 1 });
    open.close();
    again.close();
  });

  it('refuses a save of a newer schema', () => {
    const doc = new Y.Doc();
    doc.getMap(KEYS.meta).set('schemaVersion', GAME_SCHEMA_VERSION + 1);
    expect(() => openState(encodeState(doc))).toThrow(/newer version/);
  });
});
