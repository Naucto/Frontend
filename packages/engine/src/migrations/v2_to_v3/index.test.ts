import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { EditableGame } from '../../game/EditableGame';
import { Game } from '../../game/Game';
import { GAME_SCHEMA_VERSION, KEYS } from '../../game/keys';
import { openGame } from '../../game/open';
import { RecordingBackend } from '../../gfx/RecordingBackend';
import type { ActionInput } from '../../input/actions';
import type { InputSource } from '../../input/InputSource';
import type { InputState } from '../../input/InputState';
import { INPUT_PRESETS } from '../../input/presets';
import { STEP_MS } from '../../loop/GameLoop';
import { Engine } from '../../runtime/Engine';
import { migrateGame, needsMigration } from '../index';

const CODE = [
  'x = 0',
  'function _update()',
  '  if input.held("left") then x = x - 1 end',
  '  if input.held("right", 2) then x = x + 10 end',
  '  if input.pressed("pause") then print("paused at " .. x) end',
  'end',
].join('\n');

/**
 * A game as schema v2 saved it: sheets and maps in their collections, one file, no actions of its
 * own, and on the meta the names its author gave some of the nine.
 */
function v2Doc(labels?: unknown): Y.Doc {
  const doc = new Y.Doc();
  const meta = doc.getMap(KEYS.meta);
  meta.set('schemaVersion', 2);
  if (labels !== undefined) {
    meta.set('actions', labels);
  }
  for (const [root, cells] of [
    [KEYS.sheets, 'pixels'],
    [KEYS.maps, 'tiles'],
  ] as const) {
    const entry = new Y.Map<unknown>();
    doc.getMap<Y.Map<unknown>>(root).set('0', entry);
    entry.set('order', 0);
    entry.set('w', 128);
    entry.set('h', root === KEYS.sheets ? 128 : 32);
    entry.set(cells, new Y.Map<number>());
  }
  const main = new Y.Map<unknown>();
  const text = new Y.Text();
  doc.getMap<Y.Map<unknown>>(KEYS.codeFiles).set('main', main);
  main.set('name', 'main');
  main.set('order', 0);
  main.set('text', text);
  text.insert(0, CODE);

  return doc;
}

const key = (player: 0 | 1, name: string): ActionInput => ({ kind: 'key', player, key: name });

describe('a v2 game brought to v3', () => {
  it('gets the nine actions with the default bindings, named as its author named them', () => {
    const doc = v2Doc([
      { action: 'a', label: 'Jump' },
      { action: 'left', label: ' Walk left ' },
    ]);
    expect(needsMigration(doc)).toBe(true);

    const report = migrateGame(doc);

    expect(report).toMatchObject({
      from: 2,
      to: GAME_SCHEMA_VERSION,
      applied: true,
      warnings: [],
      counts: { actions: 9, actionLabels: 2, reshaped: 0 },
    });
    const game = new Game(doc);
    expect(game.schemaVersion).toBe(GAME_SCHEMA_VERSION);
    expect(doc.getMap(KEYS.meta).has('actions')).toBe(false);
    expect(game.actions.map((action) => [action.id, action.name, action.label])).toEqual([
      ['left', 'left', 'Walk left'],
      ['right', 'right', 'Right'],
      ['up', 'up', 'Up'],
      ['down', 'down', 'Down'],
      ['a', 'a', 'Jump'],
      ['b', 'b', 'B'],
      ['x', 'x', 'X'],
      ['y', 'y', 'Y'],
      ['pause', 'pause', 'Pause'],
    ]);
    const inputsOf = (name: string): readonly ActionInput[] =>
      game.actions.find((action) => action.name === name)?.inputs ?? [];
    expect(inputsOf('left')).toEqual([
      key(0, 'ArrowLeft'),
      key(0, 'a'),
      key(0, 'q'),
      key(1, 'j'),
      { kind: 'pad', control: 'dpad-left' },
      { kind: 'pad', control: 'stick-left' },
    ]);
    expect(inputsOf('b')).toEqual([
      key(0, 'c'),
      key(0, 'Shift'),
      key(1, 'm'),
      { kind: 'pad', control: 'b' },
    ]);
    expect(inputsOf('x')).toEqual([
      key(0, 'v'),
      key(1, ','),
      key(1, ';'),
      { kind: 'pad', control: 'x' },
    ]);
    expect(inputsOf('pause')).toEqual([
      key(0, 'Escape'),
      key(0, 'Enter'),
      key(1, 'p'),
      { kind: 'pad', control: 'start' },
    ]);
    expect(game.files[0]?.text.toString()).toBe(CODE);
    expect(needsMigration(doc)).toBe(false);
  });

  it('names the nine itself for a game that named none', () => {
    const doc = v2Doc();

    expect(migrateGame(doc).counts).toMatchObject({ actions: 9, actionLabels: 0 });
    expect(new Game(doc).actions.map((action) => action.label)).toEqual([
      'Left',
      'Right',
      'Up',
      'Down',
      'A',
      'B',
      'X',
      'Y',
      'Pause',
    ]);
  });

  it('reads past names the meta holds badly', () => {
    const doc = v2Doc([
      { action: 'fire', label: 'Fire' },
      { action: 'b', label: 4 },
      { action: 'x', label: '   ' },
      { action: 'y', label: 'Shoot' },
      'a',
      null,
    ]);

    migrateGame(doc);

    const labels = new Game(doc).actions.map((action) => action.label);
    expect(labels).toEqual(['Left', 'Right', 'Up', 'Down', 'A', 'B', 'X', 'Shoot', 'Pause']);
    expect(migrateGame(v2Doc('nonsense')).counts.actionLabels).toBe(0);
  });

  it('holds what a new game starts with, so both press the same keys for the same names', () => {
    const doc = v2Doc();
    migrateGame(doc);
    const fresh = new EditableGame(new Y.Doc());
    fresh.seedDefaults();

    expect(new Game(doc).actions).toEqual(fresh.actions);
    expect(
      fresh.actions.map(({ name, label, description, inputs }) => ({
        name,
        label,
        description,
        inputs,
      })),
    ).toEqual(INPUT_PRESETS.classic);
  });

  it('plays as it did: its code reads the names it read, from the keys that pressed them', () => {
    const game = openGame(Y.encodeStateAsUpdate(v2Doc()));
    const down = new Set<string>();
    const keyboard: InputSource = {
      attach: () => undefined,
      detach: () => undefined,
      poll: (state: InputState) => {
        state.actions.keys.forEach((keys, player) => {
          state.clearActions(player);
          for (const name of down) {
            state.press(player, keys.get(name) ?? 0, true);
          }
        });
      },
    };
    const engine = new Engine({
      game,
      gfx: new RecordingBackend(),
      inputs: [keyboard],
      driver: { request: () => 0, cancel: () => undefined },
    });
    const x = (): unknown => {
      engine.console.clear();
      down.add('Enter');
      engine.tick(STEP_MS);
      down.delete('Enter');
      engine.tick(STEP_MS);

      return engine.console.lines.at(-1)?.text;
    };
    engine.run();

    down.add('ArrowLeft');
    engine.tick(STEP_MS * 3);
    down.delete('ArrowLeft');
    expect(x()).toBe('paused at -3');

    down.add('q');
    down.add('l');
    engine.tick(STEP_MS * 2);
    down.clear();
    expect(x()).toBe('paused at 15');
    engine.destroy();
  });
});

describe('a v2 game opened to be played', () => {
  it('is migrated in memory and left as it was on disk', () => {
    const bytes = Y.encodeStateAsUpdate(v2Doc([{ action: 'a', label: 'Jump' }]));

    const game = openGame(bytes);

    expect(game.schemaVersion).toBe(GAME_SCHEMA_VERSION);
    expect(game.actions).toHaveLength(9);
    expect(game.actions.find((action) => action.name === 'a')?.label).toBe('Jump');
    const stored = new Y.Doc();
    Y.applyUpdate(stored, bytes);
    expect(stored.getMap(KEYS.meta).get('schemaVersion')).toBe(2);
  });
});
