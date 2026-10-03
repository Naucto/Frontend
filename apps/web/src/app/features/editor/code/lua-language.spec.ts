import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { luaCompletions } from './lua-language';

const at = (doc: string): CompletionContext =>
  new CompletionContext(EditorState.create({ doc }), doc.length, true);

const labels = (doc: string): readonly string[] =>
  luaCompletions(at(doc), () => null)?.options.map((o) => o.label) ?? [];

describe('luaCompletions', () => {
  /**
   * The engine looks up four globals on the document, and a game gets none of them from the
   * completions it is offered: an editor that only names three of the four it calls is telling
   * the reader the fourth does not exist.
   */
  it('offers every callback the engine calls', () => {
    expect(labels('function _')).toEqual(
      expect.arrayContaining(['_init', '_update', '_draw', '_scanline']),
    );
  });

  it('reads the documentation from the lookup it is handed', () => {
    const result = luaCompletions(at('gfx.pix'), (name) =>
      name === 'gfx.pixel' ? { summary: 'From the built documentation.', signature: '' } : null,
    );

    expect(result?.options.find((o) => o.label === 'pixel')?.info).toBe(
      'From the built documentation.',
    );
  });
});
