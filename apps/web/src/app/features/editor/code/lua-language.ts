import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { StreamLanguage } from '@codemirror/language';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import { LUA_API } from '@naucto/engine';

export const luaLanguage = StreamLanguage.define(lua);

const NAMESPACES = [...new Set(LUA_API.map((e) => e.ns))];
const CALLBACKS: Completion[] = [
  {
    label: '_init',
    type: 'function',
    detail: 'function _init()',
    info: 'Runs once when the game starts.',
  },
  {
    label: '_update',
    type: 'function',
    detail: 'function _update()',
    info: 'Runs 60 times per second. Read input, move things.',
  },
  {
    label: '_draw',
    type: 'function',
    detail: 'function _draw()',
    info: 'Runs after _update. Draw the frame.',
  },
];
const KEYWORDS = [
  'and',
  'break',
  'do',
  'else',
  'elseif',
  'end',
  'false',
  'for',
  'function',
  'if',
  'in',
  'local',
  'nil',
  'not',
  'or',
  'repeat',
  'return',
  'then',
  'true',
  'until',
  'while',
].map((k): Completion => ({ label: k, type: 'keyword' }));

/** Completions for the namespaced API: `gfx.` lists members, bare words offer namespaces, keywords and callbacks. */
export function luaCompletions(context: CompletionContext): CompletionResult | null {
  const member = context.matchBefore(/\b([a-z]+)\.([a-z_]*)$/);
  if (member) {
    const ns = member.text.split('.')[0];
    const from = member.from + (ns?.length ?? 0) + 1;
    const options = LUA_API.filter((e) => e.ns === ns).map((e): Completion => ({
      label: e.name,
      type: 'function',
      detail: e.signature,
      info: e.summary,
      apply: e.signature.includes('()') ? `${e.name}()` : `${e.name}(`,
    }));
    return options.length ? { from, options, validFor: /^[a-z_]*$/ } : null;
  }
  const word = context.matchBefore(/\w+$/);
  if (!word && !context.explicit) return null;
  const from = word?.from ?? context.pos;
  return {
    from,
    options: [
      ...NAMESPACES.map((n): Completion => ({ label: n, type: 'namespace', detail: `${n}.…` })),
      ...CALLBACKS,
      ...KEYWORDS,
    ],
    validFor: /^\w*$/,
  };
}

export const luaAutocomplete = autocompletion({
  override: [luaCompletions],
  activateOnTyping: true,
  icons: false,
});
