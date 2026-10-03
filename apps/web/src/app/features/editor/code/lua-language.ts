import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { StreamLanguage } from '@codemirror/language';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import type { Extension } from '@codemirror/state';

export const luaLanguage = StreamLanguage.define(lua);

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
  {
    label: '_scanline',
    type: 'function',
    detail: 'function _scanline(y)',
    info: 'Runs 180 times per frame, once per line. Change the palette, the shift or the blank for this line and those below it.',
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
].map((keyword): Completion => ({ label: keyword, type: 'keyword' }));

export interface LuaReferenceEntry {
  /** As a game writes it: `gfx.clear`, `string.format`, or bare for a base function (`pairs`). */
  name: string;
  kind: 'function' | 'value';
  signature: string;
  summary: string;
  params: readonly unknown[];
}

export interface LuaNamespace {
  namespace: string;
  functions: readonly LuaReferenceEntry[];
  values: readonly LuaReferenceEntry[];
}

/** The namespace whose members are globals, written without a table in front. */
const BASE_LIBRARY = 'base';

function completionOf(label: string, entry: LuaReferenceEntry): Completion {
  return {
    label,
    type: entry.kind === 'value' ? 'variable' : 'function',
    detail: entry.signature,
    info: entry.summary,
    apply: entry.kind === 'value' ? label : entry.params.length === 0 ? `${label}()` : `${label}(`,
  };
}

/**
 * Completions over every namespace the reference documents, the console's and standard Lua's
 * alike: `gfx.` or `string.` lists members, a bare word offers namespaces, base functions,
 * keywords and callbacks.
 */
export function luaCompletions(
  context: CompletionContext,
  namespaces: readonly LuaNamespace[],
): CompletionResult | null {
  const member = context.matchBefore(/\b([a-z0-9]+)\.([a-z_]*)$/);
  if (member) {
    const prefix = member.text.split('.')[0] ?? '';
    const from = member.from + prefix.length + 1;
    const found = namespaces.find(
      (candidate) => candidate.namespace === prefix && prefix !== BASE_LIBRARY,
    );
    const options = found
      ? [...found.functions, ...found.values].map((entry) =>
          completionOf(entry.name.slice(prefix.length + 1), entry),
        )
      : [];
    return options.length ? { from, options, validFor: /^[a-z_]*$/ } : null;
  }
  const word = context.matchBefore(/\w+$/);
  if (!word && !context.explicit) {
    return null;
  }
  const from = word?.from ?? context.pos;
  return {
    from,
    options: [
      ...namespaces.flatMap((candidate): Completion[] =>
        candidate.namespace === BASE_LIBRARY
          ? candidate.functions.map((entry) => completionOf(entry.name, entry))
          : [{ label: candidate.namespace, type: 'namespace', detail: `${candidate.namespace}.…` }],
      ),
      ...CALLBACKS,
      ...KEYWORDS,
    ],
    validFor: /^\w*$/,
  };
}

/** `namespaces` is read on every completion, so a reference that loads later is picked up. */
export function luaAutocomplete(namespaces: () => readonly LuaNamespace[]): Extension {
  return autocompletion({
    override: [(ctx) => luaCompletions(ctx, namespaces())],
    activateOnTyping: true,
    icons: false,
  });
}
