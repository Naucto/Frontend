import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { luaCompletions, type LuaNamespace, type LuaReferenceEntry } from './lua-language';

const at = (doc: string): CompletionContext =>
  new CompletionContext(EditorState.create({ doc }), doc.length, true);

const entry = (
  name: string,
  params: string[] = [],
  kind: LuaReferenceEntry['kind'] = 'function',
): LuaReferenceEntry => ({
  name,
  kind,
  signature: kind === 'value' ? name : `${name}(${params.join(', ')})`,
  summary: `What ${name} does.`,
  params,
});

const NAMESPACES: readonly LuaNamespace[] = [
  {
    namespace: 'net',
    functions: [entry('net.leave'), entry('net.on', ['event', 'callback'])],
    values: [entry('net.state', [], 'value')],
  },
  { namespace: 'base', functions: [entry('pairs', ['t'])], values: [] },
  { namespace: 'string', functions: [entry('string.format', ['fmt'])], values: [] },
];

const labels = (doc: string): readonly string[] =>
  luaCompletions(at(doc), NAMESPACES)?.options.map((option) => option.label) ?? [];

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

  it('shows the summary the reference gives', () => {
    const result = luaCompletions(at('net.le'), NAMESPACES);

    expect(result?.options.find((option) => option.label === 'leave')?.info).toBe(
      'What net.leave does.',
    );
  });

  it('completes a table member by its name and a function with its parentheses', () => {
    const options = luaCompletions(at('net.'), NAMESPACES)?.options ?? [];

    expect(options.find((option) => option.label === 'state')?.apply).toBe('state');
    expect(options.find((option) => option.label === 'leave')?.apply).toBe('leave()');
    expect(options.find((option) => option.label === 'on')?.apply).toBe('on(');
  });

  it('treats standard Lua like the console: libraries by table, base functions bare', () => {
    expect(labels('pai')).toEqual(expect.arrayContaining(['pairs', 'string', 'net']));
    expect(labels('pai')).not.toContain('base');
    expect(labels('string.fo')).toEqual(['format']);
  });
});
