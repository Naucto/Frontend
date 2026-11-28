import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { aiContext, decodeState, encodeState } from './ai-context';
import { EditableGame } from './EditableGame';

describe("the assistant's reading of a game", () => {
  it('lists the code, the sheets and the rules of a saved state', () => {
    const doc = new Y.Doc();
    const game = new EditableGame(doc);
    game.seedDefaults();
    game.setNetPermission('players.score', 3);
    const copy = decodeState(encodeState(doc));
    const context = aiContext(copy) as {
      code: { name: string }[];
      sheets: { pixels: string }[];
      netPermissions: Record<string, unknown>;
    };
    expect(context.code.map((file) => file.name)).toContain('main');
    expect(context.sheets[0]?.pixels).toMatch(/^[0-9a-f]+$/);
    expect(context.netPermissions['players.score']).toEqual({ flags: 3 });
  });
});
