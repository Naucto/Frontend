import { resolve } from 'node:path';

import * as Y from 'yjs';

import { type ApiEntry, fullName, loadApi, withEngine } from '../../../../docs/scripts/api.mjs';
import { EditableGame } from '../game/EditableGame';
import { RecordingBackend } from '../gfx/RecordingBackend';
import { STEP_MS } from '../loop/GameLoop';
import { Engine } from '../runtime/Engine';
import { LUA_API } from './luaApiTable';

const DOCS_API = resolve(import.meta.dirname, '../../../../docs/api');
const namespaces = await loadApi(DOCS_API);

describe('docs manifest parity', () => {
  // The pages hold the prose and the engine the rest: every member has a page, every page a
  // member, and a parameter a page describes is one the engine takes.
  it('pairs every engine member with a page and nothing else', () => {
    expect(withEngine(namespaces, LUA_API).problems).toEqual([]);
  });
});

/**
 * What a game can reach of standard Lua and the reference does not document, each with the reason.
 * A library named here stands for every member of it.
 */
const NOT_DOCUMENTED: Record<string, string> = {
  print: 'the console’s own, documented as sys.log',
  load: 'runs a string as code; a game’s code is its tabs',
  collectgarbage: 'memory is the browser’s to manage',
  require: 'kept only to say that tabs run in order',
  _G: 'the table of globals, for the rare game that walks it',
  _VERSION: 'the string "Lua 5.3"',
  'string.dump': 'turns a function into bytes that nothing in a game loads',
  'string.pack': 'binary packing, with no file or socket for the bytes to go to',
  'string.packsize': 'binary packing, with no file or socket for the bytes to go to',
  'string.unpack': 'binary packing, with no file or socket for the bytes to go to',
  'math.ult': 'unsigned comparison of integers, which a game has no use for',
  'os.setlocale': 'the VM knows only the C locale',
  debug: 'the VM’s introspection; the console already shows an error’s traceback',
  fengari: 'the version strings of the VM the console runs on',
  // fengari installs its io library only where the host has a `process`, under a name it leaves
  // undefined: a test runner has it, a browser does not.
  undefined: 'fengari’s io library, present in Node and not in a browser',
};

const driver = { request: () => 0, cancel: () => undefined };

/**
 * Runs `code` as a whole game for three steps, so an example written as `_update` and `_draw` runs
 * them too, and returns its first error and what it printed.
 */
function play(code: string): { error: string | null; printed: string[] } {
  const game = new EditableGame(new Y.Doc());
  game.seedDefaults();
  const file = game.files[0];
  file?.text.delete(0, file.text.length);
  file?.text.insert(0, code);
  const engine = new Engine({ game, gfx: new RecordingBackend(), driver });
  const errors: string[] = [];
  engine.onError((error) => errors.push(error.message));
  engine.run();
  engine.tick(STEP_MS * 3);
  const printed = engine.console.lines
    .filter((line) => line.level === 'log')
    .map((line) => line.text);
  engine.destroy();
  return { error: errors[0] ?? null, printed };
}

/**
 * Every global a game sees once it is loaded, and every member of every table among them, as
 * `name` or `table.name`. Read in `_init`, after the loader has taken its own names away.
 */
function sandboxGlobals(): Set<string> {
  const { error, printed } = play(
    [
      'function _init()',
      '  for k, v in pairs(_G) do',
      "    if k ~= '_init' then print(tostring(k)) end",
      "    if type(v) == 'table' and v ~= _G then",
      "      for m in pairs(v) do print(tostring(k) .. '.' .. tostring(m)) end",
      '    end',
      '  end',
      'end',
    ].join('\n'),
  );
  expect(error).toBeNull();
  return new Set(printed);
}

/**
 * The lines an example says it prints, from its `-->` comments in order: at the end of a line of
 * code, or alone on a line after a loop that prints several. Several values printed by one call
 * are tab-separated on the console and space-separated in the comment.
 */
const promisedOutput = (example: string): string[] =>
  [...example.matchAll(/-->\s?(.*)$/gm)].map((match) => (match[1] ?? '').trimEnd());

describe('standard Lua docs', () => {
  const standard = namespaces.filter((ns) => ns.standard);
  const entries: { name: string; entry: ApiEntry }[] = standard.flatMap((ns) =>
    [...ns.functions, ...ns.values].map((entry) => ({ name: fullName(ns, entry), entry })),
  );
  // A library's own table is documented by its page, as `math` is by the math functions.
  const documented = new Set([
    ...entries.map(({ name }) => name),
    ...standard.filter((ns) => !ns.globals).map((ns) => ns.namespace),
  ]);
  const engineNamespaces = new Set(LUA_API.map((entry) => entry.ns));
  const globals = sandboxGlobals();
  const excused = (name: string): boolean =>
    name in NOT_DOCUMENTED || (name.split('.')[0] ?? '') in NOT_DOCUMENTED;

  it('documents only what a game can reach', () => {
    expect([...documented].filter((name) => !globals.has(name))).toEqual([]);
  });

  it('documents everything else a game can reach, or says why not', () => {
    const consoleOwn = (name: string): boolean =>
      engineNamespaces.has((name.split('.')[0] ?? '') as never);
    const silent = [...globals].filter(
      (name) => !documented.has(name) && !excused(name) && !consoleOwn(name),
    );
    expect(silent).toEqual([]);
  });

  it('excuses nothing it documents', () => {
    expect(Object.keys(NOT_DOCUMENTED).filter((name) => documented.has(name))).toEqual([]);
  });

  for (const { name, entry } of entries) {
    for (const [i, example] of (entry.examples ?? []).entries()) {
      it(`${name} example ${String(i + 1)} runs and prints what it says`, () => {
        const { error, printed } = play(example);
        expect(error, example).toBeNull();
        expect(
          printed.map((line) => line.replace(/\t/g, ' ')),
          example,
        ).toEqual(promisedOutput(example));
      });
    }
  }
});
